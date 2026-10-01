"""
Bulk Import Service — handles parsing and upserting CSV/Excel for Inventory, Menu Items, and Customers.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from app.core.datetime_utils import utc_now, ensure_naive_utc

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.inventory_service import (
    absorb_deficit_into_new_batch,
    generate_batch_number,
    propagate_latest_batch_prices_to_all_batches,
    reconcile_item_stock_from_batches,
)

from app.models.category import Category
from app.models.supplier import Supplier
from app.models.customer import Customer
from app.models.enums import OrderStatusEnum, PricingModeEnum, MarginTypeEnum, StockChangeTypeEnum
from app.models.inventory_item import InventoryItem
from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.stock_intake import StockIntake
from app.models.stock_ledger import StockLedger
from app.schemas.bulk_operations import BulkImportSummary
from app.services.menu_service import get_outlet_slug, invalidate_outlet_menu
from app.services.cache_service import invalidate_menu_cache


def read_import_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Read CSV or Excel file bytes into a pandas DataFrame."""
    if filename.lower().endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
    elif filename.lower().endswith(".csv"):
        df = pd.read_csv(io.BytesIO(file_bytes))
    else:
        raise ValueError("Unsupported file format. Use .csv, .xlsx, or .xls")
    
    # Normalize column headers
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
    return df


def _get_val(row: pd.Series, col: str, default=None):
    if col not in row or pd.isna(row[col]):
        return default
    val = row[col]
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return default
        return val
    # If pandas parses a barcode like 8901491100519 as float or int
    if isinstance(val, float):
        if val.is_integer():
            return str(int(val))
        return str(val)
    if isinstance(val, int):
        return str(val)
    return str(val) if val is not None else default


def _get_barcode(row: pd.Series, col: str = "barcode") -> str | None:
    val = _get_val(row, col)
    if val is None:
        return None
    val_str = str(val).strip()
    if val_str.endswith(".0"):
        val_str = val_str[:-2]
    val_str = val_str[:100]
    return val_str if val_str else None


def _get_image_url(row: pd.Series) -> str | None:
    # Check known normalized column names (after lowercasing and replacing spaces with _)
    for col in (
        "product_photo_/_image_(optional)",
        "product_photo_/_image",
        "product_photo/image_(optional)",
        "product_photo_(optional)",
        "product_photo",
        "image_url",
        "image_link",
        "photo_url",
        "product_image",
        "image",
        "photo",
    ):
        val = _get_val(row, col)
        if val is not None:
            val_str = str(val).strip()
            if val_str.lower() not in ("none", "nan", "null", ""):
                return val_str[:1024]

    # Fuzzy check: any column containing photo or image
    for col in row.index:
        col_str = str(col).lower()
        if "photo" in col_str or "image" in col_str:
            val = _get_val(row, col)
            if val is not None:
                val_str = str(val).strip()
                if val_str.lower() not in ("none", "nan", "null", ""):
                    return val_str[:1024]

    return None


def _get_hsn(row: pd.Series) -> str | None:
    val = _get_val(row, "hsn_code") or _get_val(row, "hsn")
    if val is None:
        return None
    val_str = str(val).strip()
    if val_str.endswith(".0"):
        val_str = val_str[:-2]
    val_str = val_str[:20]
    return val_str if val_str else None


def _get_phone(row: pd.Series, col: str = "phone") -> str | None:
    val = _get_val(row, col) or _get_val(row, "mobile") or _get_val(row, "contact")
    if val is None:
        return None
    val_str = str(val).strip()
    if val_str.endswith(".0"):
        val_str = val_str[:-2]
    val_str = val_str[:20]
    return val_str if val_str else None


def _get_decimal(row: pd.Series, col: str, default: Decimal | None = None) -> Decimal | None:
    val = _get_val(row, col, None)
    if val is None:
        return default
    try:
        if isinstance(val, str):
            val = val.replace(",", "").replace("₹", "").replace("$", "").strip()
        return Decimal(str(val))
    except Exception:
        return default


def _get_date(row: pd.Series, col: str) -> datetime | None:
    val = _get_val(row, col, None)
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.replace(tzinfo=None) if val.tzinfo else val
    try:
        parsed = pd.to_datetime(val)
        if pd.isna(parsed):
            return None
        dt = parsed.to_pydatetime()
        return dt.replace(tzinfo=None) if dt.tzinfo else dt
    except Exception:
        return None


def _get_bool(row: pd.Series, col: str, default: bool = True) -> bool:
    val = _get_val(row, col, None)
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes", "t", "y")
    return bool(val)


async def _resolve_category(db: AsyncSession, outlet_id: uuid.UUID, category_name: str) -> Category:
    name_strip = str(category_name).strip()[:255] if category_name else "General"
    if not name_strip:
        name_strip = "General"
    res = await db.execute(
        select(Category).where(
            Category.outlet_id == outlet_id,
            Category.name.ilike(name_strip)
        )
    )
    cat = res.scalars().first()
    if not cat:
        cat = Category(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            name=name_strip,
            display_order=0,
        )
        db.add(cat)
        await db.flush()
    return cat


async def _resolve_supplier(db: AsyncSession, outlet_id: uuid.UUID, supplier_name: str) -> Supplier:
    name_strip = str(supplier_name).strip()[:255] if supplier_name else "General Supplier"
    if not name_strip:
        name_strip = "General Supplier"
    res = await db.execute(
        select(Supplier).where(
            Supplier.outlet_id == outlet_id,
            Supplier.name.ilike(name_strip)
        )
    )
    sup = res.scalars().first()
    if not sup:
        sup = Supplier(
            id=uuid.uuid4(),
            outlet_id=outlet_id,
            name=name_strip,
        )
        db.add(sup)
        await db.flush()
    return sup

async def import_inventory(db: AsyncSession, outlet_id: uuid.UUID, file_bytes: bytes, filename: str) -> BulkImportSummary:
    """Import inventory items from CSV/Excel and auto-create MenuItems."""
    outlet_slug = await get_outlet_slug(db, outlet_id)
    df = read_import_file(file_bytes, filename)

    # Normalize header synonyms
    for col in df.columns:
        if col in ("item_name", "product_name"):
            if "name" not in df.columns:
                df.rename(columns={col: "name"}, inplace=True)
            break
    for col in df.columns:
        if col in ("units", "uom", "measurement_unit"):
            if "unit" not in df.columns:
                df.rename(columns={col: "unit"}, inplace=True)
            break
    
    required_cols = {"name", "unit"}
    if not required_cols.issubset(set(df.columns)):
        missing = required_cols - set(df.columns)
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
        
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []
    
    for i, row in df.iterrows():
        row_num = i + 2 # 1-indexed, header is 1
        try:
            async with db.begin_nested():
                name = _get_val(row, "name")
                unit_str = _get_val(row, "unit")
                if not name or not unit_str:
                    raise ValueError("Name or Unit cannot be empty")
                    
                name = str(name).strip()[:255]
                unit = str(unit_str).lower().strip()[:50]
                
                barcode = _get_barcode(row, "barcode")
                
                alt_unit_label = _get_val(row, "alt_unit_label")
                alt_unit_conversion_factor = _get_decimal(row, "alt_unit_conversion_factor")
                alternate_units = []
                if alt_unit_label and alt_unit_conversion_factor:
                    alternate_units.append({
                        "unit_label": str(alt_unit_label).strip()[:50],
                        "conversion_factor": float(alt_unit_conversion_factor)
                    })
                category_name = _get_val(row, "category", "General")
                category_name = str(category_name).strip()[:100] if category_name else "General"
                current_stock = _get_decimal(row, "current_stock") or _get_decimal(row, "current_stock_(batch_total)") or _get_decimal(row, "stock") or Decimal("0.000")
                reorder_threshold = _get_decimal(row, "reorder_threshold") or _get_decimal(row, "min_stock") or Decimal("5.000")
                
                initial_qty = _get_decimal(row, "initial_qty") or _get_decimal(row, "quantity") or _get_decimal(row, "qty")
                total_billed = _get_decimal(row, "total_billed")
                sorted_qty = _get_decimal(row, "sorted_qty")
                cost_per_unit = _get_decimal(row, "cost_per_unit") or _get_decimal(row, "unit_cost") or _get_decimal(row, "cost")
                
                if cost_per_unit is None or cost_per_unit == Decimal("0.00"):
                    if total_billed is not None and total_billed > 0:
                        if sorted_qty is not None and sorted_qty > 0:
                            cost_per_unit = total_billed / sorted_qty
                        elif initial_qty is not None and initial_qty > 0:
                            cost_per_unit = total_billed / initial_qty
                
                if cost_per_unit is None:
                    cost_per_unit = Decimal("0.00")
                
                selling_price_raw = _get_decimal(row, "retail_price") or _get_decimal(row, "selling_price") or _get_decimal(row, "price")
                selling_price = selling_price_raw.quantize(Decimal("1"), rounding=ROUND_HALF_UP) if selling_price_raw is not None else None
                mrp_raw = _get_decimal(row, "mrp")
                mrp = mrp_raw.quantize(Decimal("1"), rounding=ROUND_HALF_UP) if mrp_raw is not None else None
                wholesale_price_raw = _get_decimal(row, "wholesale_price")
                wholesale_price = wholesale_price_raw.quantize(Decimal("1"), rounding=ROUND_HALF_UP) if wholesale_price_raw is not None else None
                tax_category = _get_val(row, "tax_category", "GST 0%")
                tax_rate = _get_decimal(row, "tax_rate", Decimal("0.00"))
                hsn_code = _get_hsn(row)
                shelf_life_alert_hrs_raw = _get_val(row, "shelf_life_alert_hrs")
                shelf_life_alert_hrs = None
                if shelf_life_alert_hrs_raw is not None:
                    try:
                        shelf_life_alert_hrs = int(float(shelf_life_alert_hrs_raw))
                    except Exception:
                        shelf_life_alert_hrs = None
                
                margin_type_str = _get_val(row, "margin_type", "MARKUP")
                try:
                    margin_type = MarginTypeEnum(str(margin_type_str).upper()) if margin_type_str else MarginTypeEnum.MARKUP
                except ValueError:
                    margin_type = MarginTypeEnum.MARKUP
                    
                retail_margin_pct = _get_decimal(row, "retail_margin_pct")
                mrp_margin_pct = _get_decimal(row, "mrp_margin_pct")
                wholesale_margin_pct = _get_decimal(row, "wholesale_margin_pct")

                if cost_per_unit > Decimal("0.00"):
                    def calc_price(margin_pct: Decimal | None) -> Decimal | None:
                        if margin_pct is None:
                            return None
                        if margin_type == MarginTypeEnum.MARKUP:
                            return (cost_per_unit + (cost_per_unit * margin_pct / Decimal("100"))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                        elif margin_type == MarginTypeEnum.MARGIN:
                            if margin_pct >= Decimal("100"):
                                return None
                            return (cost_per_unit / (Decimal("1") - margin_pct / Decimal("100"))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                        return None

                    if selling_price is None and retail_margin_pct is not None:
                        selling_price = calc_price(retail_margin_pct)
                    if mrp is None and mrp_margin_pct is not None:
                        mrp = calc_price(mrp_margin_pct)
                    if wholesale_price is None and wholesale_margin_pct is not None:
                        wholesale_price = calc_price(wholesale_margin_pct)
                
                # 1. Upsert InventoryItem
                res = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.outlet_id == outlet_id,
                        InventoryItem.name.ilike(name)
                    )
                )
                inv_item = res.scalars().first()
                if not inv_item and barcode:
                    res_bc = await db.execute(
                        select(InventoryItem).where(
                            InventoryItem.outlet_id == outlet_id,
                            InventoryItem.barcode == barcode
                        )
                    )
                    inv_item = res_bc.scalars().first()

                batch_number_raw = _get_val(row, "batch_number") or _get_val(row, "batch") or _get_val(row, "batch_no")

                has_existing_batches = False
                if inv_item:
                    has_b_res = await db.execute(
                        select(func.count(StockIntake.id)).where(StockIntake.item_id == inv_item.id)
                    )
                    has_existing_batches = (has_b_res.scalar() or 0) > 0

                has_initial_qty = initial_qty is not None and initial_qty > Decimal("0.000")
                is_inwarding = False
                intake_qty = Decimal("0.000")
                initial_intake_qty = Decimal("0.000")

                if has_initial_qty:
                    intake_qty = sorted_qty if (sorted_qty is not None and sorted_qty > Decimal("0.000")) else initial_qty
                    initial_intake_qty = initial_qty
                    is_inwarding = True
                elif current_stock > Decimal("0.000") and (not inv_item or not has_existing_batches):
                    intake_qty = current_stock
                    initial_intake_qty = current_stock
                    is_inwarding = True
                
                if inv_item:
                    inv_item.name = name
                    inv_item.unit = unit
                    inv_item.category = category_name
                    inv_item.reorder_threshold = reorder_threshold
                    inv_item.cost_per_unit = cost_per_unit
                    inv_item.retail_price = selling_price
                    inv_item.mrp = mrp
                    inv_item.wholesale_price = wholesale_price
                    inv_item.margin_type = margin_type
                    inv_item.retail_margin_pct = retail_margin_pct
                    inv_item.mrp_margin_pct = mrp_margin_pct
                    inv_item.wholesale_margin_pct = wholesale_margin_pct
                    inv_item.tax_category = tax_category
                    inv_item.tax_rate = tax_rate
                    inv_item.shelf_life_alert_hrs = shelf_life_alert_hrs
                    if barcode:
                        inv_item.barcode = barcode
                    if alternate_units:
                        inv_item.alternate_units = alternate_units
                    if hsn_code:
                        inv_item.hsn_code = str(hsn_code).strip()

                    if not is_inwarding:
                        if has_existing_batches:
                            await reconcile_item_stock_from_batches(db, inv_item.id)
                        else:
                            inv_item.current_stock = current_stock

                    updated_count += 1
                else:
                    inv_item = InventoryItem(
                        id=uuid.uuid4(),
                        outlet_id=outlet_id,
                        name=name,
                        barcode=barcode,
                        unit=unit,
                        category=category_name,
                        current_stock=intake_qty if is_inwarding else Decimal("0.000"),
                        reorder_threshold=reorder_threshold,
                        cost_per_unit=cost_per_unit,
                        retail_price=selling_price,
                        mrp=mrp,
                        wholesale_price=wholesale_price,
                        margin_type=margin_type,
                        retail_margin_pct=retail_margin_pct,
                        mrp_margin_pct=mrp_margin_pct,
                        wholesale_margin_pct=wholesale_margin_pct,
                        tax_category=tax_category,
                        tax_rate=tax_rate,
                        shelf_life_alert_hrs=shelf_life_alert_hrs,
                        alternate_units=alternate_units or [],
                        hsn_code=str(hsn_code).strip() if hsn_code else None,
                        is_active=True,
                    )
                    db.add(inv_item)
                    created_count += 1
                    
                await db.flush()
                
                # 1b. Create StockIntake & StockLedger if inwarding stock
                if is_inwarding and intake_qty > Decimal("0.000"):
                    supplier_name = _get_val(row, "supplier") or _get_val(row, "supplier_name")
                    supplier_id = None
                    if supplier_name:
                        sup = await _resolve_supplier(db, outlet_id, str(supplier_name).strip())
                        supplier_id = sup.id
                    
                    expiry_date = _get_date(row, "expiry_date")
                    batch_num = str(batch_number_raw).strip() if batch_number_raw and str(batch_number_raw).strip() else generate_batch_number()
                    
                    batch = StockIntake(
                        id=uuid.uuid4(),
                        outlet_id=outlet_id,
                        item_id=inv_item.id,
                        batch_number=batch_num,
                        quantity=intake_qty,
                        initial_quantity=initial_intake_qty,
                        remaining_quantity=intake_qty,
                        unit_cost=cost_per_unit,
                        retail_price=selling_price,
                        mrp=mrp,
                        wholesale_price=wholesale_price,
                        supplier_id=supplier_id,
                        intake_date=utc_now(),
                        expiry_date=ensure_naive_utc(expiry_date),
                    )
                    db.add(batch)
                    await db.flush()

                    await absorb_deficit_into_new_batch(db, outlet_id, inv_item, batch, user_id=None)
                    await reconcile_item_stock_from_batches(db, inv_item.id)
                    
                    ledger = StockLedger(
                        id=uuid.uuid4(),
                        outlet_id=outlet_id,
                        item_id=inv_item.id,
                        intake_id=batch.id,
                        batch_balance=batch.remaining_quantity,
                        change_type=StockChangeTypeEnum.INTAKE,
                        quantity_change=intake_qty,
                        resulting_stock=inv_item.current_stock,
                        reference_order_id=None,
                        unit_cost_snapshot=cost_per_unit,
                    )
                    db.add(ledger)
                    
                    await db.flush()

                    # Propagate latest batch prices if outlet setting is ON
                    from app.models.outlet import Outlet
                    outlet_obj = await db.get(Outlet, outlet_id)
                    if outlet_obj and outlet_obj.latest_batch_price_override:
                        await propagate_latest_batch_prices_to_all_batches(db, inv_item.id, outlet_id, batch)
                
                # 2. Resolve Category
                category = await _resolve_category(db, outlet_id, category_name)
                
                # 3. Upsert MenuItem
                mi_res = await db.execute(
                    select(MenuItem).where(
                        MenuItem.outlet_id == outlet_id,
                        MenuItem.inventory_item_id == inv_item.id
                    )
                )
                menu_item = mi_res.scalars().first()
                if not menu_item:
                    mi_name_res = await db.execute(
                        select(MenuItem).where(
                            MenuItem.outlet_id == outlet_id,
                            MenuItem.name.ilike(name)
                        )
                    )
                    menu_item = mi_name_res.scalars().first()
                    if menu_item:
                        menu_item.inventory_item_id = inv_item.id
                
                # Determine price: selling_price > mrp > cost_per_unit > 0
                final_price = selling_price if selling_price is not None else (mrp if mrp is not None else cost_per_unit)
                if final_price is None or final_price < Decimal("0.00"):
                    final_price = Decimal("0.00")
                
                image_url = _get_image_url(row)
                if menu_item:
                    menu_item.name = name
                    menu_item.category_id = category.id
                    menu_item.price = final_price
                    menu_item.mrp = mrp
                    menu_item.wholesale_price = wholesale_price
                    menu_item.tax_category = tax_category
                    menu_item.tax_rate = tax_rate
                    menu_item.unit_label = unit.lower()
                    if alternate_units:
                        menu_item.alternate_units = alternate_units
                    if barcode:
                        menu_item.barcode = barcode
                    if image_url:
                        menu_item.image_url = image_url
                    if hsn_code:
                        menu_item.hsn_code = str(hsn_code).strip()
                else:
                    menu_item = MenuItem(
                        id=uuid.uuid4(),
                        outlet_id=outlet_id,
                        category_id=category.id,
                        inventory_item_id=inv_item.id,
                        name=name,
                        barcode=barcode,
                        image_url=image_url,
                        price=final_price,
                        mrp=mrp,
                        wholesale_price=wholesale_price,
                        tax_category=tax_category,
                        tax_rate=tax_rate,
                        hsn_code=str(hsn_code).strip() if hsn_code else None,
                        is_available=True,
                        is_verification_required=False,
                        pricing_mode=PricingModeEnum.FIXED_UNIT,
                        unit_label=unit.lower(),
                        alternate_units=alternate_units
                    )
                    db.add(menu_item)
                    
                await db.flush()
                if inv_item and (selling_price is not None or mrp is not None or wholesale_price is not None):
                    from app.models.outlet import Outlet as OutletModel
                    outlet_check = await db.get(OutletModel, outlet_id)
                    if outlet_check and outlet_check.latest_batch_price_override:
                        # Override is ON: propagate prices to ALL active batches
                        from app.services.inventory_service import propagate_item_prices_to_all_batches
                        await propagate_item_prices_to_all_batches(
                            db,
                            inv_item.id,
                            outlet_id,
                            retail_price=selling_price,
                            mrp=mrp,
                            wholesale_price=wholesale_price,
                        )
                    else:
                        # Override is OFF: only update the oldest active batch (FIFO behavior)
                        from app.services.inventory_service import sync_oldest_batch_prices_from_item
                        await sync_oldest_batch_prices_from_item(
                            db,
                            inv_item.id,
                            outlet_id,
                            retail_price=selling_price,
                            mrp=mrp,
                            wholesale_price=wholesale_price,
                        )
        except Exception as e:
            skipped_count += 1
            errors.append({"row": row_num, "field": "N/A", "message": str(e)})    # Commit successful rows
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e

    # Invalidate menu cache directly without extra DB queries
    try:
        if outlet_slug:
            await invalidate_menu_cache(outlet_slug)
    except Exception:
        pass

    return BulkImportSummary(
        total_rows=len(df),
        created=created_count,
        updated=updated_count,
        skipped=skipped_count,
        errors=errors
    )


async def import_menu_items(db: AsyncSession, outlet_id: uuid.UUID, file_bytes: bytes, filename: str) -> BulkImportSummary:
    """Import menu items from CSV/Excel directly (no inventory linkage)."""
    outlet_slug = await get_outlet_slug(db, outlet_id)
    df = read_import_file(file_bytes, filename)

    # Normalize header synonyms
    for col in df.columns:
        if col in ("item_name", "product_name"):
            df.rename(columns={col: "name"}, inplace=True)
            break
    for col in df.columns:
        if col in ("categories", "group", "item_group"):
            df.rename(columns={col: "category"}, inplace=True)
            break
    for col in df.columns:
        if col in ("selling_price", "rate", "retail_price"):
            if "price" not in df.columns:
                df.rename(columns={col: "price"}, inplace=True)
            break
    
    required_cols = {"name", "category", "price"}
    if not required_cols.issubset(set(df.columns)):
        missing = required_cols - set(df.columns)
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
        
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []
    
    for i, row in df.iterrows():
        row_num = i + 2
        try:
            async with db.begin_nested():
                name = _get_val(row, "name")
                category_name = _get_val(row, "category")
                price = _get_decimal(row, "price")
                
                if not name or not category_name or price is None:
                    raise ValueError("Name, Category, and Price cannot be empty")
                    
                name = str(name).strip()[:255]
                category_name = str(category_name).strip()[:100]
                price = price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                
                barcode = _get_barcode(row, "barcode")
                image_url = _get_image_url(row)
                description = _get_val(row, "description")
                if description:
                    description = str(description).strip()
                
                mrp_raw = _get_decimal(row, "mrp")
                mrp = mrp_raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if mrp_raw is not None else None
                wholesale_price_raw = _get_decimal(row, "wholesale_price")
                wholesale_price = wholesale_price_raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if wholesale_price_raw is not None else None
                evening_price_raw = _get_decimal(row, "evening_price")
                evening_price = evening_price_raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if evening_price_raw is not None else None
                offer_price_raw = _get_decimal(row, "offer_price")
                offer_price = offer_price_raw.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if offer_price_raw is not None else None
                
                offer_label = _get_val(row, "offer_label")
                if offer_label:
                    offer_label = str(offer_label).strip()[:255]
                
                tax_category = _get_val(row, "tax_category", "GST 0%")
                if tax_category:
                    tax_category = str(tax_category).strip()[:100]
                tax_rate = _get_decimal(row, "tax_rate", Decimal("0.00"))
                hsn_code = _get_hsn(row)
                
                pm_str = _get_val(row, "pricing_mode", "FIXED_UNIT")
                try:
                    pricing_mode = PricingModeEnum(pm_str.upper())
                except ValueError:
                    pricing_mode = PricingModeEnum.FIXED_UNIT
                    
                unit_label = _get_val(row, "unit_label", "piece")
                if unit_label:
                    unit_label = str(unit_label).lower().strip()[:50]
                is_available = _get_bool(row, "is_available", True)
                
                alt_unit_label = _get_val(row, "alt_unit_label")
                alt_unit_conversion_factor = _get_decimal(row, "alt_unit_conversion_factor")
                alternate_units = []
                if alt_unit_label and alt_unit_conversion_factor:
                    alternate_units.append({
                        "unit_label": str(alt_unit_label).strip()[:50],
                        "conversion_factor": float(alt_unit_conversion_factor)
                    })
                
                is_on_offer = False
                if offer_price is not None and offer_price > Decimal("0.00"):
                    is_on_offer = True

                # 1. Resolve Category
                category = await _resolve_category(db, outlet_id, category_name)
                
                # 2. Upsert MenuItem
                mi_res = await db.execute(
                    select(MenuItem).where(
                        MenuItem.outlet_id == outlet_id,
                        MenuItem.name.ilike(name)
                    )
                )
                menu_item = mi_res.scalars().first()
                if not menu_item and barcode:
                    bc_res = await db.execute(
                        select(MenuItem).where(
                            MenuItem.outlet_id == outlet_id,
                            MenuItem.barcode == barcode
                        )
                    )
                    menu_item = bc_res.scalars().first()
                
                if menu_item:
                    menu_item.category_id = category.id
                    menu_item.name = name
                    if barcode:
                        menu_item.barcode = barcode
                    if image_url:
                        menu_item.image_url = image_url
                    menu_item.description = description
                    menu_item.price = price
                    menu_item.mrp = mrp
                    menu_item.wholesale_price = wholesale_price
                    menu_item.evening_price = evening_price
                    menu_item.offer_price = offer_price
                    menu_item.offer_label = offer_label
                    menu_item.is_on_offer = is_on_offer
                    menu_item.tax_category = tax_category
                    menu_item.tax_rate = tax_rate
                    if hsn_code:
                        menu_item.hsn_code = hsn_code
                    menu_item.pricing_mode = pricing_mode
                    menu_item.unit_label = unit_label
                    if alternate_units:
                        menu_item.alternate_units = alternate_units
                    menu_item.is_available = is_available
                    updated_count += 1
                else:
                    menu_item = MenuItem(
                        id=uuid.uuid4(),
                        outlet_id=outlet_id,
                        category_id=category.id,
                        inventory_item_id=None,
                        name=name,
                        barcode=barcode,
                        image_url=image_url,
                        description=description,
                        price=price,
                        mrp=mrp,
                        wholesale_price=wholesale_price,
                        evening_price=evening_price,
                        offer_price=offer_price,
                        offer_label=offer_label,
                        is_on_offer=is_on_offer,
                        tax_category=tax_category,
                        tax_rate=tax_rate,
                        hsn_code=hsn_code,
                        pricing_mode=pricing_mode,
                        unit_label=unit_label,
                        alternate_units=alternate_units,
                        is_available=is_available,
                        is_verification_required=False,
                    )
                    db.add(menu_item)
                    created_count += 1
                    
                await db.flush()
                if menu_item and menu_item.inventory_item_id:
                    inv_res = await db.execute(
                        select(InventoryItem).where(InventoryItem.id == menu_item.inventory_item_id)
                    )
                    inv_obj = inv_res.scalar_one_or_none()
                    if inv_obj:
                        if price is not None:
                            inv_obj.retail_price = price
                        if mrp is not None:
                            inv_obj.mrp = mrp
                        if wholesale_price is not None:
                            inv_obj.wholesale_price = wholesale_price
                        from app.services.inventory_service import sync_oldest_batch_prices_from_item
                        await sync_oldest_batch_prices_from_item(
                            db,
                            inv_obj.id,
                            outlet_id,
                            retail_price=price,
                            mrp=mrp,
                            wholesale_price=wholesale_price,
                        )
        except Exception as e:
            skipped_count += 1
            errors.append({"row": row_num, "field": "N/A", "message": str(e)})

    # Commit successful rows
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e

    # Invalidate menu cache directly without extra DB queries
    try:
        if outlet_slug:
            await invalidate_menu_cache(outlet_slug)
    except Exception:
        pass

    return BulkImportSummary(
        total_rows=len(df),
        created=created_count,
        updated=updated_count,
        skipped=skipped_count,
        errors=errors
    )


async def import_customers(db: AsyncSession, outlet_id: uuid.UUID, file_bytes: bytes, filename: str) -> BulkImportSummary:
    """Import customers from CSV/Excel, and optionally create a legacy order for historical spend."""
    df = read_import_file(file_bytes, filename)

    # Normalize header synonyms
    for col in df.columns:
        if col in ("mobile", "contact", "phone_number", "mobile_number", "cell"):
            df.rename(columns={col: "phone"}, inplace=True)
            break
    for col in df.columns:
        if col in ("customer_name", "full_name"):
            df.rename(columns={col: "name"}, inplace=True)
            break
    
    required_cols = {"phone", "name"}
    if not required_cols.issubset(set(df.columns)):
        missing = required_cols - set(df.columns)
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
        
    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors = []
    
    LEGACY_DATE = datetime(2004, 2, 10, 0, 0, 0)
    
    for i, row in df.iterrows():
        row_num = i + 2
        try:
            async with db.begin_nested():
                phone = _get_phone(row, "phone")
                name = _get_val(row, "name")
                
                if not phone or not name:
                    raise ValueError("Phone and Name cannot be empty")
                    
                phone = str(phone).strip()[:20]
                name = str(name).strip()[:255]
                
                loyalty_points = 0
                lp_val = _get_val(row, "loyalty_points")
                if lp_val is not None:
                    try:
                        loyalty_points = int(float(lp_val))
                    except (ValueError, TypeError):
                        pass
                        
                historical_spend = _get_decimal(row, "historical_spend", Decimal("0.00"))
                gstin = _get_val(row, "gstin")
                legal_name = _get_val(row, "legal_name")
                state_code = _get_val(row, "state_code")
                address = _get_val(row, "address")
                city = _get_val(row, "city")
                state = _get_val(row, "state")
                
                # 1. Upsert Customer
                cust_res = await db.execute(
                    select(Customer).where(
                        Customer.outlet_id == outlet_id,
                        Customer.phone == phone
                    )
                )
                customer = cust_res.scalars().first()
                
                if customer:
                    customer.name = name
                    customer.loyalty_points = loyalty_points
                    if gstin:
                        customer.gstin = str(gstin).strip().upper()[:50]
                    if legal_name:
                        customer.legal_name = str(legal_name).strip()[:255]
                    if state_code:
                        customer.state_code = str(state_code).strip()[:10]
                    if address:
                        customer.address = str(address).strip()[:500]
                    if city:
                        customer.city = str(city).strip()[:100]
                    if state:
                        customer.state = str(state).strip()[:100]
                    updated_count += 1
                else:
                    customer = Customer(
                        id=uuid.uuid4(),
                        outlet_id=outlet_id,
                        name=name,
                        phone=phone,
                        loyalty_points=loyalty_points,
                        gstin=str(gstin).strip().upper()[:50] if gstin else None,
                        legal_name=str(legal_name).strip()[:255] if legal_name else None,
                        state_code=str(state_code).strip()[:10] if state_code else None,
                        address=str(address).strip()[:500] if address else None,
                        city=str(city).strip()[:100] if city else None,
                        state=str(state).strip()[:100] if state else None,
                    )
                    db.add(customer)
                    created_count += 1
                    
                await db.flush()
                
                # 2. Legacy Order Logic
                if historical_spend is not None and historical_spend > Decimal("0.00"):
                    order_res = await db.execute(
                        select(Order).where(
                            Order.customer_id == customer.id,
                            Order.source == "legacy_import"
                        )
                    )
                    legacy_order = order_res.scalars().first()
                    
                    if legacy_order:
                        legacy_order.total_amount = historical_spend
                        legacy_order.subtotal_amount = historical_spend
                        legacy_order.customer_name = customer.name
                        legacy_order.customer_phone = customer.phone
                    else:
                        new_order = Order(
                            id=uuid.uuid4(),
                            outlet_id=outlet_id,
                            session_id=None,
                            customer_id=customer.id,
                            basket_number="LEGACY-IMPORT",
                            customer_name=customer.name,
                            customer_phone=customer.phone,
                            total_amount=historical_spend,
                            subtotal_amount=historical_spend,
                            tax_amount=Decimal("0.00"),
                            status=OrderStatusEnum.COMPLETED,
                            source="legacy_import",
                            payment_method="legacy",
                            is_auto_verified=True,
                            created_at=LEGACY_DATE,
                            updated_at=LEGACY_DATE,
                            finalized_at=LEGACY_DATE,
                            paid_at=LEGACY_DATE,
                            confirmed_offline=False,
                            delivery_charge=Decimal("0.00"),
                            handling_charge=Decimal("0.00"),
                            loyalty_points_earned=0,
                            loyalty_points_redeemed=0,
                        )
                        db.add(new_order)
                
                await db.flush()
                
        except Exception as e:
            skipped_count += 1
            errors.append({"row": row_num, "field": "N/A", "message": str(e)})

    # Commit successful rows
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise e

    return BulkImportSummary(
        total_rows=len(df),
        created=created_count,
        updated=updated_count,
        skipped=skipped_count,
        errors=errors
    )
