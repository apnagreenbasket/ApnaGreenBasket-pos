import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { parseUTCDate } from "./api";
import { OrderResponse } from "@/types";
import QRCode from "qrcode";

// Thermal Receipt Data Types


// Helper to safely fetch an image and convert it to Base64 (bypassing canvas CORS issues for relative paths)
async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch image");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface ReceiptPdfData {
  invoice_no?: string;
  order_id: string;
  basket_number: string;
  created_at?: string;
  date_time?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  customer_legal_name?: string;
  is_interstate?: boolean;
  place_of_supply?: string;
  total_amount: string | number;
  cash_amount?: number;
  upi_amount?: number;
  payment_method?: string;
  payment_reference?: string;
  delivery_charge?: number;
  handling_charge?: number;
  subtotal_without_tax?: number;
  total_tax?: number;
  cgst?: number;
  sgst?: number;
  items: Array<{
    menu_item_id?: string;
    item_name?: string;
    quantity: number;
    unit_price: string | number;
    line_total?: string | number;
    mrp?: number | string;
    is_complimentary?: boolean;
    tax_rate?: number | string | null;
    item_tax_rate?: number | string | null;
    hsn_code?: string | null;
  }>;
  restaurant?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    fssai_no?: string;
    logo_url?: string;
    bill_qr_url?: string;
    place_of_supply?: string;
  };
  discount_type?: string;
  discount_value?: string | number;
  customer?: {
    name?: string;
    phone?: string;
    gstin?: string;
    legal_name?: string;
  };
}

export async function generateReceiptPDF(
  order: OrderResponse | ReceiptPdfData,
  restaurantName: string = "Outlet Receipt",
  menuItemsMap?: Record<string, { name: string; price?: string; tax_rate?: number | string | null; tax_category?: string | null; unit_label?: string; unit?: string; hsn_code?: string | null }>,
  storeDetailsOrAction?: any,
  actionOpt: "download" | "view" = "download"
) {
  let storeDetails: any = undefined;
  let action: "download" | "view" = actionOpt;

  if (typeof storeDetailsOrAction === "string") {
    if (storeDetailsOrAction === "download" || storeDetailsOrAction === "view") {
      action = storeDetailsOrAction;
    }
  } else if (typeof storeDetailsOrAction === "object" && storeDetailsOrAction !== null) {
    storeDetails = storeDetailsOrAction;
  }

  // Pure Monospaced Courier Thermal POS Format (80mm Paper)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, 297], // Extended length to accommodate more content
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 80mm
  const margin = 4;
  const contentWidth = pageWidth - margin * 2; // 72mm

  let y = 8;

  // Helper for drawing dashed divider line
  const drawDashedLine = (posY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, posY, pageWidth - margin, posY);
    doc.setLineDashPattern([], 0);
  };

  // Helper for drawing solid double divider line
  const drawSolidLine = (posY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(margin, posY, pageWidth - margin, posY);
  };

  // 1. STORE HEADER BLOCK (Centered, Courier Bold)
  const getOutletField = (field: string) => {
    return storeDetails?.[field] || (order as any).restaurant?.[field] || (order as any).outlet?.[field];
  };

  const logoUrl = getOutletField("logo_url");
  
  // Try to load image if provided
  if (logoUrl) {
    try {
      // Timeout for image loading
      const base64Img = await Promise.race([
        fetchImageAsBase64(logoUrl),
        new Promise<string>((_, reject) => setTimeout(() => reject("Timeout"), 3000))
      ]);
      
      const imgWidth = 20;
      const imgHeight = 20;
      // We don't know if it's PNG or JPEG from base64 string directly without parsing, 
      // but jsPDF accepts the base64 string directly in addImage if formatted correctly.
      doc.addImage(base64Img, (pageWidth - imgWidth) / 2, y, imgWidth, imgHeight);
      y += imgHeight + 4;
    } catch (e) {
      console.warn("Failed to load logo", e);
      // Skip logo on failure
    }
  }

  const rawStoreName =
    getOutletField("name") ||
    (restaurantName && restaurantName !== "Outlet Receipt" && restaurantName !== "ApnaGreen Basket" && restaurantName !== "APNAGREEN BASKET" ? restaurantName : null) ||
    "ApnaGreen Basket";
  const storeName = rawStoreName;

  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(storeName, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });

  y += 4;
  const addressStr = getOutletField("address");
  if (addressStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.text(addressStr, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += 3.5;
  }
  
  const billQrUrlRaw = getOutletField("bill_qr_url");
  if (billQrUrlRaw) {
    try {
      const parsedUrl = new URL(billQrUrlRaw);
      doc.setFont("courier", "normal");
      doc.setFontSize(7);
      doc.text(parsedUrl.hostname, pageWidth / 2, y, { align: "center" });
      y += 3.5;
    } catch {
      // Ignore if not a valid URL
    }
  }

  const fssai = getOutletField("fssai_no");
  if (fssai) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`FSSAI Reg No: ${fssai}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }

  const gstin = getOutletField("gstin") || "01AAFCB7044K1ZV";
  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  doc.text(`GSTIN: ${gstin}`, pageWidth / 2, y, { align: "center" });
  y += 3.5;
  
  const phoneStr = getOutletField("phone");
  if (phoneStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`Phone: ${phoneStr}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }
  
  const emailStr = getOutletField("email");
  if (emailStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`Email: ${emailStr}`, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += 3.5;
  }

  y -= 1; // Adjust spacing before dashed line
  drawDashedLine(y);

  // 2. CASH MEMO TITLE & BILL METADATA (Grid Aligned)
  y += 4;
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("TAX INVOICE", pageWidth / 2, y, { align: "center" });

  y += 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);

  const invoiceNo = (order as any).invoice_no || (order as any).id?.slice(0, 8).toUpperCase() || "RECEIPT";
  let orderDateStr = (order as any).date_time;
  if (!orderDateStr && (order as any).created_at) {
    const d = parseUTCDate((order as any).created_at);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');
    orderDateStr = `${day}/${month}/${year}, ${formattedHours}:${minutes} ${ampm}`;
  }
  
  doc.text(`Bill No : #${invoiceNo}`, margin, y);
  
  y += 3.5;
  doc.text(`Date    : ${orderDateStr || "N/A"}`, margin, y);

  y += 3.5;
  const guestName = (order as any).customer?.name || (order as any).customer_name || "Walk-In";
  doc.text(`Customer: ${guestName}`, margin, y);
  
  const guestPhone = (order as any).customer?.phone || (order as any).customer_phone;
  if (guestPhone) {
    doc.text(`Mob: ${guestPhone}`, pageWidth - margin, y, { align: "right" });
  }

  const custGstin = (order as any).customer_gstin || (order as any).customer?.gstin;
  const custLegalName = (order as any).customer_legal_name || (order as any).customer?.legal_name;
  if (custGstin) {
    y += 3.5;
    doc.text(`GSTIN   : ${custGstin}`, margin, y);
  }
  if (custLegalName && custLegalName !== guestName) {
    y += 3.5;
    doc.text(`Legal   : ${custLegalName}`, margin, y);
  }

  const isInterstate = Boolean((order as any).is_interstate);
  const placeOfSupply = (order as any).place_of_supply || getOutletField("place_of_supply");
  if (placeOfSupply) {
    y += 3.5;
    doc.text(`Place of Supply: ${placeOfSupply}${isInterstate ? " (Inter-State)" : ""}`, margin, y);
  } else if (isInterstate) {
    y += 3.5;
    doc.text(`Supply Type    : Inter-State (IGST)`, margin, y);
  }

  y += 2.5;
  drawSolidLine(y);

  // 3. ITEMIZED TABLE GRID (Consolidates identical items for single-line customer presentation)
  const rawItems = ((order as any).items || []);
  const consolidatedItems: any[] = [];
  const itemConsolidationMap = new Map<string, any>();

  for (const it of rawItems) {
    const rawDishName =
      it.item_name ||
      menuItemsMap?.[it.menu_item_id]?.name ||
      it.name ||
      "Item";
    // Strip internal cashier POS tags such as [Oversold Backorder] or Lot # from customer receipt
    const cleanDishName = rawDishName
      .replace(/\[Oversold Backorder\]/gi, "")
      .replace(/\(Oversold\)/gi, "")
      .replace(/Lot\s*#[A-Za-z0-9_-]+/gi, "")
      .trim();

    const price = parseFloat(String(it.unit_price || "0"));
    const rawUnit =
      it.selected_unit ||
      it.unit ||
      it.unit_label ||
      menuItemsMap?.[it.menu_item_id]?.unit_label ||
      menuItemsMap?.[it.menu_item_id]?.unit ||
      "";
    const cleanUnit = typeof rawUnit === "string" ? rawUnit.trim() : "";
    const isComp = Boolean(it.is_complimentary);
    const taxRate = parseFloat(String(it.tax_rate ?? it.item_tax_rate ?? menuItemsMap?.[it.menu_item_id]?.tax_rate ?? 0));
    const mrpVal = it.mrp ? parseFloat(String(it.mrp)) : price;

    // Merge key: identity of item + price + unit + complimentary + tax rate
    const key = `${it.menu_item_id || cleanDishName}|${price.toFixed(2)}|${cleanUnit}|${isComp}|${taxRate.toFixed(2)}`;

    if (itemConsolidationMap.has(key)) {
      const existing = itemConsolidationMap.get(key);
      const existingQty = parseFloat(String(existing.quantity || "0"));
      const newQty = parseFloat(String(it.quantity || "0"));
      existing.quantity = existingQty + newQty;
      const itLineTotal = (it.line_total !== undefined && it.line_total !== null)
        ? parseFloat(String(it.line_total))
        : newQty * price;
      existing.line_total = parseFloat(String(existing.line_total || "0")) + itLineTotal;
      if (mrpVal > (existing.mrp || 0)) {
        existing.mrp = mrpVal;
      }
    } else {
      const itLineTotal = (it.line_total !== undefined && it.line_total !== null)
        ? parseFloat(String(it.line_total))
        : parseFloat(String(it.quantity || "0")) * price;
      const copy = {
        ...it,
        item_name: cleanDishName,
        quantity: parseFloat(String(it.quantity || "0")),
        unit_price: price,
        mrp: mrpVal,
        selected_unit: cleanUnit,
        line_total: itLineTotal,
        tax_rate: taxRate,
        is_complimentary: isComp,
      };
      itemConsolidationMap.set(key, copy);
      consolidatedItems.push(copy);
    }
  }

  const tableData = consolidatedItems.map((item: any, idx: number) => {
    const dishName = item.item_name || `Item #${idx + 1}`;
    const qtyVal = parseFloat(String(item.quantity || "0"));
    const cleanUnit = item.selected_unit || "";
    const qtyFormatted = qtyVal % 1 === 0 ? qtyVal.toFixed(0) : String(qtyVal);
    const qtyStr = cleanUnit ? `${qtyFormatted} ${cleanUnit}` : qtyFormatted;
    const price = parseFloat(String(item.unit_price || "0"));
    const mrpVal = item.mrp ? parseFloat(String(item.mrp)) : price;
    const lineTotal = (item.line_total !== undefined && item.line_total !== null) ? parseFloat(String(item.line_total)) : qtyVal * price;

    return [
      `${idx + 1}. ${dishName}`,
      qtyStr,
      `${mrpVal.toFixed(2)}`,
      `${price.toFixed(2)}`,
      `${lineTotal.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: y + 1.5,
    margin: { left: margin, right: margin },
    head: [["#  Item", "Qty", "MRP", "Rate", "Amt"]],
    body: tableData,
    theme: "plain",
    styles: {
      font: "courier",
      fontSize: 6.5,
      cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
      textColor: [0, 0, 0],
      lineWidth: 0,
    },
    headStyles: {
      font: "courier",
      fontStyle: "bold",
      fontSize: 6.5,
      textColor: [0, 0, 0],
      fillColor: false,
    },
    columnStyles: {
      0: { cellWidth: 24, halign: "left" },
      1: { cellWidth: 14, halign: "center" },
      2: { cellWidth: 11, halign: "right" },
      3: { cellWidth: 11, halign: "right" },
      4: { cellWidth: 12, halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 2;
  drawDashedLine(finalY);

  // 4. TAX & FINANCIAL SUMMARY GRID (Structured User Format with Per-Item Catalog GST Referencing)
  let summaryY = finalY + 4;
  
  const deliveryCharge = parseFloat(String((order as any).delivery_charge || 0));
  const handlingCharge = parseFloat(String((order as any).handling_charge || 0));

  let totalMrpVal = 0;
  let totalSellingSubtotal = 0;

  ((order as any).items || []).forEach((it: any) => {
    const qty = parseFloat(String(it.quantity || "1"));
    const price = parseFloat(String(it.unit_price || "0"));
    const mrp = it.mrp ? parseFloat(String(it.mrp)) : price;
    totalMrpVal += mrp * qty;
    totalSellingSubtotal += price * qty;
  });

  const mrpSavings = Math.max(0, totalMrpVal - totalSellingSubtotal);

  const discType = (order as any).discount_type;
  const discVal = (order as any).discount_value ? parseFloat(String((order as any).discount_value)) : 0;

  let extraDiscountRupees = 0;
  let extraDiscountLabel = "Extra Discount";

  if (discType === "PERCENT" && discVal > 0) {
    extraDiscountRupees = totalSellingSubtotal * (discVal / 100);
    extraDiscountLabel = `Extra Discount (${discVal}% OFF)`;
  } else if (discType === "FLAT" && discVal > 0) {
    extraDiscountRupees = discVal;
    extraDiscountLabel = `Extra Discount (Flat Rs.${discVal})`;
  } else if (discType === "COMPLIMENTARY_ITEMS" && discVal > 0) {
    extraDiscountRupees = discVal;
    extraDiscountLabel = `Extra Discount (Items)`;
  } else if (discType === "COMPLIMENTARY") {
    extraDiscountRupees = totalSellingSubtotal;
    extraDiscountLabel = `Extra Discount (Complimentary)`;
  }

  const pointsRedeemed = (order as any).loyalty_points_redeemed || 0;
  let loyaltyDiscountRupees = 0;
  if (pointsRedeemed > 0) {
    const rest = getOutletField("loyalty_redemption_tiers") ? {
      loyalty_redemption_tiers: getOutletField("loyalty_redemption_tiers"),
      loyalty_max_bill_percentage: getOutletField("loyalty_max_bill_percentage"),
    } : (storeDetails || (order as any).restaurant || {});
    
    // We try to find the tier that gives the discount. Since we don't have the historical total balance here,
    // we use the current balance from customer, or default to the highest tier that pointsRedeemed could fit in.
    const currentBalance = (order as any).customer?.loyalty_points || pointsRedeemed; // Best effort fallback
    const tiers: any[] = rest.loyalty_redemption_tiers || [];
    const sortedTiers = [...tiers].sort((a, b) => b.min_points - a.min_points);
    const applicableTier = sortedTiers.find(t => currentBalance >= t.min_points);
    
    const pointValue = applicableTier ? (applicableTier.discount_percentage / 100) : 0;
    const maxBillPercentage = parseFloat(String(rest.loyalty_max_bill_percentage || "100.00"));
    
    const requestedDiscount = pointsRedeemed * pointValue;
    const maxAllowedDiscount = (maxBillPercentage / 100) * totalSellingSubtotal;
    loyaltyDiscountRupees = Math.min(requestedDiscount, maxAllowedDiscount);
  }

  const amountPayable = Math.max(0, totalSellingSubtotal - extraDiscountRupees);

  const creditApplied = parseFloat(String((order as any).credit_applied || 0)) || 0;
  const debitApplied = parseFloat(String((order as any).debit_applied || 0)) || 0;

  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);

  if (mrpSavings > 0 || extraDiscountRupees > 0) {
    doc.text("Total MRP Value", margin, summaryY);
    doc.text(`INR ${totalMrpVal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;

    if (mrpSavings > 0) {
      doc.text("Product Discount", margin, summaryY);
      doc.text(`- INR ${mrpSavings.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
    }

    if (extraDiscountRupees > 0) {
      doc.text(extraDiscountLabel, margin, summaryY);
      doc.text(`- INR ${extraDiscountRupees.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
    }
    
    summaryY += 1;
    drawDashedLine(summaryY);
    summaryY += 4.5;
  }

  // Calculate ratio of actual paid amount to the taxable subtotal (handles FLAT/PERCENT)
  let taxableSubtotal = totalSellingSubtotal;
  if (discType === "COMPLIMENTARY_ITEMS" || discType === "COMPLIMENTARY") {
    taxableSubtotal = amountPayable; // Paid items subtotal before bill-level discounts
  }
  const discountRatio = taxableSubtotal > 0 ? (amountPayable / taxableSubtotal) : 0;

  const isInterstateOrder = Boolean((order as any).is_interstate);

  interface HsnSummaryItem {
    hsn: string;
    rate: number;
    base: number;
    tax: number;
  }
  const hsnSummaryMap: Record<string, HsnSummaryItem> = {};

  ((order as any).items || []).forEach((item: any) => {
    if (item.is_complimentary === true || item.is_complimentary === 1 || item.is_complimentary === "true" || item.is_complimentary === "1") return;
    const qtyVal = parseFloat(String(item.quantity || "0"));
    const unitPrice = parseFloat(String(item.unit_price || "0"));
    const itemLineTotal = (qtyVal * unitPrice) * discountRatio;

    let itemTaxRate = 0;
    if (item.tax_rate !== undefined && item.tax_rate !== null) {
      itemTaxRate = parseFloat(String(item.tax_rate));
    } else if (item.item_tax_rate !== undefined && item.item_tax_rate !== null) {
      itemTaxRate = parseFloat(String(item.item_tax_rate));
    } else if (menuItemsMap && item.menu_item_id && menuItemsMap[item.menu_item_id]?.tax_rate !== undefined && menuItemsMap[item.menu_item_id]?.tax_rate !== null) {
      itemTaxRate = parseFloat(String(menuItemsMap[item.menu_item_id].tax_rate));
    }
    if (isNaN(itemTaxRate)) itemTaxRate = 0;

    let itemHsn = (item as any).hsn_code || (menuItemsMap && item.menu_item_id && (menuItemsMap[item.menu_item_id] as any)?.hsn_code) || "-";

    if (itemTaxRate >= 0) {
      const base = itemLineTotal / (1 + (itemTaxRate / 100));
      const taxAmount = itemLineTotal - base;

      const groupKey = `${itemHsn}_${itemTaxRate}`;
      if (!hsnSummaryMap[groupKey]) {
        hsnSummaryMap[groupKey] = { hsn: itemHsn, rate: itemTaxRate, base: 0, tax: 0 };
      }
      hsnSummaryMap[groupKey].base += base;
      hsnSummaryMap[groupKey].tax += taxAmount;
    }
  });

  const hsnList = Object.values(hsnSummaryMap).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);

  // Subtotal & Final Bill Charges
  const billAmount = amountPayable;
  const totalBeforeRound = billAmount + deliveryCharge + handlingCharge;
  
  // ALWAYS enforce standard rounding to nearest integer for POS systems
  const netTotal = Math.round(totalBeforeRound);
  const roundOff = netTotal - totalBeforeRound;

  const hasExtraLines = deliveryCharge > 0 || handlingCharge > 0 || Math.abs(roundOff) > 0.001 || extraDiscountRupees > 0 || loyaltyDiscountRupees > 0 || mrpSavings > 0;

  if (hasExtraLines) {
    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    doc.text("Bill Amount", margin, summaryY);
    doc.text(`INR ${billAmount.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.8;

    if (deliveryCharge > 0) {
      doc.text("Delivery Charge", margin, summaryY);
      doc.text(`INR ${deliveryCharge.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
    }
    
    if (handlingCharge > 0) {
      doc.text("Handling Charge", margin, summaryY);
      doc.text(`INR ${handlingCharge.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
    }
    
    if (Math.abs(roundOff) > 0.001) {
      doc.text("Round Off", margin, summaryY);
      const sign = roundOff > 0 ? "+" : "";
      doc.text(`${sign}${roundOff.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
    }
    
    summaryY += 1.5;
    drawSolidLine(summaryY);
    summaryY += 4.5;
  }

  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("NET TOTAL", margin, summaryY);
  doc.text(`INR ${netTotal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
  
  summaryY += 2;
  drawSolidLine(summaryY);
  summaryY += 4.5;

  const debtSettled = parseFloat(String((order as any).debt_settled || 0)) || 0;
  const creditAwarded = parseFloat(String((order as any).credit_awarded || 0)) || 0;
  const creditCashedOut = parseFloat(String((order as any).credit_cashed_out || 0)) || 0;
  
  let netPaid = netTotal;

  if (loyaltyDiscountRupees > 0 || creditApplied > 0 || debitApplied > 0 || debtSettled > 0 || creditAwarded > 0 || creditCashedOut > 0) {
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      
      if (loyaltyDiscountRupees > 0) {
          doc.text(`Loyalty Redeemed (${pointsRedeemed} pts)`, margin, summaryY);
          doc.text(`- INR ${loyaltyDiscountRupees.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= loyaltyDiscountRupees;
      }
      
      if (creditApplied > 0) {
          doc.text("Credit Applied", margin, summaryY);
          doc.text(`- INR ${creditApplied.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= creditApplied;
      }
      
      if (debitApplied > 0) {
          doc.text("Debit (Shortfall)", margin, summaryY);
          doc.text(`- INR ${debitApplied.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= debitApplied;
      }
      
      if (debtSettled > 0) {
          doc.text("Debt Settled", margin, summaryY);
          doc.text(`+ INR ${debtSettled.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += debtSettled;
      }
      
      if (creditAwarded > 0) {
          doc.text("Credit Awarded", margin, summaryY);
          doc.text(`+ INR ${creditAwarded.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += creditAwarded;
      }
      
      if (creditCashedOut > 0) {
          doc.text("Credit Cashed Out", margin, summaryY);
          doc.text(`- INR ${creditCashedOut.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= creditCashedOut;
      }
      
      summaryY += 1.5;
      drawSolidLine(summaryY);
      summaryY += 4.5;
      doc.setFont("courier", "bold");
      doc.setFontSize(8.5);
      doc.text("NET PAID", margin, summaryY);
      doc.text(`INR ${netPaid.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 2;
      drawSolidLine(summaryY);
      summaryY += 4.5;
  }

  const customerBalanceRaw = (order as any).customer_balance ?? (order as any).customer?.credit_balance;
  if (customerBalanceRaw !== undefined && customerBalanceRaw !== null) {
      const customerBalance = parseFloat(String(customerBalanceRaw)) || 0;
      summaryY += 2;
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      if (customerBalance > 0) {
          doc.text("Store Credit", margin, summaryY);
          doc.text(`INR ${customerBalance.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      } else if (customerBalance < 0) {
          doc.text("Outstanding Debit", margin, summaryY);
          doc.text(`INR ${Math.abs(customerBalance).toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      } else {
          doc.text("Customer Balance", margin, summaryY);
          doc.text(`INR 0.00`, pageWidth - margin, summaryY, { align: "right" });
      }
      summaryY += 3.5;
  }

  const customerLoyaltyRaw = (order as any).customer_loyalty_points ?? (order as any).customer_loyalty_balance ?? (order as any).customer?.loyalty_points;
  if (customerLoyaltyRaw !== undefined && customerLoyaltyRaw !== null) {
      const loyaltyPts = parseInt(String(customerLoyaltyRaw), 10) || 0;
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      doc.text("Loyalty Points", margin, summaryY);
      doc.text(`${loyaltyPts} pts`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
  }

  const pMethod = (order as any).payment_method || "CASH";
  const cashAmt = parseFloat(String((order as any).cash_amount || 0)) || 0;
  const upiAmt = parseFloat(String((order as any).upi_amount || 0)) || 0;

  if (pMethod === "SPLIT" || (cashAmt > 0 && upiAmt > 0)) {
      summaryY += 1.5;
      drawDashedLine(summaryY);
      summaryY += 4.0;
      doc.setFont("courier", "bold");
      doc.setFontSize(7.5);
      doc.text("PAYMENT MODE: SPLIT", margin, summaryY);
      summaryY += 3.5;
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      doc.text("  Cash Tendered", margin, summaryY);
      doc.text(`INR ${cashAmt.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
      doc.text("  UPI Paid", margin, summaryY);
      doc.text(`INR ${upiAmt.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 3.5;
  } else if ((order as any).payment_method) {
      summaryY += 1.5;
      drawDashedLine(summaryY);
      summaryY += 4.0;
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      doc.text(`Payment Mode: ${(order as any).payment_method}`, margin, summaryY);
      summaryY += 3.5;
  }

  // 4. STATUTORY GST BREAKDOWN TABLE (Spacious & Clean Layout)
  if (hsnList.length > 0) {
    summaryY += 5;

    doc.setFont("courier", "bold");
    doc.setFontSize(7.5);
    doc.text("GST TAX SUMMARY", pageWidth / 2, summaryY, { align: "center" });
    summaryY += 3.2;

    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(isInterstateOrder ? "(INTER-STATE / IGST)" : "(INTRA-STATE SALE)", pageWidth / 2, summaryY, { align: "center" });
    summaryY += 3.0;

    drawDashedLine(summaryY);
    summaryY += 4.0;

    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    if (isInterstateOrder) {
      doc.text("HSN/SAC", margin, summaryY);
      doc.text("Taxable", 38, summaryY, { align: "right" });
      doc.text("Rate", 54, summaryY, { align: "right" });
      doc.text("IGST Amt", pageWidth - margin, summaryY, { align: "right" });
    } else {
      doc.text("HSN/SAC", margin, summaryY);
      doc.text("Taxable", 30, summaryY, { align: "right" });
      doc.text("CGST", 44, summaryY, { align: "right" });
      doc.text("SGST", 58, summaryY, { align: "right" });
      doc.text("Total Tax", pageWidth - margin, summaryY, { align: "right" });
    }
    summaryY += 1.8;
    drawDashedLine(summaryY);
    summaryY += 4.0;

    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);

    let totHsnBase = 0;
    let totHsnTax = 0;

    hsnList.forEach((grp) => {
      totHsnBase += grp.base;
      totHsnTax += grp.tax;

      const displayHsn = grp.hsn && grp.hsn !== "null" && grp.hsn !== "undefined"
        ? (grp.hsn.length > 8 ? grp.hsn.substring(0, 8) : grp.hsn)
        : "-";
      doc.text(displayHsn, margin, summaryY);

      if (isInterstateOrder) {
        doc.text(grp.base.toFixed(2), 38, summaryY, { align: "right" });
        doc.text(`${grp.rate.toFixed(1).replace(/\.0$/, "")}%`, 54, summaryY, { align: "right" });
        doc.text(grp.tax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
      } else {
        const halfTax = grp.tax / 2;
        doc.text(grp.base.toFixed(2), 30, summaryY, { align: "right" });
        doc.text(halfTax.toFixed(2), 44, summaryY, { align: "right" });
        doc.text(halfTax.toFixed(2), 58, summaryY, { align: "right" });
        doc.text(grp.tax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
      }
      summaryY += 3.8;
    });

    summaryY += 0.8;
    drawDashedLine(summaryY);
    summaryY += 3.8;

    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    doc.text("Total", margin, summaryY);

    if (isInterstateOrder) {
      doc.text(totHsnBase.toFixed(2), 38, summaryY, { align: "right" });
      doc.text(totHsnTax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
    } else {
      const halfTot = totHsnTax / 2;
      doc.text(totHsnBase.toFixed(2), 30, summaryY, { align: "right" });
      doc.text(halfTot.toFixed(2), 44, summaryY, { align: "right" });
      doc.text(halfTot.toFixed(2), 58, summaryY, { align: "right" });
      doc.text(totHsnTax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
    }

    summaryY += 2.0;
    drawDashedLine(summaryY);
  }

  // 5. FOOTER & QR CODE
  summaryY += 8;
  
  // Draw QR Code if bill_qr_url is available
  if (billQrUrlRaw) {
    try {
      const qrDataUrl = await QRCode.toDataURL(billQrUrlRaw, { margin: 1, width: 60 });
      const qrSize = 25; // 25x25mm
      doc.addImage(qrDataUrl, "PNG", (pageWidth - qrSize) / 2, summaryY, qrSize, qrSize);
      summaryY += qrSize + 4;
    } catch (e) {
      console.warn("Failed to generate QR code", e);
    }
  } else {
    summaryY += 2;
  }
  
  // App Store Badges
  const badgeWidth = 26;
  const badgeHeight = 8;
  const badgeGap = 4;
  const totalBadgesWidth = badgeWidth * 2 + badgeGap;
  const badgesStartX = (pageWidth - totalBadgesWidth) / 2;
  
  try {
    // Attempt to load the user-uploaded images from public folder
    const [playStoreBase64, appStoreBase64] = await Promise.all([
      Promise.race([fetchImageAsBase64("/images/google-play.png"), new Promise<string>((_, r) => setTimeout(() => r(""), 2000))]),
      Promise.race([fetchImageAsBase64("/images/app-store.png"), new Promise<string>((_, r) => setTimeout(() => r(""), 2000))])
    ]);
    
    if (playStoreBase64) {
      doc.addImage(playStoreBase64, badgesStartX, summaryY, badgeWidth, badgeHeight);
    } else {
      throw new Error("Missing play store image");
    }
    
    if (appStoreBase64) {
      doc.addImage(appStoreBase64, badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight);
    } else {
      throw new Error("Missing app store image");
    }
  } catch (err) {
    // Fallback to text boxes if images fail to load
    const drawBadge = (x: number, yPos: number, width: number, height: number, text: string) => {
      doc.setFillColor(0, 0, 0);
      doc.roundedRect(x, yPos, width, height, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.5);
      doc.setFont("courier", "bold");
      doc.text(text, x + width / 2, yPos + height / 2 + 1, { align: "center" });
      doc.setTextColor(0, 0, 0);
    };
    
    drawBadge(badgesStartX, summaryY, badgeWidth, badgeHeight, "Google Play");
    drawBadge(badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight, "App Store");
  }
  
  // Text Links
  doc.link(badgesStartX, summaryY, badgeWidth, badgeHeight, { url: "https://play.google.com/store/apps/details?id=com.apnagreenbasket" });
  doc.link(badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight, { url: "https://www.apple.com/app-store/" });
  
  summaryY += badgeHeight + 6;

  // 6. PAYMENT STATUS STAMP & FOOTER BLOCK
  doc.setFont("courier", "bold");
  doc.setFontSize(8);
  doc.text("STATUS: PAID & SETTLED", pageWidth / 2, summaryY, { align: "center" });

  summaryY += 4.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text("THANK YOU", pageWidth / 2, summaryY, { align: "center" });

  summaryY += 3.5;
  doc.text("*** HAVE A GREAT DAY ***", pageWidth / 2, summaryY, { align: "center" });
  
  summaryY += 5; // End margin
  
  // Optional: Trim page height to fit content if we went over or under
  // With jsPDF you can't dynamically resize the page after creation easily, 
  // but starting with 297mm ensures we don't clip unless it's a huge order.
  
  if (action === "view") {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    doc.save(`Receipt-${invoiceNo}.pdf`);
  }
}

export function generateAnalyticsPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  kpi: {
    total_revenue: number;
    total_orders: number;
    avg_order_value: number;
    profit_margin_pct: number;
    cogs: number;
    net_profit: number;
    revenue_change_pct: number;
    orders_change_pct: number;
    margin_change_pct: number;
  },
  topItems: Array<{ name: string; category_name?: string | null; quantity_sold: number; revenue: number; revenue_share_pct: number }>,
  funnelStages: Array<{ stage_label: string; count: number; percentage: number }>
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "EXECUTIVE SALES & ANALYTICS REPORT", dateRangeLabel);

  // Executive KPI summary cards grid table
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("1. Executive Summary & KPIs", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value", "Period-over-Period Delta"]],
    body: [
      ["Gross Revenue", `INR ${kpi.total_revenue.toFixed(2)}`, `${kpi.revenue_change_pct >= 0 ? "+" : ""}${kpi.revenue_change_pct}%`],
      ["Total Completed Orders", `${kpi.total_orders}`, `${kpi.orders_change_pct >= 0 ? "+" : ""}${kpi.orders_change_pct}%`],
      ["Average Order Value (AOV)", `INR ${kpi.avg_order_value.toFixed(2)}`, "—"],
      ["Cost of Goods Sold (COGS)", `INR ${kpi.cogs.toFixed(2)}`, "—"],
      ["Net Profit", `INR ${kpi.net_profit.toFixed(2)}`, "—"],
      ["Profit Margin %", `${kpi.profit_margin_pct}%`, `${kpi.margin_change_pct >= 0 ? "+" : ""}${kpi.margin_change_pct}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [0, 112, 243], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Top Items Table
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("2. Top Performing Menu Items", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Item Name", "Category", "Qty Sold", "Revenue (INR)", "Revenue Share %"]],
    body: topItems.slice(0, 10).map((item) => [
      item.name,
      item.category_name || "-",
      item.quantity_sold,
      `INR ${item.revenue.toFixed(2)}`,
      `${item.revenue_share_pct.toFixed(1)}%`
    ]),
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5 },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Order Funnel Table
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("3. Order Conversion & Funnel Breakdown", 14, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [["Fulfillment Stage", "Order Count", "Stage Share %"]],
    body: funnelStages.map((stg) => [stg.stage_label, stg.count, `${stg.percentage.toFixed(1)}%`]),
    theme: "plain",
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5 },
  });

  doc.save(`Sales-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export interface ReturnPdfData {
  return_number: string;
  order_id?: string | null;
  original_bill_number?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  returned_items: Array<{
    item_name: string;
    quantity: number;
    unit_price: number | string;
    mrp?: number | string;
    line_refund?: number | string;
    tax_rate?: number | string | null;
    hsn_code?: string | null;
    selected_unit?: string | null;
    unit?: string | null;
    unit_label?: string | null;
    menu_item_id?: string | null;
    reason?: string;
  }>;
  total_refund_amount: number;
  refund_payment_method?: string;
  created_at?: string;
  processed_at?: string;
  credit_applied?: number;
  credit_cashed_out?: number;
  debt_settled?: number;
  credit_awarded?: number;
  debit_applied?: number;
  wallet_balance_after?: number | null;
  customer_balance?: number | null;
  is_interstate?: boolean;
  place_of_supply?: string;
  round_off?: number;
  exchange_items?: Array<{
    item_name: string;
    quantity: number;
    unit_price: number | string;
    line_total?: number | string;
    selected_unit?: string | null;
  }>;
  restaurant?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    fssai_no?: string;
    logo_url?: string;
    bill_qr_url?: string;
    place_of_supply?: string;
    interstate_mode?: string;
  };
}

export async function generateReturnReceiptPDF(
  returnData: ReturnPdfData,
  restaurantName: string = "ApnaGreen Basket",
  storeDetailsOrAction?: any,
  actionOpt: "download" | "view" = "download",
  menuItemsMap?: Record<string, any>
) {
  let storeDetails: any = undefined;
  let action: "download" | "view" = actionOpt;
  if (storeDetailsOrAction === "download" || storeDetailsOrAction === "view") {
    action = storeDetailsOrAction;
  } else if (storeDetailsOrAction) {
    storeDetails = storeDetailsOrAction;
  }

  // Fallback to embedded restaurant info if explicit storeDetails not provided
  if (!storeDetails && returnData.restaurant) {
    storeDetails = returnData.restaurant;
  }

  const effectiveMenuItemsMap = menuItemsMap || storeDetails?.menuItemsMap || undefined;

  const getOutletField = (field: string) => {
    return storeDetails?.[field] || returnData.restaurant?.[field as keyof typeof returnData.restaurant] || undefined;
  };

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, 297],
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 4;
  const contentWidth = pageWidth - margin * 2;
  let y = 8;

  const drawDashedLine = (posY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, posY, pageWidth - margin, posY);
    doc.setLineDashPattern([], 0);
  };

  const drawSolidLine = (posY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(margin, posY, pageWidth - margin, posY);
  };

  // 1. STORE HEADER
  const logoUrlRaw = getOutletField("logo_url");
  let logoUrl = null;
  if (logoUrlRaw) {
    logoUrl = logoUrlRaw.startsWith("http") ? logoUrlRaw : (typeof window !== "undefined" ? window.location.origin : "") + logoUrlRaw;
  } else if (storeDetails && typeof storeDetails.logo === "string") {
    logoUrl = storeDetails.logo.startsWith("http") ? storeDetails.logo : (typeof window !== "undefined" ? window.location.origin : "") + storeDetails.logo;
  }

  if (logoUrl) {
    try {
      const base64Img = await Promise.race([
        fetchImageAsBase64(logoUrl),
        new Promise<string>((_, reject) => setTimeout(() => reject("Timeout"), 3000))
      ]);
      const imgWidth = 20;
      const imgHeight = 20;
      doc.addImage(base64Img, (pageWidth - imgWidth) / 2, y, imgWidth, imgHeight);
      y += imgHeight + 4;
    } catch (e) {
      console.warn("Failed to load logo", e);
    }
  }

  const rawStoreName =
    getOutletField("name") ||
    (restaurantName && restaurantName !== "Outlet Receipt" && restaurantName !== "ApnaGreen Basket" && restaurantName !== "APNAGREEN BASKET" ? restaurantName : null) ||
    "ApnaGreen Basket";
  const storeName = rawStoreName;

  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(storeName, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });

  y += 4;
  const addressStr = getOutletField("address");
  if (addressStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.text(addressStr, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += 3.5;
  }
  
  const billQrUrlRaw = getOutletField("bill_qr_url");
  if (billQrUrlRaw) {
    try {
      const parsedUrl = new URL(billQrUrlRaw);
      doc.setFont("courier", "normal");
      doc.setFontSize(7);
      doc.text(parsedUrl.hostname, pageWidth / 2, y, { align: "center" });
      y += 3.5;
    } catch { }
  }

  const fssai = getOutletField("fssai_no");
  if (fssai) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`FSSAI Reg No: ${fssai}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }

  const gstin = getOutletField("gstin") || "01AAFCB7044K1ZV";
  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  doc.text(`GSTIN: ${gstin}`, pageWidth / 2, y, { align: "center" });
  y += 3.5;
  
  const phoneStr = getOutletField("phone");
  if (phoneStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`Phone: ${phoneStr}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }
  
  const emailStr = getOutletField("email");
  if (emailStr) {
    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(`Email: ${emailStr}`, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += 3.5;
  }

  y -= 1;
  drawDashedLine(y);

  // 2. CASH MEMO TITLE & BILL METADATA
  y += 4;
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("RETURN INVOICE", pageWidth / 2, y, { align: "center" });

  y += 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);

  const invoiceNo = returnData.return_number;
  const timestamp = returnData.processed_at || returnData.created_at || new Date().toISOString();
  let orderDateStr = "";
  if (timestamp) {
    const d = parseUTCDate(timestamp);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');
    orderDateStr = `${day}/${month}/${year}, ${formattedHours}:${minutes} ${ampm}`;
  }
  
  doc.text(`Return No : #${invoiceNo}`, margin, y);
  
  y += 3.5;
  const origBill = returnData.original_bill_number || (returnData.order_id ? `#${returnData.order_id.slice(0, 8).toUpperCase()}` : "Direct Return");
  doc.text(`Orig Bill : ${origBill}`, margin, y);

  y += 3.5;
  doc.text(`Date      : ${orderDateStr || "N/A"}`, margin, y);

  y += 3.5;
  const guestName = returnData.customer_name || "Walk-In";
  doc.text(`Customer  : ${guestName}`, margin, y);
  
  const guestPhone = returnData.customer_phone;
  if (guestPhone) {
    doc.text(`Mob: ${guestPhone}`, pageWidth - margin, y, { align: "right" });
  }
  
  // Determine if interstate based strictly on original bill if present; fallback to outlet settings
  let isInterstateOrder = false;
  if ((returnData as any).is_interstate !== undefined && (returnData as any).is_interstate !== null) {
    isInterstateOrder = Boolean((returnData as any).is_interstate);
  } else if ((returnData as any).order?.is_interstate !== undefined && (returnData as any).order?.is_interstate !== null) {
    isInterstateOrder = Boolean((returnData as any).order?.is_interstate);
  } else {
    const outletInterstateMode = getOutletField("interstate_mode");
    isInterstateOrder = (outletInterstateMode === "ALWAYS_ON");
  }

  const placeOfSupply = (returnData as any).place_of_supply ||
    (returnData as any).order?.place_of_supply ||
    getOutletField("place_of_supply");

  if (placeOfSupply) {
    y += 3.5;
    doc.text(`Place of Supply: ${placeOfSupply}${isInterstateOrder ? " (Inter-State)" : ""}`, margin, y);
  } else if (isInterstateOrder) {
    y += 3.5;
    doc.text(`Supply Type    : Inter-State (IGST)`, margin, y);
  }

  y += 2.5;
  drawSolidLine(y);

  // 3. ITEMIZED TABLE GRID (Courier Monospaced Column Alignment)
  let totalMrpVal = 0;
  let totalRefundValue = 0;
  
  const tableData = (returnData.returned_items || []).map((item: any, idx: number) => {
    const dishName = item.item_name || `Item #${idx + 1}`;
    const qtyVal = parseFloat(String(item.quantity || "0"));
    const rawUnit = item.selected_unit || item.unit || item.unit_label || (item.menu_item_id && effectiveMenuItemsMap?.[item.menu_item_id]?.unit_label) || "";
    const cleanUnit = typeof rawUnit === "string" ? rawUnit.trim() : "";
    const qtyFormatted = qtyVal % 1 === 0 ? qtyVal.toFixed(0) : String(qtyVal);
    const qtyStr = cleanUnit ? `${qtyFormatted} ${cleanUnit}` : qtyFormatted;
    const price = parseFloat(String(item.unit_price || "0"));
    const mrpVal = item.mrp ? parseFloat(String(item.mrp)) : price;
    const lineTotal = item.line_refund !== undefined ? parseFloat(String(item.line_refund)) : qtyVal * price;

    totalMrpVal += mrpVal * qtyVal;
    totalRefundValue += lineTotal;

    return [
      `${idx + 1}. ${dishName}`,
      qtyStr,
      `${mrpVal.toFixed(2)}`,
      `${price.toFixed(2)}`,
      `${lineTotal.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: y + 1.5,
    margin: { left: margin, right: margin },
    head: [["#  Item", "Qty", "MRP", "Rate", "Amt"]],
    body: tableData,
    theme: "plain",
    styles: {
      font: "courier",
      fontSize: 6.5,
      cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
      textColor: [0, 0, 0],
      lineWidth: 0,
    },
    headStyles: {
      font: "courier",
      fontStyle: "bold",
      fontSize: 6.5,
      textColor: [0, 0, 0],
      fillColor: false,
    },
    columnStyles: {
      0: { cellWidth: 24, halign: "left" },
      1: { cellWidth: 14, halign: "center" },
      2: { cellWidth: 11, halign: "right" },
      3: { cellWidth: 11, halign: "right" },
      4: { cellWidth: 12, halign: "right" },
    },
  });

  let currentTableFinalY = (doc as any).lastAutoTable.finalY + 2;

  if (returnData.exchange_items && returnData.exchange_items.length > 0) {
    drawDashedLine(currentTableFinalY);
    currentTableFinalY += 3;
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.text("EXCHANGE / REPLACEMENT ITEMS", margin, currentTableFinalY);

    const exchangeTableData = returnData.exchange_items.map((item: any, idx: number) => {
      const dishName = item.item_name || `Exchange #${idx + 1}`;
      const qtyVal = parseFloat(String(item.quantity || "0"));
      const rawUnit = item.selected_unit || item.unit || item.unit_label || (item.menu_item_id && effectiveMenuItemsMap?.[item.menu_item_id]?.unit_label) || "";
      const cleanUnit = typeof rawUnit === "string" ? rawUnit.trim() : "";
      const qtyFormatted = qtyVal % 1 === 0 ? qtyVal.toFixed(0) : String(qtyVal);
      const qtyStr = cleanUnit ? `${qtyFormatted} ${cleanUnit}` : qtyFormatted;
      const price = parseFloat(String(item.unit_price || "0"));
      const lineTotal = item.line_total !== undefined ? parseFloat(String(item.line_total)) : qtyVal * price;

      return [
        `${idx + 1}. ${dishName}`,
        qtyStr,
        `${price.toFixed(2)}`,
        `${lineTotal.toFixed(2)}`,
      ];
    });

    autoTable(doc, {
      startY: currentTableFinalY + 1.5,
      margin: { left: margin, right: margin },
      head: [["#  Item", "Qty", "Rate", "Amt"]],
      body: exchangeTableData,
      theme: "plain",
      styles: {
        font: "courier",
        fontSize: 6.5,
        cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
        textColor: [0, 0, 0],
        lineWidth: 0,
      },
      headStyles: {
        font: "courier",
        fontStyle: "bold",
        fontSize: 6.5,
        textColor: [0, 0, 0],
        fillColor: false,
      },
      columnStyles: {
        0: { cellWidth: 35, halign: "left" },
        1: { cellWidth: 15, halign: "center" },
        2: { cellWidth: 11, halign: "right" },
        3: { cellWidth: 11, halign: "right" },
      },
    });

    currentTableFinalY = (doc as any).lastAutoTable.finalY + 2;
  }

  const finalY = currentTableFinalY;
  drawDashedLine(finalY);

  // Group GST by HSN code and Tax Rate
  interface HsnSummaryItem {
    hsn: string;
    rate: number;
    base: number;
    tax: number;
  }
  const hsnSummaryMap: Record<string, HsnSummaryItem> = {};

  (returnData.returned_items || []).forEach((item: any) => {
    const qtyVal = parseFloat(String(item.quantity || "0"));
    const price = parseFloat(String(item.unit_price || "0"));
    const lineTotal = item.line_refund !== undefined ? parseFloat(String(item.line_refund)) : qtyVal * price;

    let itemTaxRate = 0;
    if (item.tax_rate !== undefined && item.tax_rate !== null) {
      itemTaxRate = parseFloat(String(item.tax_rate));
    } else if (item.item_tax_rate !== undefined && item.item_tax_rate !== null) {
      itemTaxRate = parseFloat(String(item.item_tax_rate));
    } else if (effectiveMenuItemsMap && item.menu_item_id && effectiveMenuItemsMap[item.menu_item_id]?.tax_rate !== undefined && effectiveMenuItemsMap[item.menu_item_id]?.tax_rate !== null) {
      itemTaxRate = parseFloat(String(effectiveMenuItemsMap[item.menu_item_id].tax_rate));
    }
    if (isNaN(itemTaxRate)) itemTaxRate = 0;

    let itemHsn = item.hsn_code || (effectiveMenuItemsMap && item.menu_item_id && (effectiveMenuItemsMap[item.menu_item_id] as any)?.hsn_code) || "-";

    if (itemTaxRate >= 0) {
      const base = lineTotal / (1 + (itemTaxRate / 100));
      const taxAmount = lineTotal - base;

      const groupKey = `${itemHsn}_${itemTaxRate}`;
      if (!hsnSummaryMap[groupKey]) {
        hsnSummaryMap[groupKey] = { hsn: itemHsn, rate: itemTaxRate, base: 0, tax: 0 };
      }
      hsnSummaryMap[groupKey].base += base;
      hsnSummaryMap[groupKey].tax += taxAmount;
    }
  });

  const hsnList = Object.values(hsnSummaryMap).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);

  // 4. FINANCIAL SUMMARY GRID
  let summaryY = finalY + 4;
  
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);

  const mrpSavings = Math.max(0, totalMrpVal - totalRefundValue);

  if (mrpSavings > 0) {
    doc.text("Total MRP Value", margin, summaryY);
    doc.text(`INR ${totalMrpVal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;

    doc.text("Product Discount", margin, summaryY);
    doc.text(`- INR ${mrpSavings.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;
    
    summaryY += 1;
    drawDashedLine(summaryY);
    summaryY += 4.5;
  }

  let totalExchangeVal = 0;
  if (returnData.exchange_items && returnData.exchange_items.length > 0) {
    returnData.exchange_items.forEach((it) => {
      totalExchangeVal += Number(it.line_total || (Number(it.quantity) * Number(it.unit_price)));
    });
  }

  doc.text("Total Return Credit", margin, summaryY);
  doc.text(`INR ${totalRefundValue.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
  summaryY += 3.8;

  if (totalExchangeVal > 0) {
    doc.text("Less Exchange Value", margin, summaryY);
    doc.text(`- INR ${totalExchangeVal.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;
  }

  const netBeforeRound = totalRefundValue - totalExchangeVal;
  const roundOff = returnData.round_off !== undefined ? Number(returnData.round_off) : (Math.round(netBeforeRound) - netBeforeRound);
  const netRefund = netBeforeRound + roundOff;

  if (Math.abs(roundOff) > 0.001) {
    doc.text("Round Off", margin, summaryY);
    const sign = roundOff > 0 ? "+" : "";
    doc.text(`${sign}${roundOff.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
    summaryY += 3.5;
    summaryY += 1;
    drawSolidLine(summaryY);
    summaryY += 4.5;
  } else {
    summaryY += 1;
    drawSolidLine(summaryY);
    summaryY += 4.5;
  }

  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text(netRefund >= 0 ? "NET REFUND" : "NET PAYABLE", margin, summaryY);
  doc.text(`INR ${Math.abs(netRefund).toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
  
  summaryY += 2;
  drawSolidLine(summaryY);
  summaryY += 4.5;

  let netPaid = netRefund;
  const creditApplied = returnData.credit_applied || 0;
  const debitApplied = returnData.debit_applied || 0;
  const debtSettled = returnData.debt_settled || 0;
  const creditAwarded = returnData.credit_awarded || 0;
  const creditCashedOut = returnData.credit_cashed_out || 0;

  if (creditApplied > 0 || debitApplied > 0 || debtSettled > 0 || creditAwarded > 0 || creditCashedOut > 0) {
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      
      if (creditApplied > 0) {
          doc.text("Credit Applied (to Exchange)", margin, summaryY);
          doc.text(`+ INR ${creditApplied.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += creditApplied;
      }
      
      if (debitApplied > 0) {
          doc.text("Debit (Shortfall Unpaid)", margin, summaryY);
          doc.text(`+ INR ${debitApplied.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += debitApplied;
      }
      
      if (debtSettled > 0) {
          doc.text("Debt Settled", margin, summaryY);
          doc.text(`- INR ${debtSettled.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= debtSettled;
      }
      
      if (creditAwarded > 0) {
          doc.text("Credit Awarded", margin, summaryY);
          doc.text(`- INR ${creditAwarded.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid -= creditAwarded;
      }
      
      if (creditCashedOut > 0) {
          doc.text("Credit Cashed Out", margin, summaryY);
          doc.text(`+ INR ${creditCashedOut.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
          summaryY += 3.5;
          netPaid += creditCashedOut;
      }
      
      summaryY += 1.5;
      drawSolidLine(summaryY);
      summaryY += 4.5;
      doc.setFont("courier", "bold");
      doc.setFontSize(8.5);
      const settleMethod = (returnData.refund_payment_method || "CASH").toUpperCase();
      doc.text(`NET SETTLEMENT (${settleMethod})`, margin, summaryY);
      doc.text(`INR ${netPaid.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      summaryY += 2;
      drawSolidLine(summaryY);
      summaryY += 4.5;
  }

  const customerBalanceRaw = returnData.wallet_balance_after ?? returnData.customer_balance;
  if (customerBalanceRaw !== undefined && customerBalanceRaw !== null) {
      const customerBalance = parseFloat(String(customerBalanceRaw)) || 0;
      summaryY += 2;
      doc.setFont("courier", "normal");
      doc.setFontSize(7.5);
      if (customerBalance >= 0) {
          doc.text("Store Credit Balance", margin, summaryY);
          doc.text(`INR ${customerBalance.toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      } else {
          doc.text("Outstanding Debit", margin, summaryY);
          doc.text(`INR ${Math.abs(customerBalance).toFixed(2)}`, pageWidth - margin, summaryY, { align: "right" });
      }
      summaryY += 3.5;
  }

  // 5. STATUTORY GST BREAKDOWN TABLE (Spacious & Clean Layout matching standard bill)
  if (hsnList.length > 0) {
    summaryY += 4;

    doc.setFont("courier", "bold");
    doc.setFontSize(7.5);
    doc.text("GST TAX SUMMARY", pageWidth / 2, summaryY, { align: "center" });
    summaryY += 3.2;

    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);
    doc.text(isInterstateOrder ? "(INTER-STATE / IGST)" : "(INTRA-STATE SALE)", pageWidth / 2, summaryY, { align: "center" });
    summaryY += 3.0;

    drawDashedLine(summaryY);
    summaryY += 4.0;

    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    if (isInterstateOrder) {
      doc.text("HSN/SAC", margin, summaryY);
      doc.text("Taxable", 38, summaryY, { align: "right" });
      doc.text("Rate", 54, summaryY, { align: "right" });
      doc.text("IGST Amt", pageWidth - margin, summaryY, { align: "right" });
    } else {
      doc.text("HSN/SAC", margin, summaryY);
      doc.text("Taxable", 30, summaryY, { align: "right" });
      doc.text("CGST", 44, summaryY, { align: "right" });
      doc.text("SGST", 58, summaryY, { align: "right" });
      doc.text("Total Tax", pageWidth - margin, summaryY, { align: "right" });
    }
    summaryY += 1.8;
    drawDashedLine(summaryY);
    summaryY += 4.0;

    doc.setFont("courier", "normal");
    doc.setFontSize(6.5);

    let totHsnBase = 0;
    let totHsnTax = 0;

    hsnList.forEach((grp) => {
      totHsnBase += grp.base;
      totHsnTax += grp.tax;

      const displayHsn = grp.hsn && grp.hsn !== "null" && grp.hsn !== "undefined"
        ? (grp.hsn.length > 8 ? grp.hsn.substring(0, 8) : grp.hsn)
        : "-";
      doc.text(displayHsn, margin, summaryY);

      if (isInterstateOrder) {
        doc.text(grp.base.toFixed(2), 38, summaryY, { align: "right" });
        doc.text(`${grp.rate.toFixed(1).replace(/\.0$/, "")}%`, 54, summaryY, { align: "right" });
        doc.text(grp.tax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
      } else {
        const halfTax = grp.tax / 2;
        doc.text(grp.base.toFixed(2), 30, summaryY, { align: "right" });
        doc.text(halfTax.toFixed(2), 44, summaryY, { align: "right" });
        doc.text(halfTax.toFixed(2), 58, summaryY, { align: "right" });
        doc.text(grp.tax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
      }
      summaryY += 3.8;
    });

    summaryY += 0.8;
    drawDashedLine(summaryY);
    summaryY += 3.8;

    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    doc.text("Total", margin, summaryY);

    if (isInterstateOrder) {
      doc.text(totHsnBase.toFixed(2), 38, summaryY, { align: "right" });
      doc.text(totHsnTax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
    } else {
      const halfTot = totHsnTax / 2;
      doc.text(totHsnBase.toFixed(2), 30, summaryY, { align: "right" });
      doc.text(halfTot.toFixed(2), 44, summaryY, { align: "right" });
      doc.text(halfTot.toFixed(2), 58, summaryY, { align: "right" });
      doc.text(totHsnTax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
    }

    summaryY += 2.0;
    drawDashedLine(summaryY);
    summaryY += 4.5;
  }

  // 5. FOOTER & QR CODE
  summaryY += 8;
  
  if (billQrUrlRaw) {
    try {
      const qrDataUrl = await QRCode.toDataURL(billQrUrlRaw, { margin: 1, width: 60 });
      const qrSize = 25;
      doc.addImage(qrDataUrl, "PNG", (pageWidth - qrSize) / 2, summaryY, qrSize, qrSize);
      summaryY += qrSize + 4;
    } catch (e) {
      console.warn("Failed to generate QR code", e);
    }
  } else {
    summaryY += 2;
  }
  
  // App Store Badges
  const badgeWidth = 26;
  const badgeHeight = 8;
  const badgeGap = 4;
  const totalBadgesWidth = badgeWidth * 2 + badgeGap;
  const badgesStartX = (pageWidth - totalBadgesWidth) / 2;
  
  try {
    const [playStoreBase64, appStoreBase64] = await Promise.all([
      Promise.race([fetchImageAsBase64("/images/google-play.png"), new Promise<string>((_, r) => setTimeout(() => r(""), 2000))]),
      Promise.race([fetchImageAsBase64("/images/app-store.png"), new Promise<string>((_, r) => setTimeout(() => r(""), 2000))])
    ]);
    
    if (playStoreBase64) {
      doc.addImage(playStoreBase64, badgesStartX, summaryY, badgeWidth, badgeHeight);
    } else {
      throw new Error("Missing play store image");
    }
    
    if (appStoreBase64) {
      doc.addImage(appStoreBase64, badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight);
    } else {
      throw new Error("Missing app store image");
    }
  } catch (err) {
    const drawBadge = (x: number, yPos: number, width: number, height: number, text: string) => {
      doc.setFillColor(0, 0, 0);
      doc.roundedRect(x, yPos, width, height, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.5);
      doc.setFont("courier", "bold");
      doc.text(text, x + width / 2, yPos + height / 2 + 1, { align: "center" });
      doc.setTextColor(0, 0, 0);
    };
    
    drawBadge(badgesStartX, summaryY, badgeWidth, badgeHeight, "Google Play");
    drawBadge(badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight, "App Store");
  }
  
  doc.link(badgesStartX, summaryY, badgeWidth, badgeHeight, { url: "https://play.google.com/store/apps/details?id=com.apnagreenbasket" });
  doc.link(badgesStartX + badgeWidth + badgeGap, summaryY, badgeWidth, badgeHeight, { url: "https://www.apple.com/app-store/" });
  
  summaryY += badgeHeight + 6;

  // 6. STATUS STAMP & FOOTER
  doc.setFont("courier", "bold");
  doc.setFontSize(8);
  doc.text(`STATUS: REFUND PROCESSED (${returnData.refund_payment_method || "CASH"})`, pageWidth / 2, summaryY, { align: "center" });

  summaryY += 4.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text("*** INVENTORY RESTOCKED ***", pageWidth / 2, summaryY, { align: "center" });

  summaryY += 3.5;
  doc.text("Thank you for shopping with us!", pageWidth / 2, summaryY, { align: "center" });
  
  summaryY += 5;
  
  // Optional: Trim page height to fit content if we went over or under
  if (typeof doc.deletePage === 'function' && typeof doc.addPage === 'function' && doc.internal.pageSize.getHeight() !== summaryY) {
    // Note: jsPDF format modification after creation is complex, so we skip dynamic trim here for safety unless explicitly handled
  }

  if (action === "download") {
    doc.save(`Return-${invoiceNo}.pdf`);
  } else {
    window.open(doc.output("bloburl"), "_blank");
  }
}

// ==========================================
// DYNAMIC ANALYTICS PDF GENERATORS
// ==========================================

function drawHeader(doc: any, restaurant: any, title: string, dateRangeLabel: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFillColor(0, 112, 243);
  doc.rect(0, 0, pageWidth, 35, "F");
  
  doc.setTextColor(255, 255, 255);

  const resName = restaurant?.name || "ApnaGreen Basket";

  // Left Column
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(resName, 14, 14);
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 21);
  
  doc.setFontSize(9);
  doc.text(`Period: ${dateRangeLabel} | Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 28);

  // Right Column (Right-Aligned)
  if (restaurant) {
    const startX = pageWidth - 14;
    let currentY = 14;
    
    doc.setFontSize(8);
    const rightAlign = (txt: string, y: number) => {
      if (txt) doc.text(txt, startX, y, { align: "right" });
    };

    if (restaurant.address) { rightAlign(restaurant.address, currentY); currentY += 5; }
    
    const contactParts = [];
    if (restaurant.phone) contactParts.push(restaurant.phone);
    if (restaurant.email) contactParts.push(restaurant.email);
    if (contactParts.length) { rightAlign(contactParts.join(" | "), currentY); currentY += 5; }
    
    const legalParts = [];
    if (restaurant.gstin) legalParts.push(`GSTIN: ${restaurant.gstin}`);
    if (restaurant.fssai_no) legalParts.push(`FSSAI: ${restaurant.fssai_no}`);
    if (legalParts.length) { rightAlign(legalParts.join(" | "), currentY); currentY += 5; }
  }

  return 45;
}

export function generateInventoryPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  inventorySummaryData?: any,
  stockMovementData?: any,
  stockIntakeData?: any,
  wastageData?: any,
  purchaseReturnData?: any,
  supplierSpendData?: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "INVENTORY & STOCK REPORT", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  let sectionIdx = 1;

  if (inventorySummaryData?.reconciliation_bridge) {
    const rb = inventorySummaryData.reconciliation_bridge;
    doc.text(`${sectionIdx}. Executive Inventory Summary & Asset Valuation`, 14, y);
    sectionIdx++;
    y += 6;

    const opnVal = rb.opening_stock_value ?? 0;
    const clsVal = rb.closing_stock_value ?? rb.current_holding_value ?? 0;
    const netRev = rb.net_sold_revenue ?? rb.sold_inventory_revenue ?? 0;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Amount (INR)", "Accounting Context"]],
      body: [
        ["Opening Stock Asset", `INR ${opnVal.toFixed(2)}`, "Asset on hand at period start"],
        ["Gross Supplier Spend", `+INR ${rb.gross_inward_spend.toFixed(2)}`, "Intake batches received"],
        ["Purchase Returns", `-INR ${rb.purchase_returns.toFixed(2)}`, "Refunds & debit notes"],
        ["Net Supplier Spend", `INR ${rb.net_supplier_spend.toFixed(2)}`, "Actual inward procurement outlay"],
        ["Cost of Goods Sold (COGS)", `-INR ${rb.cost_of_goods_sold.toFixed(2)}`, "Intake cost of billed orders"],
        ["Operational Wastage", `-INR ${rb.wastage_cost.toFixed(2)}`, "Damaged, spoiled & voided"],
        ["Audit Count Discrepancies", `${rb.manual_adjustments >= 0 ? "+" : "-"}INR ${Math.abs(rb.manual_adjustments).toFixed(2)}`, "Physical stock variance"],
        ["Closing Stock Asset", `INR ${clsVal.toFixed(2)}`, "Unsold stock on shelves at period end"],
        ["Net Realized Sales Revenue", `INR ${netRev.toFixed(2)}`, "Counter sales net of discounts"],
        ["Realized Merchandise Profit", `INR ${rb.realized_net_profit.toFixed(2)}`, "Net trading margin realized"],
        ["Total Retained Economic Value", `INR ${rb.total_economic_value.toFixed(2)}`, "Realized profit + closing assets"],
      ],
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 8 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  
  if (stockMovementData?.items) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.text(`${sectionIdx}. Stock Movement (Top 15 Items)`, 14, y);
    sectionIdx++;
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Item", "Opening", "In (+)", "Out (-)", "Adj", "Closing"]],
      body: stockMovementData.items.slice(0, 15).map((i: any) => [
        i.item_name, 
        i.opening_stock, 
        i.intake_qty + i.restock_qty > 0 ? `+${i.intake_qty + i.restock_qty}` : "0", 
        i.sales_deduction_qty + i.purchase_return_qty + i.void_batch_qty > 0 ? `-${i.sales_deduction_qty + i.purchase_return_qty + i.void_batch_qty}` : "0", 
        i.manual_adjustment_qty, 
        `${i.closing_stock} ${i.unit}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (stockIntakeData?.items) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.text(`${sectionIdx}. Recent Stock Intakes`, 14, y);
    sectionIdx++;
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Item", "Batch", "Qty", "Unit Cost", "Supplier"]],
      body: stockIntakeData.items.slice(0, 10).map((i: any) => [
        new Date(i.intake_date).toLocaleDateString(), i.item_name, i.batch_number || "-", i.quantity, `INR ${i.unit_cost}`, i.supplier_name
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  
  if (wastageData?.items) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.text(`${sectionIdx}. Wastage Log`, 14, y);
    sectionIdx++;
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Item", "Qty", "Loss (INR)", "Reason"]],
      body: wastageData.items.slice(0, 10).map((w: any) => [
        new Date(w.date).toLocaleDateString(), w.item_name, w.quantity, w.loss_value, w.reason
      ]),
      theme: "grid", headStyles: { fillColor: [220, 38, 38] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (purchaseReturnData?.items) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.text(`${sectionIdx}. Purchase Returns`, 14, y);
    sectionIdx++;
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Item", "Supplier", "Qty", "Refund (INR)", "Reason"]],
      body: purchaseReturnData.items.slice(0, 10).map((r: any) => [
        new Date(r.created_at).toLocaleDateString(), r.item_name, r.supplier_name, r.quantity, r.total_refund_amount, r.reason
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (supplierSpendData?.suppliers) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.text(`${sectionIdx}. Supplier Spend Analysis`, 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Supplier Name", "Total Intakes", "Qty Supplied", "Total Spend (INR)", "% Share"]],
      body: supplierSpendData.suppliers.map((s: any) => [
        s.supplier_name, s.total_intakes, s.total_quantity, s.total_spend, `${s.share_pct.toFixed(1)}%`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
  }

  doc.save(`Inventory-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export function generateCustomersPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  newCustomerData: any,
  customerReturnData: any,
  loyaltyData: any,
  abandonedCartData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "CUSTOMERS & LOYALTY REPORT", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  if (newCustomerData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("1. Acquisition Summary", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["New Customers (Period)", newCustomerData.total_new_customers],
        ["Total Customers (All Time)", newCustomerData.total_customers_all_time]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
    
    if (newCustomerData.recent_customers) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.text("2. Recently Boarded Customers", 14, y);
      y += 6;
      (autoTable as any)(doc, {
        startY: y,
        head: [["Join Date", "Name", "Contact", "Total Orders", "Total Spent"]],
        body: newCustomerData.recent_customers.map((c: any) => [
          new Date(c.created_at).toLocaleDateString(), c.name || "Unknown", c.phone || c.email || "N/A", c.total_orders, `INR ${c.total_spent}`
        ]),
        theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }
  
  if (customerReturnData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("3. Customer Returns Summary", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["Total Returns", customerReturnData.total_returns ?? 0],
        ["Total Refund Amount", `INR ${(customerReturnData.total_refund_amount ?? 0).toFixed(2)}`],
        ["Return Rate %", `${(customerReturnData.return_rate_pct ?? 0).toFixed(2)}%`]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    if (customerReturnData.top_returned_items?.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.text("4. Top Returned Items", 14, y);
      y += 6;
      (autoTable as any)(doc, {
        startY: y,
        head: [["Item Name", "Return Count", "Qty Returned", "Total Refunded (INR)"]],
        body: customerReturnData.top_returned_items.map((item: any) => [
          item.item_name,
          item.return_count,
          item.total_quantity_returned,
          `INR ${(item.total_refund_amount ?? 0).toFixed(2)}`
        ]),
        theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    if (customerReturnData.returns?.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.text("5. Customer Returns Log", 14, y);
      y += 6;
      (autoTable as any)(doc, {
        startY: y,
        head: [["Date", "Return #", "Customer", "Items Qty", "Refund"]],
        body: customerReturnData.returns.slice(0, 15).map((r: any) => [
          new Date(r.created_at).toLocaleDateString(), r.return_number, r.customer_name || r.customer_phone || "N/A", r.items_returned, `INR ${r.total_refund_amount}`
        ]),
        theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  if (loyaltyData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("6. Loyalty Program Performance", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["Total Points Earned", loyaltyData.total_points_earned],
        ["Total Points Redeemed", loyaltyData.total_points_redeemed],
        ["Net Outstanding Points", loyaltyData.net_outstanding_points],
        ["Customers with Points", loyaltyData.total_customers_with_points],
        ["Avg Points/Customer", loyaltyData.avg_points_per_customer],
        ["Redemption Rate", `${loyaltyData.redemption_rate_pct}%`]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (abandonedCartData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("7. Abandoned Cart Analysis", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value"]],
      body: [
        ["Total Abandoned", abandonedCartData.total_abandoned],
        ["Total Converted", abandonedCartData.total_converted],
        ["Conversion Rate", `${abandonedCartData.conversion_rate_pct}%`],
        ["Total Abandoned Value", `INR ${abandonedCartData.total_abandoned_value}`],
        ["Avg Cart Value", `INR ${abandonedCartData.avg_cart_value}`]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.save(`Customers-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export function generateFinancialPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  profitData: any,
  billProfitData: any,
  taxSummaryData: any,
  cashDenomData: any,
  outletEarningsData?: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "FINANCIAL & TAX REPORT", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  if (profitData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("1. Profit Margin Summary", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Gross Revenue", "COGS", "Gross Profit", "Margin %"]],
      body: [
        [`INR ${profitData.total_revenue}`, `INR ${profitData.total_cogs}`, `INR ${profitData.total_profit}`, `${profitData.overall_margin_pct}%`]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (billProfitData?.bills) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("2. Bill-wise Profit Breakdown (Top 15)", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Bill #", "Date", "Revenue", "Est. COGS", "Est. Profit", "Margin %"]],
      body: billProfitData.bills.slice(0, 15).map((b: any) => [
        b.basket_number, new Date(b.created_at).toLocaleDateString(), b.total_amount, b.estimated_cogs, b.estimated_profit, `${b.margin_pct}%`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  
  if (taxSummaryData?.slabs) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("3. Tax Summary", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Tax Category", "Rate %", "Taxable Amt", "Tax Collected"]],
      body: taxSummaryData.slabs.map((t: any) => [
        t.tax_category, t.tax_rate, `INR ${t.taxable_amount}`, `INR ${t.tax_collected}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (cashDenomData?.overall_denominations) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("4. Cash Denominations (Drawer)", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Denomination", "Notes In", "Notes Out", "Net Notes", "Net Value"]],
      body: cashDenomData.overall_denominations.map((d: any) => [
        d.denomination, d.notes_in, d.notes_out, d.net_notes, `INR ${d.net_value}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (outletEarningsData) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("5. Outlet Earnings Ledger", 14, y);
    y += 6;
    
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Value (INR)"]],
      body: [
        ["Gross Revenue", `+ ${outletEarningsData.gross_revenue}`],
        ["Loyalty Value Redeemed", `- ${outletEarningsData.total_loyalty_discounts}`],
        ["Store Credit Applied", `- ${outletEarningsData.total_credit_applied}`],
        ["Udhaar Given (Shortfalls)", `- ${outletEarningsData.total_udhaar_given}`],
        ["Udhaar Recovered (Debt Settled)", `+ ${outletEarningsData.total_udhaar_recovered}`],
        ["Credit Cashed Out (Drawer)", `- ${outletEarningsData.total_credit_cashed_out}`],
        ["Credit Awarded (Drawer)", `+ ${outletEarningsData.total_credit_awarded}`],
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 9 }
    });
    y = (doc as any).lastAutoTable.finalY + 5;
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74); // Green
    doc.text(`NET DRAWER EARNINGS: INR ${outletEarningsData.net_drawer_earnings.toFixed(2)}`, 14, y + 5);
    doc.setTextColor(0, 0, 0); // Reset
    y += 15;
  }

  doc.save(`Financial-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export function generateDayBookPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  dayBookData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "DAY BOOK LEDGER", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  if (dayBookData) {
    doc.text(`Opening Balance: INR ${dayBookData.opening_cash}`, 14, y);
    y += 6;
    
    if (dayBookData.entries) {
      (autoTable as any)(doc, {
        startY: y,
        head: [["Time", "Type", "Ref", "Party / Contact", "Description", "Debit (Out)", "Credit (In)", "Balance"]],
        body: dayBookData.entries.map((e: any) => [
          new Date(e.timestamp).toLocaleTimeString(),
          e.entry_type.replace(/_/g, " "),
          e.reference_number || "-",
          e.entity_name ? `${e.entity_name}${e.entity_phone ? ` (${e.entity_phone})` : ""}` : "-",
          e.description, 
          e.debit > 0 ? e.debit : "",
          e.credit > 0 ? e.credit : "",
          e.running_balance
        ]),
        theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
    
    doc.text(`Closing Balance: INR ${dayBookData.closing_balance}`, 14, y);
  }

  doc.save(`DayBook-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export function generateSalesPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  categorySalesData: any,
  itemSalesData: any,
  aovData: any,
  paymentMixData: any,
  discountData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "SALES & ORDERS REPORT", dateRangeLabel);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  if (categorySalesData?.items) {
    doc.text("1. Sales by Category", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Category", "Qty Sold", "Revenue", "% of Total"]],
      body: categorySalesData.items.map((c: any) => [
        c.category_name, c.quantity_sold, `INR ${c.revenue.toFixed(2)}`, `${c.revenue_share_pct.toFixed(1)}%`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (itemSalesData?.items) {
    doc.text("2. Item-wise Sales", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Item Name", "Category", "Qty Sold", "Revenue"]],
      body: itemSalesData.items.slice(0, 15).map((i: any) => [
        i.item_name, i.category_name || "-", i.quantity_sold, `INR ${i.revenue.toFixed(2)}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (aovData?.trend) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("3. Average Order Value (AOV)", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Orders", "AOV"]],
      body: aovData.trend.slice(0, 15).map((t: any) => [
        new Date(t.bucket).toLocaleDateString(), t.orders_count, `INR ${t.avg_order_value.toFixed(2)}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (paymentMixData?.methods) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("4. Payment Mix", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Method", "Txn Count", "Revenue", "% of Total"]],
      body: paymentMixData.methods.map((p: any) => [
        p.payment_method.replace(/_/g, " "), p.orders_count, `INR ${p.total_revenue.toFixed(2)}`, `${p.revenue_share_pct.toFixed(1)}%`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (discountData?.by_type) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.text("5. Discounts & Offers", 14, y);
    y += 6;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Type", "Usage Count", "Discount Value"]],
      body: discountData.by_type.map((d: any) => [
        d.discount_type, d.count, `INR ${d.total_amount.toFixed(2)}`
      ]),
      theme: "grid", headStyles: { fillColor: [51, 65, 85] }, styles: { fontSize: 8 }
    });
  }

  doc.save(`Sales-Orders-Report-${(restaurant?.name || "Report").replace(/\s+/g, "_")}.pdf`);
}

export function generateCategoryWiseSalesPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  categoryGroups: Array<{
    categoryName: string;
    totalRevenue: number;
    totalCogs: number;
    totalProfit: number;
    totalQty: number;
    marginPct: number;
    items: Array<any>;
  }>,
  overallStats: {
    totalRevenue: number;
    totalCogs: number;
    totalProfit: number;
    overallMargin: number;
    totalUnits: number;
  }
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "CATEGORY-WISE SALES & MARGINS REPORT", dateRangeLabel);

  // Executive Summary Card Table
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("EXECUTIVE SALES & PROFITABILITY SUMMARY", 14, y);
  y += 4;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Total Revenue", "Total COGS", "Gross Profit", "Overall Margin", "Total Units Sold", "Categories"]],
    body: [[
      `INR ${overallStats.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `INR ${overallStats.totalCogs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `INR ${overallStats.totalProfit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${overallStats.overallMargin.toFixed(1)}%`,
      `${overallStats.totalUnits.toLocaleString("en-IN", { maximumFractionDigits: 2 })} units`,
      `${categoryGroups.length} categories`
    ]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: "bold" },
    styles: { fontSize: 8, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Individual Category Tables
  categoryGroups.forEach((group, index) => {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(
      `${index + 1}. ${group.categoryName.toUpperCase()} (${group.items.length} items | Rev: INR ${group.totalRevenue.toFixed(2)} | Profit: INR ${group.totalProfit.toFixed(2)} | Margin: ${group.marginPct.toFixed(1)}%)`,
      14,
      y
    );
    y += 4;

    const tableBody = group.items.map((it) => {
      const itemCogs = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
      const itemProfit = it.estimated_profit !== null && it.estimated_profit !== undefined
        ? it.estimated_profit
        : it.revenue - itemCogs;
      const itemMargin = it.margin_pct !== null && it.margin_pct !== undefined
        ? it.margin_pct
        : (it.revenue > 0 ? (itemProfit / it.revenue) * 100 : 0);
      const unitCost = it.cost_per_unit !== null && it.cost_per_unit !== undefined
        ? it.cost_per_unit
        : (it.quantity_sold > 0 ? itemCogs / it.quantity_sold : 0);

      return [
        it.item_name,
        it.quantity_sold % 1 === 0 ? it.quantity_sold : it.quantity_sold.toFixed(2),
        `INR ${it.revenue.toFixed(2)}`,
        `INR ${unitCost.toFixed(2)}`,
        `INR ${itemCogs.toFixed(2)}`,
        `INR ${itemProfit.toFixed(2)}`,
        `${itemMargin.toFixed(1)}%`
      ];
    });

    // Subtotal Row
    tableBody.push([
      `Subtotal (${group.categoryName})`,
      group.totalQty % 1 === 0 ? String(group.totalQty) : group.totalQty.toFixed(2),
      `INR ${group.totalRevenue.toFixed(2)}`,
      "—",
      `INR ${group.totalCogs.toFixed(2)}`,
      `INR ${group.totalProfit.toFixed(2)}`,
      `${group.marginPct.toFixed(1)}%`
    ]);

    (autoTable as any)(doc, {
      startY: y,
      head: [["Item Name", "Qty", "Revenue", "Unit Cost", "COGS", "Profit", "Margin %"]],
      body: tableBody,
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
      styles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" }
      },
      didParseCell: (dataCell: any) => {
        if (dataCell.row.index === tableBody.length - 1) {
          dataCell.cell.styles.fontStyle = "bold";
          dataCell.cell.styles.fillColor = [241, 245, 249];
        }
      }
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  });

  const outletSlug = (restaurant?.name || "Report").replace(/\s+/g, "_");
  doc.save(`Category_Wise_Sales_${outletSlug}.pdf`);
}

export function generateFlatItemSalesPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  items: Array<any>,
  overallStats: {
    totalRevenue: number;
    totalCogs: number;
    totalProfit: number;
    overallMargin: number;
    totalUnits: number;
  },
  filterCategoryName?: string
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  const title = filterCategoryName 
    ? `ITEM SALES REPORT (${filterCategoryName.toUpperCase()})` 
    : "ITEM SALES & PROFITABILITY REPORT";
  let y = drawHeader(doc, restaurant, title, dateRangeLabel);

  // Executive Summary Card Table
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("EXECUTIVE SALES & PROFITABILITY SUMMARY", 14, y);
  y += 4;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Total Revenue", "Total COGS", "Gross Profit", "Overall Margin", "Total Units Sold", "Items Count"]],
    body: [[
      `INR ${overallStats.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `INR ${overallStats.totalCogs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `INR ${overallStats.totalProfit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${overallStats.overallMargin.toFixed(1)}%`,
      `${overallStats.totalUnits.toLocaleString("en-IN", { maximumFractionDigits: 2 })} units`,
      `${items.length} items`
    ]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontSize: 8, fontStyle: "bold" },
    styles: { fontSize: 8, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(`ITEM-BY-ITEM BREAKDOWN (${items.length} items)`, 14, y);
  y += 4;

  const tableBody = items.map((it) => {
    const itemCogs = it.cogs !== undefined ? it.cogs : (it.cost_per_unit || 0) * (it.quantity_sold || 0);
    const itemProfit = it.estimated_profit !== null && it.estimated_profit !== undefined
      ? it.estimated_profit
      : it.revenue - itemCogs;
    const itemMargin = it.margin_pct !== null && it.margin_pct !== undefined
      ? it.margin_pct
      : (it.revenue > 0 ? (itemProfit / it.revenue) * 100 : 0);
    const unitCost = it.cost_per_unit !== null && it.cost_per_unit !== undefined
      ? it.cost_per_unit
      : (it.quantity_sold > 0 ? itemCogs / it.quantity_sold : 0);

    return [
      it.item_name,
      it.category_name || "Uncategorized",
      it.quantity_sold % 1 === 0 ? it.quantity_sold : it.quantity_sold.toFixed(2),
      `INR ${it.revenue.toFixed(2)}`,
      `INR ${unitCost.toFixed(2)}`,
      `INR ${itemCogs.toFixed(2)}`,
      `INR ${itemProfit.toFixed(2)}`,
      `${itemMargin.toFixed(1)}%`
    ];
  });

  // Grand Total Row
  tableBody.push([
    "GRAND TOTAL",
    `All ${items.length} Items`,
    overallStats.totalUnits % 1 === 0 ? String(overallStats.totalUnits) : overallStats.totalUnits.toFixed(2),
    `INR ${overallStats.totalRevenue.toFixed(2)}`,
    "—",
    `INR ${overallStats.totalCogs.toFixed(2)}`,
    `INR ${overallStats.totalProfit.toFixed(2)}`,
    `${overallStats.overallMargin.toFixed(1)}%`
  ]);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Item Name", "Category", "Qty", "Revenue", "Unit Cost", "COGS", "Profit", "Margin %"]],
    body: tableBody,
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
    styles: { fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 28 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" }
    },
    didParseCell: (dataCell: any) => {
      if (dataCell.row.index === tableBody.length - 1) {
        dataCell.cell.styles.fontStyle = "bold";
        dataCell.cell.styles.fillColor = [241, 245, 249];
      }
    }
  });

  const outletSlug = (restaurant?.name || "Report").replace(/\s+/g, "_");
  doc.save(`Item_Sales_Flat_${outletSlug}.pdf`);
}

export function generateBillsHistoryPdfReport({
  restaurant,
  dateRangeLabel,
  statusFilterLabel,
  searchQuery,
  bills,
}: {
  restaurant: any;
  dateRangeLabel: string;
  statusFilterLabel: string;
  searchQuery?: string;
  bills: any[];
}) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "BILLS & SALES HISTORY REPORT", dateRangeLabel);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);

  const filterSummaryParts = [
    `Status Filter: ${statusFilterLabel || "ALL"}`,
    searchQuery ? `Search: "${searchQuery}"` : null,
    `Total Records: ${bills.length}`,
  ].filter(Boolean).join("   |   ");

  doc.text(filterSummaryParts, 14, y);
  y += 6;

  // 1. Executive / KPI Summary
  let totalGrandSales = 0;
  let totalSubtotal = 0;
  let totalDiscounts = 0;
  let paidCount = 0;
  let draftCount = 0;
  let cancelledOrRefundedCount = 0;
  const paymentBreakdown: Record<string, number> = {};

  bills.forEach((b: any) => {
    const s = (b.status || "").toUpperCase();
    const total = Number(b.total_amount || 0);
    const sub = Number(b.subtotal_amount || total);
    const disc = Number(b.discount_value || 0) || Math.max(0, sub - total);

    totalGrandSales += total;
    totalSubtotal += sub;
    totalDiscounts += disc;

    if (s === "PAID" || s === "COMPLETED" || s === "FINALIZED") {
      paidCount++;
      const pm = (b.payment_method || "CASH").toUpperCase();
      paymentBreakdown[pm] = (paymentBreakdown[pm] || 0) + total;
    } else if (s === "CANCELLED" || s === "REFUNDED") {
      cancelledOrRefundedCount++;
    } else {
      draftCount++;
    }
  });

  (autoTable as any)(doc, {
    startY: y,
    head: [["Total Bills", "Paid / Settled", "Draft / Pending", "Cancelled / Refunded", "Total Discounts", "Grand Total"]],
    body: [
      [
        bills.length,
        paidCount,
        draftCount,
        cancelledOrRefundedCount,
        `Rs. ${totalDiscounts.toFixed(2)}`,
        `Rs. ${totalGrandSales.toFixed(2)}`,
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8, halign: "center" },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // 2. Bills Details Table
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`Bills Listing (${bills.length} Bills)`, 14, y);
  y += 4;

  const tableRows = bills.map((b: any, idx: number) => {
    const billId = b.id ? `#${b.id.slice(0, 8).toUpperCase()}` : "—";
    
    // Format timestamp
    let dtStr = "—";
    if (b.created_at) {
      try {
        const d = new Date(b.created_at);
        dtStr = d.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
      } catch {
        dtStr = String(b.created_at).slice(0, 16);
      }
    }

    // Customer & Basket (Name first, then Walk-In / Basket)
    const basketStr = b.basket_number && b.basket_number.toUpperCase().includes("WALK")
      ? "Walk-In"
      : `Basket #${b.basket_number || "Walk-In"}`;
    const custAndBasket = b.customer_name ? `${b.customer_name}\n${basketStr}` : basketStr;

    const itemsCount = `${b.items?.length || 0} item${b.items?.length === 1 ? "" : "s"}`;
    const payMethod = b.payment_method || (b.status === "PAID" ? "CASH" : "—");
    const subtotal = `Rs. ${(Number(b.subtotal_amount) || Number(b.total_amount) || 0).toFixed(2)}`;
    
    const discVal = Number(b.discount_value || 0) || Math.max(0, (Number(b.subtotal_amount) || 0) - (Number(b.total_amount) || 0));
    const discount = discVal > 0 ? `Rs. ${discVal.toFixed(2)}` : "—";
    
    const grandTotal = `Rs. ${(Number(b.total_amount) || 0).toFixed(2)}`;
    const status = (b.status || "DRAFT").toUpperCase();

    return [
      idx + 1,
      billId,
      dtStr,
      custAndBasket,
      itemsCount,
      payMethod,
      subtotal,
      discount,
      grandTotal,
      status,
    ];
  });

  (autoTable as any)(doc, {
    startY: y,
    margin: { left: 14, right: 14 },
    head: [["#", "Bill ID", "Date & Time", "Customer & Basket", "Items", "Pay Mode", "Subtotal", "Discount", "Grand Total", "Status"]],
    body: tableRows.length > 0 ? tableRows : [["—", "No bills found", "—", "—", "—", "—", "—", "—", "—", "—"]],
    foot: tableRows.length > 0 ? [
      [
        { content: "Total", colSpan: 3, styles: { halign: "left", fontStyle: "bold" } },
        `${bills.length} Bills`,
        "",
        "",
        `Rs. ${totalSubtotal.toFixed(2)}`,
        `Rs. ${totalDiscounts.toFixed(2)}`,
        `Rs. ${totalGrandSales.toFixed(2)}`,
        "",
      ]
    ] : undefined,
    theme: "striped",
    showHead: "everyPage",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 8,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 1.5,
      overflow: "linebreak",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 7, halign: "center" },
      1: { cellWidth: 22, fontStyle: "bold" },
      2: { cellWidth: 26 },
      3: { cellWidth: 25 },
      4: { cellWidth: 13, halign: "center" },
      5: { cellWidth: 14, halign: "center" },
      6: { cellWidth: 18, halign: "right" },
      7: { cellWidth: 16, halign: "right" },
      8: { cellWidth: 18, halign: "right", fontStyle: "bold" },
      9: { cellWidth: 23, halign: "center" },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 3 && String(data.cell.raw).includes("\n")) {
        data.cell.styles.minCellHeight = 10.5;
      }
    },
    willDrawCell: (data: any) => {
      if (data.section === "body" && data.column.index === 3 && String(data.cell.raw).includes("\n")) {
        data.cell.text = [];
      }
    },
    didDrawCell: (data: any) => {
      if (data.section === "body" && data.column.index === 3 && String(data.cell.raw).includes("\n")) {
        const parts = String(data.cell.raw).split("\n");
        const custName = parts[0];
        const basketText = parts.slice(1).join(" ");
        const padLeft = data.cell.padding("left");
        const padTop = data.cell.padding("top");
        const availWidth = data.cell.width - padLeft - data.cell.padding("right");
        const x = data.cell.x + padLeft;
        let currY = data.cell.y + padTop + 0.3;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        const nameLines = doc.splitTextToSize(custName, availWidth);
        doc.text(nameLines, x, currY, { baseline: "top" });

        currY += nameLines.length * 3.8;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(basketText, x, currY, { baseline: "top" });
      }
    },
    didDrawPage: (data: any) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      
      const footerText = `Page ${data.pageNumber} of ${pageCount}  •  Apna Green Basket POS  •  Exported on ${new Date().toLocaleString("en-IN")}`;
      doc.text(footerText, 14, doc.internal.pageSize.height - 8);
    },
  });

  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  const cleanFilter = (statusFilterLabel || "ALL").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `Bills_History_${cleanStoreName}_${cleanFilter}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
