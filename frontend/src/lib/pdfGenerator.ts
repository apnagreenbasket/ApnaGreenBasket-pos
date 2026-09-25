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
  actionOpt: "download" | "view" | "print" = "download"
) {
  let storeDetails: any = undefined;
  let action: "download" | "view" | "print" = actionOpt;

  if (typeof storeDetailsOrAction === "string") {
    if (storeDetailsOrAction === "download" || storeDetailsOrAction === "view" || storeDetailsOrAction === "print") {
      action = storeDetailsOrAction;
    }
  } else if (typeof storeDetailsOrAction === "object" && storeDetailsOrAction !== null) {
    storeDetails = storeDetailsOrAction;
  }

  // Pure Monospaced Courier Thermal POS Format (Standard 72mm Thermal Print Head for 80mm Paper)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [72, 297], // 72mm matches the exact physical 576-dot thermal print head of 80mm POS printers
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 72mm
  const margin = 4;
  const contentWidth = pageWidth - margin * 2; // 64mm safe printable width to prevent physical clipping

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
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.text(addressStr, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += 3.5;
  }
  
  const billQrUrlRaw = getOutletField("bill_qr_url");
  if (billQrUrlRaw) {
    try {
      const parsedUrl = new URL(billQrUrlRaw);
      doc.setFont("courier", "bold");
      doc.setFontSize(7);
      doc.text(parsedUrl.hostname, pageWidth / 2, y, { align: "center" });
      y += 3.5;
    } catch {
      // Ignore if not a valid URL
    }
  }

  const fssai = getOutletField("fssai_no");
  if (fssai) {
    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    doc.text(`FSSAI Reg No: ${fssai}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }

  const gstin = getOutletField("gstin") || "01AAFCB7044K1ZV";
  doc.setFont("courier", "bold");
  doc.setFontSize(7);
  doc.text(`GSTIN: ${gstin}`, pageWidth / 2, y, { align: "center" });
  y += 3.5;
  
  const phoneStr = getOutletField("phone");
  if (phoneStr) {
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.text(`Phone: ${phoneStr}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }
  
  const emailStr = getOutletField("email");
  if (emailStr) {
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
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
  doc.setFont("courier", "bold");
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
  const guestPhone = (order as any).customer?.phone || (order as any).customer_phone;
  const mobText = guestPhone ? `Mob: ${guestPhone}` : "";
  const mobWidth = mobText ? doc.getTextWidth(mobText) : 0;
  const availCustWidth = mobText ? Math.max(25, contentWidth - mobWidth - 2) : contentWidth;

  const fullCustText = `Customer: ${guestName}`;
  let custLines: string[];
  if (!mobText) {
    custLines = doc.splitTextToSize(fullCustText, contentWidth);
  } else {
    const lines1 = doc.splitTextToSize(fullCustText, availCustWidth);
    if (lines1.length <= 1) {
      custLines = lines1;
    } else {
      const firstLine = lines1[0];
      const remainder = fullCustText.slice(firstLine.length).trim();
      const restLines = doc.splitTextToSize(remainder, contentWidth);
      custLines = [firstLine, ...restLines];
    }
  }

  doc.text(custLines[0], margin, y);
  if (mobText) {
    doc.text(mobText, pageWidth - margin, y, { align: "right" });
  }

  for (let i = 1; i < custLines.length; i++) {
    y += 3.5;
    doc.text(custLines[i], margin, y);
  }

  const custGstin = (order as any).customer_gstin || (order as any).customer?.gstin;
  const custLegalName = (order as any).customer_legal_name || (order as any).customer?.legal_name;
  if (custGstin) {
    y += 3.5;
    doc.text(`GSTIN   : ${custGstin}`, margin, y);
  }
  if (custLegalName && custLegalName !== guestName) {
    const legalLines = doc.splitTextToSize(`Legal   : ${custLegalName}`, contentWidth);
    for (const line of legalLines) {
      y += 3.5;
      doc.text(line, margin, y);
    }
  }

  const isInterstate = Boolean((order as any).is_interstate);
  const placeOfSupply = (order as any).place_of_supply || getOutletField("place_of_supply");
  if (placeOfSupply) {
    const posLines = doc.splitTextToSize(`Place of Supply: ${placeOfSupply}${isInterstate ? " (Inter-State)" : ""}`, contentWidth);
    for (const line of posLines) {
      y += 3.5;
      doc.text(line, margin, y);
    }
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
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
      textColor: [0, 0, 0],
      lineWidth: 0,
    },
    headStyles: {
      font: "courier",
      fontStyle: "bold",
      fontSize: 7,
      textColor: [0, 0, 0],
      fillColor: false,
    },
    columnStyles: {
      0: { cellWidth: 20, halign: "left" },
      1: { cellWidth: 11, halign: "center" },
      2: { cellWidth: 11, halign: "right" },
      3: { cellWidth: 11, halign: "right" },
      4: { cellWidth: 11, halign: "right" },
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

  doc.setFont("courier", "bold");
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
    doc.setFont("courier", "bold");
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
      doc.setFont("courier", "bold");
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
      doc.setFont("courier", "bold");
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
      doc.setFont("courier", "bold");
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
      doc.setFont("courier", "bold");
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
      doc.setFont("courier", "bold");
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

    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    doc.text(isInterstateOrder ? "(INTER-STATE / IGST)" : "(INTRA-STATE SALE)", pageWidth / 2, summaryY, { align: "center" });
    summaryY += 3.0;

    drawDashedLine(summaryY);
    summaryY += 4.0;

    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    if (isInterstateOrder) {
      doc.text("HSN/SAC", margin, summaryY);
      doc.text("Taxable", 32, summaryY, { align: "right" });
      doc.text("Rate", 48, summaryY, { align: "right" });
      doc.text("IGST Amt", pageWidth - margin, summaryY, { align: "right" });
    } else {
      doc.text("HSN/SAC", margin, summaryY);
      doc.text("Taxable", 26, summaryY, { align: "right" });
      doc.text("CGST", 40, summaryY, { align: "right" });
      doc.text("SGST", 54, summaryY, { align: "right" });
      doc.text("Total Tax", pageWidth - margin, summaryY, { align: "right" });
    }
    summaryY += 1.8;
    drawDashedLine(summaryY);
    summaryY += 4.0;

    doc.setFont("courier", "bold");
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
        doc.text(grp.base.toFixed(2), 32, summaryY, { align: "right" });
        doc.text(`${grp.rate.toFixed(1).replace(/\.0$/, "")}%`, 48, summaryY, { align: "right" });
        doc.text(grp.tax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
      } else {
        const halfTax = grp.tax / 2;
        doc.text(grp.base.toFixed(2), 26, summaryY, { align: "right" });
        doc.text(halfTax.toFixed(2), 40, summaryY, { align: "right" });
        doc.text(halfTax.toFixed(2), 54, summaryY, { align: "right" });
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
      doc.text(totHsnBase.toFixed(2), 32, summaryY, { align: "right" });
      doc.text(totHsnTax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
    } else {
      const halfTot = totHsnTax / 2;
      doc.text(totHsnBase.toFixed(2), 26, summaryY, { align: "right" });
      doc.text(halfTot.toFixed(2), 40, summaryY, { align: "right" });
      doc.text(halfTot.toFixed(2), 54, summaryY, { align: "right" });
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
  
  if (action === "print") {
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    const printWindow = window.open(blobUrl, "_blank");
    if (printWindow) {
      printWindow.focus();
    }
  } else if (action === "view") {
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
  actionOpt: "download" | "view" | "print" = "download",
  menuItemsMap?: Record<string, any>
) {
  let storeDetails: any = undefined;
  let action: "download" | "view" | "print" = actionOpt;
  if (storeDetailsOrAction === "download" || storeDetailsOrAction === "view" || storeDetailsOrAction === "print") {
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
    format: [72, 297],
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 72mm
  const margin = 4;
  const contentWidth = pageWidth - margin * 2; // 64mm safe printable width for thermal printers
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
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.text(addressStr, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += 3.5;
  }
  
  const billQrUrlRaw = getOutletField("bill_qr_url");
  if (billQrUrlRaw) {
    try {
      const parsedUrl = new URL(billQrUrlRaw);
      doc.setFont("courier", "bold");
      doc.setFontSize(7);
      doc.text(parsedUrl.hostname, pageWidth / 2, y, { align: "center" });
      y += 3.5;
    } catch { }
  }

  const fssai = getOutletField("fssai_no");
  if (fssai) {
    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    doc.text(`FSSAI Reg No: ${fssai}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }

  const gstin = getOutletField("gstin") || "01AAFCB7044K1ZV";
  doc.setFont("courier", "bold");
  doc.setFontSize(7);
  doc.text(`GSTIN: ${gstin}`, pageWidth / 2, y, { align: "center" });
  y += 3.5;
  
  const phoneStr = getOutletField("phone");
  if (phoneStr) {
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.text(`Phone: ${phoneStr}`, pageWidth / 2, y, { align: "center" });
    y += 3.5;
  }
  
  const emailStr = getOutletField("email");
  if (emailStr) {
    doc.setFont("courier", "bold");
    doc.setFontSize(7);
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
  doc.setFont("courier", "bold");
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
  const guestPhone = returnData.customer_phone;
  const mobText = guestPhone ? `Mob: ${guestPhone}` : "";
  const mobWidth = mobText ? doc.getTextWidth(mobText) : 0;
  const availCustWidth = mobText ? Math.max(25, contentWidth - mobWidth - 2) : contentWidth;

  const fullCustText = `Customer  : ${guestName}`;
  let custLines: string[];
  if (!mobText) {
    custLines = doc.splitTextToSize(fullCustText, contentWidth);
  } else {
    const lines1 = doc.splitTextToSize(fullCustText, availCustWidth);
    if (lines1.length <= 1) {
      custLines = lines1;
    } else {
      const firstLine = lines1[0];
      const remainder = fullCustText.slice(firstLine.length).trim();
      const restLines = doc.splitTextToSize(remainder, contentWidth);
      custLines = [firstLine, ...restLines];
    }
  }

  doc.text(custLines[0], margin, y);
  if (mobText) {
    doc.text(mobText, pageWidth - margin, y, { align: "right" });
  }

  for (let i = 1; i < custLines.length; i++) {
    y += 3.5;
    doc.text(custLines[i], margin, y);
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
    const posLines = doc.splitTextToSize(`Place of Supply: ${placeOfSupply}${isInterstateOrder ? " (Inter-State)" : ""}`, contentWidth);
    for (const line of posLines) {
      y += 3.5;
      doc.text(line, margin, y);
    }
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
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
      textColor: [0, 0, 0],
      lineWidth: 0,
    },
    headStyles: {
      font: "courier",
      fontStyle: "bold",
      fontSize: 7,
      textColor: [0, 0, 0],
      fillColor: false,
    },
    columnStyles: {
      0: { cellWidth: 20, halign: "left" },
      1: { cellWidth: 11, halign: "center" },
      2: { cellWidth: 11, halign: "right" },
      3: { cellWidth: 11, halign: "right" },
      4: { cellWidth: 11, halign: "right" },
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
        fontStyle: "bold",
        fontSize: 7,
        cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
        textColor: [0, 0, 0],
        lineWidth: 0,
      },
      headStyles: {
        font: "courier",
        fontStyle: "bold",
        fontSize: 7,
        textColor: [0, 0, 0],
        fillColor: false,
      },
      columnStyles: {
        0: { cellWidth: 28, halign: "left" },
        1: { cellWidth: 14, halign: "center" },
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
  
  doc.setFont("courier", "bold");
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
      doc.setFont("courier", "bold");
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
      doc.setFont("courier", "bold");
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

    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    doc.text(isInterstateOrder ? "(INTER-STATE / IGST)" : "(INTRA-STATE SALE)", pageWidth / 2, summaryY, { align: "center" });
    summaryY += 3.0;

    drawDashedLine(summaryY);
    summaryY += 4.0;

    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    if (isInterstateOrder) {
      doc.text("HSN/SAC", margin, summaryY);
      doc.text("Taxable", 32, summaryY, { align: "right" });
      doc.text("Rate", 48, summaryY, { align: "right" });
      doc.text("IGST Amt", pageWidth - margin, summaryY, { align: "right" });
    } else {
      doc.text("HSN/SAC", margin, summaryY);
      doc.text("Taxable", 26, summaryY, { align: "right" });
      doc.text("CGST", 40, summaryY, { align: "right" });
      doc.text("SGST", 54, summaryY, { align: "right" });
      doc.text("Total Tax", pageWidth - margin, summaryY, { align: "right" });
    }
    summaryY += 1.8;
    drawDashedLine(summaryY);
    summaryY += 4.0;

    doc.setFont("courier", "bold");
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
        doc.text(grp.base.toFixed(2), 32, summaryY, { align: "right" });
        doc.text(`${grp.rate.toFixed(1).replace(/\.0$/, "")}%`, 48, summaryY, { align: "right" });
        doc.text(grp.tax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
      } else {
        const halfTax = grp.tax / 2;
        doc.text(grp.base.toFixed(2), 26, summaryY, { align: "right" });
        doc.text(halfTax.toFixed(2), 40, summaryY, { align: "right" });
        doc.text(halfTax.toFixed(2), 54, summaryY, { align: "right" });
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
      doc.text(totHsnBase.toFixed(2), 32, summaryY, { align: "right" });
      doc.text(totHsnTax.toFixed(2), pageWidth - margin, summaryY, { align: "right" });
    } else {
      const halfTot = totHsnTax / 2;
      doc.text(totHsnBase.toFixed(2), 26, summaryY, { align: "right" });
      doc.text(halfTot.toFixed(2), 40, summaryY, { align: "right" });
      doc.text(halfTot.toFixed(2), 54, summaryY, { align: "right" });
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

  if (action === "print") {
    doc.autoPrint();
    const blobUrl = doc.output("bloburl");
    const printWindow = window.open(blobUrl, "_blank");
    if (printWindow) {
      printWindow.focus();
    }
  } else if (action === "download") {
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

export function formatReportDateRange(datePreset: string, customFromDate?: string, customToDate?: string): string {
  if (datePreset === "custom" && customFromDate && customToDate) {
    return `${customFromDate} to ${customToDate}`;
  }
  const presetLabels: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    last_7: "Last 7 Days",
    last_30: "Last 30 Days",
    this_month: "This Month",
    last_month: "Last Month",
    custom: customFromDate && customToDate ? `${customFromDate} to ${customToDate}` : "Custom Period",
  };
  return presetLabels[datePreset] || (datePreset || "All Time").replace(/_/g, " ").toUpperCase();
}

function addPdfFooter(doc: any, restaurant: any) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    const storeName = restaurant?.name || "ApnaGreen Basket";
    const footerText = `Page ${i} of ${pageCount}  •  ${storeName}  •  Exported on ${new Date().toLocaleString("en-IN")}`;
    doc.text(footerText, 14, doc.internal.pageSize.height - 8);
  }
}

// ==========================================
// 1. DASHBOARD REPORT
// ==========================================
export function generateDashboardPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  kpiData: any,
  topItemsData?: any,
  peakHoursData?: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "EXECUTIVE DASHBOARD & METRICS REPORT", dateRangeLabel);

  if (!kpiData) {
    doc.setFontSize(10);
    doc.text("No dashboard data available for this period.", 14, y + 10);
    doc.save(`Dashboard_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Executive Performance Metrics", 14, y);
  y += 5;

  const grossBilledText = (kpiData.total_return_amount || 0) > 0 
    ? `Gross: INR ${(kpiData.gross_revenue ?? (kpiData.total_revenue + kpiData.total_return_amount)).toLocaleString("en-IN", { minimumFractionDigits: 2 })} | Returns: -INR ${(kpiData.total_return_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
    : "Net billed sales after customer concessions";

  (autoTable as any)(doc, {
    startY: y,
    head: [["Metric Card", "Current Value", "Key Context & Accounting Details"]],
    body: [
      [
        "Net Counter Revenue",
        `INR ${(kpiData.total_revenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${(kpiData.revenue_change_pct || 0) >= 0 ? "+" : ""}${kpiData.revenue_change_pct || 0}% change vs prev period (${grossBilledText})`
      ],
      [
        "Completed Orders",
        `${kpiData.total_orders || 0}`,
        `${(kpiData.orders_change_pct || 0) >= 0 ? "+" : ""}${kpiData.orders_change_pct || 0}% vs previous period`
      ],
      [
        "New Registered Customers",
        `${kpiData.new_customers || 0}`,
        "First-time registered or billed customer accounts in this period"
      ],
      [
        "Voided Bills (Edited)",
        `INR ${(kpiData.void_return_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${kpiData.void_return_count || 0} bills edited/voided at register`
      ],
      [
        "Gross Profit Margin",
        `${kpiData.profit_margin_pct || 0}%`,
        "Overall margin retained from billed items (Revenue - COGS)"
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8.5 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { fontStyle: "bold", cellWidth: 40, halign: "right" },
      2: { cellWidth: 95 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Top Performing Items
  if (topItemsData?.items && Array.isArray(topItemsData.items) && topItemsData.items.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("2. Top Performing Menu Items", 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Rank", "Item Name", "Category", "Quantity Sold", "Revenue (INR)", "Revenue Share %"]],
      body: topItemsData.items.map((it: any, idx: number) => [
        `#${idx + 1}`,
        it.name,
        it.category_name || "Uncategorized",
        it.quantity_sold !== undefined ? (it.quantity_sold % 1 === 0 ? it.quantity_sold : it.quantity_sold.toFixed(2)) : "—",
        `INR ${(it.revenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        it.revenue_share_pct !== undefined ? `${it.revenue_share_pct.toFixed(1)}%` : "—"
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 15, halign: "center" },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
        5: { halign: "right" }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Peak Hours Distribution
  if (peakHoursData?.buckets && Array.isArray(peakHoursData.buckets) && peakHoursData.buckets.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("3. Peak Operating Hours Distribution", 14, y);
    y += 5;

    const totalPeakOrders = peakHoursData.buckets.reduce((acc: number, b: any) => acc + (b.orders_count || 0), 0);

    (autoTable as any)(doc, {
      startY: y,
      head: [["Hour Window", "Orders Processed", "% of Total Volume"]],
      body: peakHoursData.buckets.map((b: any) => {
        const pct = totalPeakOrders > 0 ? ((b.orders_count || 0) / totalPeakOrders) * 100 : 0;
        return [
          b.hour_label || `${b.hour}:00`,
          b.orders_count || 0,
          `${pct.toFixed(1)}%`
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        1: { halign: "right", fontStyle: "bold" },
        2: { halign: "right" }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Dashboard_Report_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==========================================
// 3. INVENTORY & STOCK REPORTS
// ==========================================

export function generateInventorySummaryPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  inventorySummaryData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "INVENTORY SUMMARY & ASSET VALUATION REPORT", dateRangeLabel);

  if (!inventorySummaryData?.reconciliation_bridge) {
    doc.setFontSize(10);
    doc.text("No inventory reconciliation bridge available for this period.", 14, y + 10);
    doc.save(`Inventory_Summary_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const rb = inventorySummaryData.reconciliation_bridge;
  const opnVal = rb.opening_stock_value ?? 0;
  const clsVal = rb.closing_stock_value ?? rb.current_holding_value ?? 0;
  const netRev = rb.net_sold_revenue ?? rb.sold_inventory_revenue ?? 0;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Valuation Component", "Amount (INR)", "Accounting Context"]],
    body: [
      ["Opening Stock Asset", `INR ${opnVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Asset on hand at period start"],
      ["Gross Supplier Spend", `+INR ${(rb.gross_inward_spend || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Intake batches received"],
      ["Purchase Returns", `-INR ${(rb.purchase_returns || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Refunds & debit notes"],
      ["Net Supplier Spend", `INR ${(rb.net_supplier_spend || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Actual inward procurement outlay"],
      ["Cost of Goods Sold (COGS)", `-INR ${(rb.cost_of_goods_sold || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Intake cost of billed orders"],
      ["Operational Wastage", `-INR ${(rb.wastage_cost || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Damaged, spoiled & voided"],
      ["Audit Count Discrepancies", `${(rb.manual_adjustments || 0) >= 0 ? "+" : "-"}INR ${Math.abs(rb.manual_adjustments || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Physical stock variance"],
      ["Closing Stock Asset", `INR ${clsVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Unsold stock on shelves at period end"],
      ["Net Realized Sales Revenue", `INR ${netRev.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Counter sales net of discounts"],
      ["Realized Merchandise Profit", `INR ${(rb.realized_net_profit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Net trading margin realized"],
      ["Total Retained Economic Value", `INR ${(rb.total_economic_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Realized profit + closing assets"],
    ],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Inventory_Summary_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateStockMovementPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  stockMovementData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "STOCK MOVEMENT AUDIT REPORT", dateRangeLabel);

  const items = stockMovementData?.items || [];

  (autoTable as any)(doc, {
    startY: y,
    head: [["Total Items Tracked", "Report Period", "Generated At"]],
    body: [[
      `${items.length} items`,
      dateRangeLabel,
      new Date().toLocaleString("en-IN")
    ]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: { fontSize: 8.5, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Item Name", "Opening", "Total In (+)", "Total Out (-)", "Adjustments", "Closing Stock"]],
    body: items.map((i: any) => {
      const totalIn = (i.intake_qty || 0) + (i.restock_qty || 0);
      const totalOut = (i.sales_deduction_qty || 0) + (i.purchase_return_qty || 0) + (i.void_batch_qty || 0);
      return [
        i.item_name,
        i.opening_stock !== undefined ? (i.opening_stock % 1 === 0 ? i.opening_stock : i.opening_stock.toFixed(2)) : "0",
        totalIn > 0 ? `+${totalIn % 1 === 0 ? totalIn : totalIn.toFixed(2)}` : "0",
        totalOut > 0 ? `-${totalOut % 1 === 0 ? totalOut : totalOut.toFixed(2)}` : "0",
        i.manual_adjustment_qty !== undefined ? (i.manual_adjustment_qty >= 0 ? `+${i.manual_adjustment_qty}` : `${i.manual_adjustment_qty}`) : "0",
        `${i.closing_stock !== undefined ? (i.closing_stock % 1 === 0 ? i.closing_stock : i.closing_stock.toFixed(2)) : "0"} ${i.unit || ""}`
      ];
    }),
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold" }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Stock_Movement_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateStockIntakePdfReport(
  restaurant: any,
  dateRangeLabel: string,
  stockIntakeData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "STOCK INTAKE (PROCUREMENT) REPORT", dateRangeLabel);

  const items = stockIntakeData?.items || [];
  const totalCost = items.reduce((acc: number, it: any) => acc + (it.total_cost || (it.quantity * (it.unit_cost || 0)) || 0), 0);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Intake Batches", "Total Procurement Cost (INR)", "Date Period"]],
    body: [[
      `${items.length} batches`,
      `INR ${totalCost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      dateRangeLabel
    ]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: { fontSize: 8.5, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Date", "Item Name", "Batch #", "Quantity", "Unit Cost", "Supplier"]],
    body: items.map((i: any) => [
      i.intake_date ? new Date(i.intake_date).toLocaleDateString("en-IN") : "—",
      i.item_name,
      i.batch_number || "—",
      i.quantity !== undefined ? (i.quantity % 1 === 0 ? i.quantity : i.quantity.toFixed(2)) : "—",
      `INR ${(i.unit_cost || 0).toFixed(2)}`,
      i.supplier_name || "Direct / Open"
    ]),
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Stock_Intake_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateWastagePdfReport(
  restaurant: any,
  dateRangeLabel: string,
  wastageData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "OPERATIONAL WASTAGE & LOSS LOG", dateRangeLabel);

  const items = wastageData?.items || [];
  const totalLoss = items.reduce((acc: number, w: any) => acc + (w.loss_value || 0), 0);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Wastage Incidents", "Total Valuation Loss (INR)", "Date Period"]],
    body: [[
      `${items.length} logs`,
      `INR ${totalLoss.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      dateRangeLabel
    ]],
    theme: "grid",
    headStyles: { fillColor: [185, 28, 28], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: { fontSize: 8.5, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Date", "Item Name", "Quantity", "Loss Value (INR)", "Reason / Cause"]],
    body: items.map((w: any) => [
      w.date ? new Date(w.date).toLocaleDateString("en-IN") : "—",
      w.item_name,
      w.quantity !== undefined ? (w.quantity % 1 === 0 ? w.quantity : w.quantity.toFixed(2)) : "—",
      `INR ${(w.loss_value || 0).toFixed(2)}`,
      w.reason || "Damaged / Spoiled"
    ]),
    theme: "grid",
    headStyles: { fillColor: [185, 28, 28], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right", fontStyle: "bold", textColor: [185, 28, 28] }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Wastage_Report_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generatePurchaseReturnPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  purchaseReturnData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "PURCHASE RETURNS & REFUNDS REPORT", dateRangeLabel);

  const items = purchaseReturnData?.items || [];
  const totalRefund = items.reduce((acc: number, r: any) => acc + (r.total_refund_amount || 0), 0);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Returns Recorded", "Total Refund Claimed (INR)", "Date Period"]],
    body: [[
      `${items.length} return slips`,
      `INR ${totalRefund.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      dateRangeLabel
    ]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: { fontSize: 8.5, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Date", "Item Name", "Supplier", "Quantity", "Refund Amount (INR)", "Reason"]],
    body: items.map((r: any) => [
      r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "—",
      r.item_name,
      r.supplier_name || "—",
      r.quantity !== undefined ? (r.quantity % 1 === 0 ? r.quantity : r.quantity.toFixed(2)) : "—",
      `INR ${(r.total_refund_amount || 0).toFixed(2)}`,
      r.reason || "Defective / Mismatch"
    ]),
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Purchase_Returns_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateSupplierSpendPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  supplierSpendData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "SUPPLIER SPEND & PROCUREMENT ANALYSIS", dateRangeLabel);

  const suppliers = supplierSpendData?.suppliers || [];
  const totalSpend = suppliers.reduce((acc: number, s: any) => acc + (s.total_spend || 0), 0);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Total Suppliers", "Total Spend Outlay (INR)", "Date Period"]],
    body: [[
      `${suppliers.length} vendors`,
      `INR ${totalSpend.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      dateRangeLabel
    ]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: { fontSize: 8.5, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Supplier Name", "Total Intakes", "Quantity Supplied", "Total Spend (INR)", "Spend Share %"]],
    body: suppliers.map((s: any) => [
      s.supplier_name,
      s.total_intakes || 0,
      s.total_quantity !== undefined ? (s.total_quantity % 1 === 0 ? s.total_quantity : s.total_quantity.toFixed(2)) : "—",
      `INR ${(s.total_spend || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      s.share_pct !== undefined ? `${s.share_pct.toFixed(1)}%` : "—"
    ]),
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right", fontStyle: "bold" },
      4: { halign: "right" }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Supplier_Spend_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateInventoryMasterPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  options: {
    inventorySummaryData?: any;
    stockMovementData?: any;
    stockIntakeData?: any;
    wastageData?: any;
    purchaseReturnData?: any;
    supplierSpendData?: any;
  }
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "INVENTORY & STOCK MASTER REPORT", dateRangeLabel);

  let sectionIdx = 1;

  if (options.inventorySummaryData?.reconciliation_bridge) {
    const rb = options.inventorySummaryData.reconciliation_bridge;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Executive Inventory Summary & Valuation`, 14, y);
    sectionIdx++;
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Amount (INR)", "Context"]],
      body: [
        ["Opening Stock Asset", `INR ${(rb.opening_stock_value || 0).toFixed(2)}`, "Asset on hand at period start"],
        ["Gross Supplier Spend", `+INR ${(rb.gross_inward_spend || 0).toFixed(2)}`, "Inward stock purchases"],
        ["Cost of Goods Sold (COGS)", `-INR ${(rb.cost_of_goods_sold || 0).toFixed(2)}`, "Cost of goods billed"],
        ["Operational Wastage", `-INR ${(rb.wastage_cost || 0).toFixed(2)}`, "Damaged / spoiled items"],
        ["Closing Stock Asset", `INR ${(rb.closing_stock_value || rb.current_holding_value || 0).toFixed(2)}`, "Stock on hand at period end"],
        ["Realized Merchandise Profit", `INR ${(rb.realized_net_profit || 0).toFixed(2)}`, "Net trading margin realized"],
      ],
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (options.stockMovementData?.items && options.stockMovementData.items.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Stock Movement`, 14, y);
    sectionIdx++;
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Item Name", "Opening", "In (+)", "Out (-)", "Closing"]],
      body: options.stockMovementData.items.map((i: any) => [
        i.item_name,
        i.opening_stock,
        (i.intake_qty || 0) + (i.restock_qty || 0),
        (i.sales_deduction_qty || 0) + (i.purchase_return_qty || 0) + (i.void_batch_qty || 0),
        `${i.closing_stock} ${i.unit || ""}`
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.5 },
      columnStyles: { 4: { halign: "right", fontStyle: "bold" } }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (options.stockIntakeData?.items && options.stockIntakeData.items.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Recent Stock Intakes`, 14, y);
    sectionIdx++;
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Item Name", "Qty", "Unit Cost", "Supplier"]],
      body: options.stockIntakeData.items.map((i: any) => [
        i.intake_date ? new Date(i.intake_date).toLocaleDateString("en-IN") : "—",
        i.item_name,
        i.quantity,
        `INR ${(i.unit_cost || 0).toFixed(2)}`,
        i.supplier_name || "—"
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.5 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (options.wastageData?.items && options.wastageData.items.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Wastage Log`, 14, y);
    sectionIdx++;
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Item Name", "Qty", "Loss Value (INR)", "Reason"]],
      body: options.wastageData.items.map((w: any) => [
        w.date ? new Date(w.date).toLocaleDateString("en-IN") : "—",
        w.item_name,
        w.quantity,
        `INR ${(w.loss_value || 0).toFixed(2)}`,
        w.reason || "Damaged"
      ]),
      theme: "grid",
      headStyles: { fillColor: [185, 28, 28], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.5 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (options.supplierSpendData?.suppliers && options.supplierSpendData.suppliers.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Supplier Spend Analysis`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Supplier", "Intakes", "Total Spend (INR)", "Share %"]],
      body: options.supplierSpendData.suppliers.map((s: any) => [
        s.supplier_name,
        s.total_intakes,
        `INR ${(s.total_spend || 0).toFixed(2)}`,
        `${(s.share_pct || 0).toFixed(1)}%`
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.5 }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Inventory_Master_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Backwards-compatible alias for generateInventoryPdfReport
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
  generateInventoryMasterPdfReport(restaurant, dateRangeLabel, {
    inventorySummaryData,
    stockMovementData,
    stockIntakeData,
    wastageData,
    purchaseReturnData,
    supplierSpendData,
  });
}


// ==========================================
// 4. CUSTOMERS & LOYALTY REPORTS
// ==========================================

export function generateCustomerSpendsPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  customerSpendsData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "CUSTOMER SPENDS REPORT", dateRangeLabel);

  if (!customerSpendsData) {
    doc.setFontSize(10);
    doc.text("No customer spend data available for this period.", 14, y + 10);
    doc.save(`Customer_Spends_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const summary = customerSpendsData.summary || {};
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Activity & Spend Summary", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Metric", "Value", "Description"]],
    body: [
      ["Active Spenders", `${summary.total_customers_with_orders ?? 0} customers`, "Customers with completed purchases in period"],
      ["Total Gross Spent", `INR ${(summary.total_gross_spent ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Gross invoiced merchandise value before returns"],
      ["Total Customer Returns", `${summary.total_returns_count ?? 0} items / events`, "Goods returned by customers in period"],
      ["Total Returned Amount", `-INR ${(summary.total_returned_amount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Total refund processed at POS"],
      ["Total Net Realised Spend", `INR ${(summary.total_net_spent ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Net retained spend after deducting refunds"],
      ["Average Spend / Customer", `INR ${(summary.avg_spend_per_customer ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Average revenue contribution per active customer"],
    ],
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 40 },
      2: { cellWidth: 90 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const customers = customerSpendsData.customers || [];
  if (y > 230) { doc.addPage(); y = 20; }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`2. Customer Spends Breakdown (${customers.length} Customers)`, 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Customer Name", "Contact", "Orders", "Gross Spent", "Returns", "Net Spent", "Avg Order", "Credit Bal"]],
    body: customers.length === 0
      ? [["No customer spend records found.", "-", "-", "-", "-", "-", "-", "-"]]
      : customers.map((c: any) => [
          c.customer_name || "Unknown",
          c.customer_phone || "N/A",
          c.total_orders ?? 0,
          `INR ${(c.total_spent ?? 0).toFixed(2)}`,
          c.total_returns_count ? `${c.total_returns_count} (INR ${(c.total_returned_amount ?? 0).toFixed(2)})` : "0",
          `INR ${(c.net_spent ?? c.total_spent ?? 0).toFixed(2)}`,
          `INR ${(c.avg_order_value ?? 0).toFixed(2)}`,
          c.credit_balance !== undefined ? `${c.credit_balance >= 0 ? "+" : "-"}INR ${Math.abs(c.credit_balance).toFixed(2)}` : "0.00"
        ]),
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 7.5 },
    styles: { fontSize: 7.5 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35 },
      1: { cellWidth: 26 },
      2: { halign: "center", cellWidth: 14 },
      3: { halign: "right", cellWidth: 23 },
      4: { halign: "right", cellWidth: 25 },
      5: { halign: "right", fontStyle: "bold", cellWidth: 23 },
      6: { halign: "right", cellWidth: 20 },
      7: { halign: "right", cellWidth: 20 }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Customer_Spends_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateNewCustomersPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  newCustomerData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "NEW CUSTOMERS & ACQUISITION REPORT", dateRangeLabel);

  if (!newCustomerData) {
    doc.setFontSize(10);
    doc.text("No customer acquisition data available for this period.", 14, y + 10);
    doc.save(`New_Customers_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Acquisition Overview", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Acquisition Metric", "Count", "Description"]],
    body: [
      ["New Customers in Period", `${newCustomerData.total_new_customers ?? 0}`, "Customers who joined or registered during this period"],
      ["Total Customers (All Time)", `${newCustomerData.total_customers_all_time ?? 0}`, "Cumulative customer base registered in store"],
    ],
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 90 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (newCustomerData.trend && newCustomerData.trend.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("2. Acquisition Growth Trend", 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Period / Bucket", "New Customers Added", "Cumulative Total"]],
      body: newCustomerData.trend.map((b: any) => [
        b.bucket,
        `+${b.new_count}`,
        b.cumulative_total
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 70 },
        1: { halign: "right", fontStyle: "bold", textColor: [37, 99, 235], cellWidth: 50 },
        2: { halign: "right", cellWidth: 50 }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  const recent = newCustomerData.recent_customers || [];
  if (recent.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`3. Recently Boarded Customers (${recent.length})`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Date Joined", "Name", "Contact", "Total Orders", "Total Spent (INR)"]],
      body: recent.map((c: any) => {
        let dateStr = "-";
        try {
          const d = parseUTCDate(c.created_at);
          dateStr = isNaN(d.getTime()) ? String(c.created_at) : d.toLocaleDateString("en-IN");
        } catch {
          dateStr = String(c.created_at || "-");
        }
        return [
          dateStr,
          c.name || "Unknown",
          c.phone || c.email || "N/A",
          c.total_orders ?? 0,
          `INR ${(c.total_spent ?? 0).toFixed(2)}`
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { fontStyle: "bold", cellWidth: 50 },
        2: { cellWidth: 45 },
        3: { halign: "center", cellWidth: 25 },
        4: { halign: "right", fontStyle: "bold", cellWidth: 35 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`New_Customers_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateCustomerReturnsPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  customerReturnData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "CUSTOMER RETURNS REPORT", dateRangeLabel);

  if (!customerReturnData) {
    doc.setFontSize(10);
    doc.text("No customer return data available for this period.", 14, y + 10);
    doc.save(`Customer_Returns_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Returns & Refund Metrics", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Metric", "Value", "Description"]],
    body: [
      ["Total Returns", `${customerReturnData.total_returns ?? 0}`, "Count of customer return transactions processed"],
      ["Total Refund Amount", `INR ${(customerReturnData.total_refund_amount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Total monetary value refunded to customers"],
      ["Return Rate % (Orders)", `${(customerReturnData.return_rate_pct ?? 0).toFixed(2)}%`, "Percentage of total orders that encountered a return"],
      ["Return Rate % (Value)", `${((customerReturnData as any).return_rate_value_pct ?? 0).toFixed(2)}%`, "Percentage of total revenue refunded"],
    ],
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 40 },
      2: { cellWidth: 90 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const topItems = customerReturnData.top_returned_items || [];
  if (topItems.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`2. Top Returned Items (${topItems.length})`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Item Name", "Return Count", "Qty Returned", "Total Refunded (INR)"]],
      body: topItems.map((item: any) => [
        item.item_name,
        item.return_count,
        item.total_quantity_returned,
        `INR ${(item.total_refund_amount ?? 0).toFixed(2)}`
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 80 },
        1: { halign: "center", cellWidth: 30 },
        2: { halign: "right", cellWidth: 35 },
        3: { halign: "right", fontStyle: "bold", textColor: [225, 29, 72], cellWidth: 40 }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  const returns = customerReturnData.returns || [];
  if (returns.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`3. Customer Return Transactions (${returns.length})`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Date & Time", "Return #", "Customer", "Items Qty", "Total Refund (INR)"]],
      body: returns.map((r: any) => {
        let dateStr = "-";
        try {
          const d = parseUTCDate(r.created_at);
          dateStr = isNaN(d.getTime()) ? String(r.created_at) : d.toLocaleString("en-IN");
        } catch {
          dateStr = String(r.created_at || "-");
        }
        return [
          dateStr,
          r.return_number || "-",
          r.customer_name ? `${r.customer_name}${r.customer_phone ? ` (${r.customer_phone})` : ""}` : (r.customer_phone || "Walk-in"),
          r.items_returned ?? 1,
          `INR ${(r.total_refund_amount ?? 0).toFixed(2)}`
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { fontStyle: "bold", cellWidth: 35 },
        2: { cellWidth: 55 },
        3: { halign: "center", cellWidth: 22 },
        4: { halign: "right", fontStyle: "bold", textColor: [225, 29, 72], cellWidth: 35 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Customer_Returns_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateCreditDebitPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  creditDebitData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "CREDIT & DEBIT (UDHAAR) LEDGER", dateRangeLabel);

  if (!creditDebitData) {
    doc.setFontSize(10);
    doc.text("No credit & debit ledger data available for this period.", 14, y + 10);
    doc.save(`Credit_Debit_Ledger_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const summary = creditDebitData.summary || {};
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Outstanding Balances & Ledger Summary", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Metric", "Value", "Audit Context"]],
    body: [
      ["Total Outstanding Store Credit", `INR ${(summary.total_outstanding_credit ?? 0).toFixed(2)}`, `Store liability owed to ${summary.customers_with_credit ?? 0} customers`],
      ["Total Outstanding Debit (Udhaar)", `INR ${(summary.total_outstanding_debit ?? 0).toFixed(2)}`, `Receivable debt owed by ${summary.customers_with_debit ?? 0} customers`],
      ["Total Customers with Balance", `${(summary.customers_with_credit ?? 0) + (summary.customers_with_debit ?? 0)}`, "Unique customer accounts with non-zero ledger balances"],
      ["Total Ledger Transactions", `${summary.total_transactions ?? 0}`, "Credit and debit ledger events recorded in period"],
    ],
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const customers = creditDebitData.customers || [];
  if (customers.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`2. Customer Balances (${customers.length})`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Customer Name", "Contact", "Credit Balance", "Credit Given (Period)", "Debit Recorded (Period)", "Last Activity"]],
      body: customers.map((c: any) => {
        let lastDateStr = "-";
        if (c.last_transaction_date) {
          try {
            const d = parseUTCDate(c.last_transaction_date);
            lastDateStr = isNaN(d.getTime()) ? String(c.last_transaction_date) : d.toLocaleDateString("en-IN");
          } catch {
            lastDateStr = String(c.last_transaction_date);
          }
        }
        return [
          c.customer_name || "Unknown",
          c.customer_phone || "N/A",
          c.credit_balance === 0 ? "INR 0.00" : (c.credit_balance > 0 ? `+INR ${c.credit_balance.toFixed(2)}` : `-INR ${Math.abs(c.credit_balance).toFixed(2)}`),
          `INR ${(c.total_credit_given ?? 0).toFixed(2)}`,
          `INR ${(c.total_debit_recorded ?? 0).toFixed(2)}`,
          lastDateStr
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 7.5 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 40 },
        1: { cellWidth: 28 },
        2: { halign: "right", fontStyle: "bold", cellWidth: 28 },
        3: { halign: "right", cellWidth: 30 },
        4: { halign: "right", cellWidth: 32 },
        5: { halign: "center", cellWidth: 27 }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  const transactions = creditDebitData.transactions || [];
  if (transactions.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`3. Ledger Transactions Log (${transactions.length})`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Date & Time", "Type", "Customer", "Bill / Ref", "Amount (INR)", "Note"]],
      body: transactions.map((t: any) => {
        let dateStr = "-";
        try {
          const d = parseUTCDate(t.created_at);
          dateStr = isNaN(d.getTime()) ? String(t.created_at) : d.toLocaleString("en-IN");
        } catch {
          dateStr = String(t.created_at || "-");
        }
        const isNeg = ["DEBIT_ADDED", "CREDIT_APPLIED", "CREDIT_USED", "CREDIT_CASHED_OUT"].includes(t.entry_type);
        return [
          dateStr,
          (t.entry_type || "").replace(/_/g, " "),
          t.customer_name ? `${t.customer_name}${t.customer_phone ? ` (${t.customer_phone})` : ""}` : (t.customer_phone || "-"),
          t.order_basket_number || t.reference_number || "-",
          `${isNeg ? "-" : "+"}INR ${Math.abs(t.amount || 0).toFixed(2)}`,
          t.note || "-"
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { fontStyle: "bold", cellWidth: 32 },
        2: { cellWidth: 40 },
        3: { cellWidth: 25 },
        4: { halign: "right", fontStyle: "bold", cellWidth: 25 },
        5: { cellWidth: 28 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Credit_Debit_Ledger_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateLoyaltyPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  loyaltyData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "LOYALTY & REWARDS REPORT", dateRangeLabel);

  if (!loyaltyData) {
    doc.setFontSize(10);
    doc.text("No loyalty program data available for this period.", 14, y + 10);
    doc.save(`Loyalty_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Loyalty Program Performance", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Loyalty Metric", "Value", "Program Context"]],
    body: [
      ["Total Points Earned", `+${loyaltyData.total_points_earned ?? 0}`, "Reward points credited to customers on purchases"],
      ["Total Points Redeemed", `-${loyaltyData.total_points_redeemed ?? 0}`, "Reward points spent as currency at checkout"],
      ["Net Outstanding Points", `${loyaltyData.net_outstanding_points ?? 0}`, "Current accumulated unredeemed customer point liability"],
      ["Redemption Rate", `${(loyaltyData.redemption_rate_pct ?? 0).toFixed(2)}%`, "Percentage of total earned points redeemed"],
      ["Active Customers with Points", `${loyaltyData.total_customers_with_points ?? 0}`, "Count of customer accounts holding non-zero point balance"],
      ["Average Points / Customer", `${(loyaltyData.avg_points_per_customer ?? 0).toFixed(1)}`, "Average point balance among participating customers"],
    ],
    theme: "grid",
    headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Loyalty_Report_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateAbandonedCartPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  abandonedCartData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "ABANDONED CARTS REPORT", dateRangeLabel);

  if (!abandonedCartData) {
    doc.setFontSize(10);
    doc.text("No abandoned cart data available for this period.", 14, y + 10);
    doc.save(`Abandoned_Carts_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Abandonment & Recovery Analysis", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Metric", "Value", "Operational Description"]],
    body: [
      ["Total Abandoned Carts", `${abandonedCartData.total_abandoned ?? 0}`, "Carts initiated but left unpaid or uncompleted"],
      ["Total Converted / Recovered", `${abandonedCartData.total_converted ?? 0}`, "Abandoned carts that subsequently converted to bills"],
      ["Cart Recovery Rate", `${(abandonedCartData.conversion_rate_pct ?? 0).toFixed(2)}%`, "Percentage of abandoned carts recovered"],
      ["Average Cart Value", `INR ${(abandonedCartData.avg_cart_value ?? 0).toFixed(2)}`, "Average nominal value per abandoned cart"],
      ["Total Lost Revenue", `INR ${(abandonedCartData.total_abandoned_value ?? 0).toFixed(2)}`, "Gross unrecovered revenue trapped in abandoned carts"],
      ["Total Recovered Revenue", `INR ${(abandonedCartData.total_converted_value ?? 0).toFixed(2)}`, "Gross revenue reclaimed through cart conversion"],
    ],
    theme: "grid",
    headStyles: { fillColor: [194, 65, 12], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Abandoned_Carts_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateCustomersMasterPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  options: {
    customerSpendsData?: any;
    newCustomerData?: any;
    customerReturnData?: any;
    creditDebitData?: any;
    loyaltyData?: any;
    abandonedCartData?: any;
  }
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "CUSTOMERS MASTER AUDIT REPORT", dateRangeLabel);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);

  // 1. Spends
  if (options.customerSpendsData?.summary) {
    const s = options.customerSpendsData.summary;
    doc.text("1. Customer Spends Overview", 14, y);
    y += 5;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Active Spenders", "Total Gross Spent", "Returns Count", "Returned Amount", "Net Realised Spend"]],
      body: [[
        s.total_customers_with_orders ?? 0,
        `INR ${(s.total_gross_spent ?? 0).toFixed(2)}`,
        s.total_returns_count ?? 0,
        `INR ${(s.total_returned_amount ?? 0).toFixed(2)}`,
        `INR ${(s.total_net_spent ?? 0).toFixed(2)}`
      ]],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 2. Acquisition
  if (options.newCustomerData) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.text("2. New Customers Acquisition", 14, y);
    y += 5;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Metric", "Count"]],
      body: [
        ["New Customers (Period)", options.newCustomerData.total_new_customers ?? 0],
        ["Total Customers (All Time)", options.newCustomerData.total_customers_all_time ?? 0]
      ],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 3. Returns
  if (options.customerReturnData) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.text("3. Customer Returns Summary", 14, y);
    y += 5;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Total Returns", "Total Refund Amount", "Return Rate % (Order)"]],
      body: [[
        options.customerReturnData.total_returns ?? 0,
        `INR ${(options.customerReturnData.total_refund_amount ?? 0).toFixed(2)}`,
        `${(options.customerReturnData.return_rate_pct ?? 0).toFixed(2)}%`
      ]],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 4. Credit / Debit Balances
  if (options.creditDebitData?.summary) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.text("4. Credit & Debit (Udhaar) Ledger", 14, y);
    y += 5;
    const cd = options.creditDebitData.summary;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Outstanding Credit (Store Owes)", "Outstanding Debit (Customers Owe)", "Ledger Transactions"]],
      body: [[
        `INR ${(cd.total_outstanding_credit ?? 0).toFixed(2)} (${cd.customers_with_credit ?? 0} cust)`,
        `INR ${(cd.total_outstanding_debit ?? 0).toFixed(2)} (${cd.customers_with_debit ?? 0} cust)`,
        cd.total_transactions ?? 0
      ]],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 5. Loyalty
  if (options.loyaltyData) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.text("5. Loyalty & Rewards Program", 14, y);
    y += 5;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Points Earned", "Points Redeemed", "Net Outstanding", "Redemption Rate %", "Active Customers"]],
      body: [[
        `+${options.loyaltyData.total_points_earned ?? 0}`,
        `-${options.loyaltyData.total_points_redeemed ?? 0}`,
        options.loyaltyData.net_outstanding_points ?? 0,
        `${(options.loyaltyData.redemption_rate_pct ?? 0).toFixed(2)}%`,
        options.loyaltyData.total_customers_with_points ?? 0
      ]],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 6. Abandoned Carts
  if (options.abandonedCartData) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.text("6. Abandoned Carts Overview", 14, y);
    y += 5;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Total Abandoned", "Converted", "Recovery Rate %", "Lost Revenue (INR)", "Recovered (INR)"]],
      body: [[
        options.abandonedCartData.total_abandoned ?? 0,
        options.abandonedCartData.total_converted ?? 0,
        `${(options.abandonedCartData.conversion_rate_pct ?? 0).toFixed(2)}%`,
        `INR ${(options.abandonedCartData.total_abandoned_value ?? 0).toFixed(2)}`,
        `INR ${(options.abandonedCartData.total_converted_value ?? 0).toFixed(2)}`
      ]],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Customers_Master_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Backwards-compatible alias
export function generateCustomersPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  newCustomerData: any,
  customerReturnData: any,
  loyaltyData: any,
  abandonedCartData: any
) {
  generateCustomersMasterPdfReport(restaurant, dateRangeLabel, {
    newCustomerData,
    customerReturnData,
    loyaltyData,
    abandonedCartData
  });
}

// ==========================================
// 5. FINANCIAL & TAX REPORTS
// ==========================================

export function generateOutletEarningsPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  outletEarningsData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "OUTLET EARNINGS (NET CASH FLOW)", dateRangeLabel);

  if (!outletEarningsData) {
    doc.setFontSize(10);
    doc.text("No outlet earnings data available for this period.", 14, y + 10);
    doc.save(`Outlet_Earnings_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Cash Flow & Drawer Earnings Ledger", 14, y);
  y += 5;

  const rows: any[] = [
    ["Gross Revenue (Sales Total)", `+INR ${(outletEarningsData.gross_revenue ?? 0).toFixed(2)}`, "Total sales invoiced across all tenders"],
    ["Customer Returns (Refunds)", `-INR ${(outletEarningsData.total_customer_returns || 0).toFixed(2)}`, "Cash & tender refunds paid out for customer returns"],
  ];

  if (outletEarningsData.total_voided_returns !== undefined && outletEarningsData.total_voided_returns > 0) {
    rows.push(["Voided Bills (Refunds)", `-INR ${(outletEarningsData.total_voided_returns || 0).toFixed(2)}`, "Refunds for voided transaction reversals"]);
  }

  rows.push(
    ["Loyalty Value Redeemed", `(INR ${(outletEarningsData.total_loyalty_discounts || 0).toFixed(2)})`, "Non-cash loyalty currency spent by customers"],
    ["Store Credit Applied", `-INR ${(outletEarningsData.total_credit_applied || 0).toFixed(2)}`, "Customer ledger credit utilized to settle bills"],
    ["Udhaar Given (Shortfalls)", `-INR ${(outletEarningsData.total_udhaar_given || 0).toFixed(2)}`, "Postpaid receivables / customer shortfalls allowed"],
    ["Udhaar Recovered (Debt Settled)", `+INR ${(outletEarningsData.total_udhaar_recovered || 0).toFixed(2)}`, "Outstanding debt settled & received in drawer"],
    ["Credit Cashed Out (Returned Cash)", `-INR ${(outletEarningsData.total_credit_cashed_out || 0).toFixed(2)}`, "Physical store credit balance cashed out"],
    ["Credit Awarded (Kept Cash)", `+INR ${(outletEarningsData.total_credit_awarded || 0).toFixed(2)}`, "Customer excess payment retained as store credit"]
  );

  (autoTable as any)(doc, {
    startY: y,
    head: [["Cash Flow Movement", "Value (INR)", "Accounting Context"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // NET DRAWER HIGHLIGHT
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 163, 74);
  (autoTable as any)(doc, {
    startY: y,
    head: [["Final Drawer Position", "Amount (INR)", "Audit Description"]],
    body: [
      [
        "NET DRAWER EARNINGS (Expected Cash/UPI)",
        `INR ${(outletEarningsData.net_drawer_earnings ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        "True actual net liquid earnings expected in cash drawer and bank collection"
      ]
    ],
    theme: "grid",
    headStyles: { fillColor: [16, 185, 129], fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8.5, fontStyle: "bold" },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (outletEarningsData.chart_data && outletEarningsData.chart_data.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("2. Daily Cash Flow Breakdown", 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Date", "Udhaar Given", "Udhaar Recovered", "Customer Returns", "Loyalty Discount", "Credit Cashed Out"]],
      body: outletEarningsData.chart_data.map((d: any) => [
        d.date,
        `-INR ${(d.udhaar_given || 0).toFixed(2)}`,
        `+INR ${(d.udhaar_recovered || 0).toFixed(2)}`,
        `-INR ${(d.customer_returns || 0).toFixed(2)}`,
        `INR ${(d.loyalty_value_redeemed || 0).toFixed(2)}`,
        `-INR ${(d.credit_cashed_out || 0).toFixed(2)}`
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 7.5 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 30 },
        1: { halign: "right", cellWidth: 30 },
        2: { halign: "right", cellWidth: 32 },
        3: { halign: "right", cellWidth: 32 },
        4: { halign: "right", cellWidth: 30 },
        5: { halign: "right", cellWidth: 31 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Outlet_Earnings_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateProfitMarginPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  profitData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "PROFIT MARGIN ANALYSIS REPORT", dateRangeLabel);

  if (!profitData) {
    doc.setFontSize(10);
    doc.text("No profit margin data available for this period.", 14, y + 10);
    doc.save(`Profit_Margin_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Profit Margin Summary", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Metric", "Amount (INR)", "Margin Context"]],
    body: [
      ["Total Gross Revenue", `INR ${(profitData.total_revenue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Total billed turnover across all products"],
      ["Total Cost of Goods Sold (COGS)", `INR ${(profitData.total_cogs ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Procurement / intake valuation of merchandise sold"],
      ["Net Gross Profit", `INR ${(profitData.total_profit ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Operating gross spread (Revenue - COGS)"],
      ["Overall Profit Margin", `${(profitData.overall_margin_pct ?? 0).toFixed(2)}%`, "Gross margin percentage realized across all sales"],
    ],
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const buckets = profitData.buckets || [];
  if (buckets.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("2. Periodic Profit Breakdown", 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Period / Bucket", "Revenue (INR)", "COGS (INR)", "Profit (INR)", "Margin %"]],
      body: buckets.map((b: any) => [
        b.bucket,
        `INR ${(b.revenue ?? 0).toFixed(2)}`,
        `INR ${(b.cogs ?? 0).toFixed(2)}`,
        `INR ${(b.profit ?? 0).toFixed(2)}`,
        `${(b.margin_pct ?? 0).toFixed(2)}%`
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 45 },
        1: { halign: "right", cellWidth: 35 },
        2: { halign: "right", textColor: [225, 29, 72], cellWidth: 35 },
        3: { halign: "right", fontStyle: "bold", textColor: [16, 185, 129], cellWidth: 35 },
        4: { halign: "right", fontStyle: "bold", cellWidth: 35 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Profit_Margin_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateBillProfitPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  billProfitData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "BILL-WISE PROFIT & MARGIN REPORT", dateRangeLabel);

  if (!billProfitData) {
    doc.setFontSize(10);
    doc.text("No bill profit data available for this period.", 14, y + 10);
    doc.save(`Bill_Profit_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Overall Portfolio Profit Summary", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Metric", "Value", "Description"]],
    body: [
      ["Total Bills Processed", `${billProfitData.total_bills ?? 0}`, "Number of customer bills invoiced"],
      ["Total Invoiced Revenue", `INR ${(billProfitData.total_revenue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, (billProfitData.total_refunded_amount || 0) > 0 ? `Net of -INR ${Number(billProfitData.total_refunded_amount).toFixed(2)} in refunds` : "Gross billed revenue across all invoices"],
      ["Estimated COGS", `INR ${(billProfitData.total_cogs ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Procurement cost of goods invoiced in bills"],
      ["Estimated Profit", `INR ${((billProfitData.total_revenue ?? 0) - (billProfitData.total_cogs ?? 0)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Net transaction profit realized across bills"],
      ["Overall Portfolio Margin", `${(billProfitData.overall_margin_pct ?? 0).toFixed(2)}%`, "Average gross margin across all completed bills"],
    ],
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 40 },
      2: { cellWidth: 90 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const bills = billProfitData.bills || [];
  if (bills.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`2. Bill-wise Profit Breakdown (${bills.length} Bills)`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Bill #", "Status", "Date", "Customer", "Items", "Revenue (INR)", "COGS (INR)", "Profit (INR)", "Margin %"]],
      body: bills.map((b: any) => {
        let dateStr = "-";
        try {
          const d = parseUTCDate(b.created_at);
          dateStr = isNaN(d.getTime()) ? String(b.created_at) : d.toLocaleDateString("en-IN");
        } catch {
          dateStr = String(b.created_at || "-");
        }
        const netRev = b.net_amount !== undefined ? b.net_amount : (b.total_amount - (b.total_refunded_amount || 0));
        return [
          b.basket_number || b.order_id?.slice(0, 8) || "-",
          b.is_void ? "VOIDED" : "COMPLETED",
          dateStr,
          b.customer_name || "Walk-in",
          b.items_count ?? 1,
          `INR ${Number(netRev || 0).toFixed(2)}`,
          `INR ${(b.estimated_cogs ?? 0).toFixed(2)}`,
          `INR ${(b.estimated_profit ?? 0).toFixed(2)}`,
          `${(b.margin_pct ?? 0).toFixed(1)}%`
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 7 },
      styles: { fontSize: 7 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 23 },
        1: { halign: "center", cellWidth: 18 },
        2: { cellWidth: 20 },
        3: { cellWidth: 32 },
        4: { halign: "center", cellWidth: 12 },
        5: { halign: "right", cellWidth: 22 },
        6: { halign: "right", textColor: [225, 29, 72], cellWidth: 20 },
        7: { halign: "right", fontStyle: "bold", textColor: [16, 185, 129], cellWidth: 21 },
        8: { halign: "right", fontStyle: "bold", cellWidth: 17 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Bill_Profit_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateTaxSummaryPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  taxSummaryData: any,
  gstr1Data?: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "TAX SUMMARY & GST COMPLIANCE REPORT", dateRangeLabel);

  if (!taxSummaryData) {
    doc.setFontSize(10);
    doc.text("No tax summary data available for this period.", 14, y + 10);
    doc.save(`Tax_Summary_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const hsnItems = gstr1Data?.items || [];
  const totalHsnIgst = gstr1Data?.total_igst ?? hsnItems.reduce((sum: number, it: any) => sum + (it.igst_amount || 0), 0);
  const totalHsnCgst = gstr1Data?.total_cgst ?? hsnItems.reduce((sum: number, it: any) => sum + (it.cgst_amount || 0), 0);
  const totalHsnSgst = gstr1Data?.total_sgst ?? hsnItems.reduce((sum: number, it: any) => sum + (it.sgst_amount || 0), 0);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Statutory Tax Collections Overview", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Tax Component", "Amount (INR)", "Compliance Description"]],
    body: [
      ["Total Taxable Value", `INR ${(taxSummaryData.total_taxable_amount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Assessable base turnover for GST computation"],
      ["Total Statutory Tax Collected", `INR ${(taxSummaryData.total_tax_collected ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Total GST extracted & collected on invoices"],
      ["Central + State GST (CGST + SGST)", `INR ${(totalHsnCgst + totalHsnSgst > 0 ? (totalHsnCgst + totalHsnSgst) : taxSummaryData.total_tax_collected).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Intra-state GST collections"],
      ["Integrated GST (IGST)", `INR ${totalHsnIgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Inter-state supply tax collections"],
    ],
    theme: "grid",
    headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // GSTR-1 Table 12 HSN Summary
  if (hsnItems.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`2. GSTR-1 Table 12: HSN-Wise Summary of Outward Supplies (${hsnItems.length} HSNs)`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["HSN/SAC", "Description", "UQC", "Qty", "Total Value", "Taxable Value", "IGST", "CGST", "SGST", "Total Tax"]],
      body: hsnItems.map((r: any) => {
        const rowTax = (r.igst_amount || 0) + (r.cgst_amount || 0) + (r.sgst_amount || 0);
        return [
          r.hsn_code || "-",
          (r.description || "-").slice(0, 20),
          r.uqc || "NOS",
          Number(r.total_quantity || 0).toFixed(1),
          `INR ${Number(r.total_value || 0).toFixed(2)}`,
          `INR ${Number(r.taxable_value || 0).toFixed(2)}`,
          `INR ${Number(r.igst_amount || 0).toFixed(2)}`,
          `INR ${Number(r.cgst_amount || 0).toFixed(2)}`,
          `INR ${Number(r.sgst_amount || 0).toFixed(2)}`,
          `INR ${Number(rowTax).toFixed(2)}`
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 6.5 },
      styles: { fontSize: 6.5 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 16 },
        1: { cellWidth: 26 },
        2: { halign: "center", cellWidth: 12 },
        3: { halign: "right", cellWidth: 14 },
        4: { halign: "right", cellWidth: 22 },
        5: { halign: "right", fontStyle: "bold", cellWidth: 22 },
        6: { halign: "right", cellWidth: 17 },
        7: { halign: "right", cellWidth: 17 },
        8: { halign: "right", cellWidth: 17 },
        9: { halign: "right", fontStyle: "bold", textColor: [124, 58, 237], cellWidth: 22 }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // GST Slab Breakdown
  const slabs = taxSummaryData.slabs || [];
  if (slabs.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("3. GST Tax Slab Breakdown", 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Tax Category", "Rate %", "Items Count", "Taxable Amount (INR)", "Tax Collected (INR)"]],
      body: slabs.map((s: any) => [
        s.tax_category,
        `${s.tax_rate}%`,
        s.items_count ?? 0,
        `INR ${(s.taxable_amount ?? 0).toFixed(2)}`,
        `INR ${(s.tax_collected ?? 0).toFixed(2)}`
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 50 },
        1: { halign: "center", cellWidth: 25 },
        2: { halign: "center", cellWidth: 30 },
        3: { halign: "right", cellWidth: 40 },
        4: { halign: "right", fontStyle: "bold", textColor: [124, 58, 237], cellWidth: 40 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Tax_Summary_GSTR1_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateCashDenominationPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  cashDenomData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "CASH DENOMINATIONS REPORT", dateRangeLabel);

  if (!cashDenomData) {
    doc.setFontSize(10);
    doc.text("No cash denomination data available for this period.", 14, y + 10);
    doc.save(`Cash_Denominations_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Cash Drawer Overview", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Metric", "Value", "Description"]],
    body: [
      ["Total Cash Transactions", `${cashDenomData.total_transactions ?? 0}`, "Physical cash transactions processed through drawer"],
      ["Net Cash in Drawer", `INR ${(cashDenomData.net_cash_in_drawer ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Physical cash currency net position in drawer"],
    ],
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 40 },
      2: { cellWidth: 90 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const denoms = cashDenomData.overall_denominations || [];
  if (denoms.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("2. Note Breakdown", 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Denomination", "Notes In", "Notes Out", "Net Notes", "Net Value (INR)"]],
      body: denoms.map((d: any) => [
        `INR ${d.denomination}`,
        `+${d.notes_in ?? 0}`,
        `-${d.notes_out ?? 0}`,
        d.net_notes ?? 0,
        `INR ${(d.net_value ?? 0).toFixed(2)}`
      ]),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 45 },
        1: { halign: "right", textColor: [16, 185, 129], cellWidth: 35 },
        2: { halign: "right", textColor: [225, 29, 72], cellWidth: 35 },
        3: { halign: "right", fontStyle: "bold", cellWidth: 35 },
        4: { halign: "right", fontStyle: "bold", cellWidth: 40 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Cash_Denominations_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateFinancialMasterPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  options: {
    outletEarningsData?: any;
    profitMarginData?: any;
    billProfitData?: any;
    taxSummaryData?: any;
    gstr1HsnData?: any;
    cashDenomData?: any;
  }
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "FINANCIAL & TAX MASTER AUDIT REPORT", dateRangeLabel);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);

  // 1. Outlet Earnings
  if (options.outletEarningsData) {
    const oe = options.outletEarningsData;
    doc.text("1. Outlet Earnings Summary", 14, y);
    y += 5;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Gross Revenue", "Customer Returns", "Udhaar Given", "Udhaar Recovered", "Net Drawer Earnings"]],
      body: [[
        `INR ${(oe.gross_revenue ?? 0).toFixed(2)}`,
        `-INR ${(oe.total_customer_returns || 0).toFixed(2)}`,
        `-INR ${(oe.total_udhaar_given || 0).toFixed(2)}`,
        `+INR ${(oe.total_udhaar_recovered || 0).toFixed(2)}`,
        `INR ${(oe.net_drawer_earnings ?? 0).toFixed(2)}`
      ]],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 2. Profit Margin
  if (options.profitMarginData) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.text("2. Profit Margin Summary", 14, y);
    y += 5;
    const pm = options.profitMarginData;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Gross Revenue", "COGS", "Gross Profit", "Overall Margin %"]],
      body: [[
        `INR ${(pm.total_revenue ?? 0).toFixed(2)}`,
        `INR ${(pm.total_cogs ?? 0).toFixed(2)}`,
        `INR ${(pm.total_profit ?? 0).toFixed(2)}`,
        `${(pm.overall_margin_pct ?? 0).toFixed(2)}%`
      ]],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 3. Tax Summary
  if (options.taxSummaryData) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.text("3. Tax Summary & GST Collection", 14, y);
    y += 5;
    const ts = options.taxSummaryData;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Total Taxable Value", "Total Tax Collected"]],
      body: [[
        `INR ${(ts.total_taxable_amount ?? 0).toFixed(2)}`,
        `INR ${(ts.total_tax_collected ?? 0).toFixed(2)}`
      ]],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 4. Cash Denominations
  if (options.cashDenomData) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.text("4. Cash Drawer Summary", 14, y);
    y += 5;
    const cd = options.cashDenomData;
    (autoTable as any)(doc, {
      startY: y,
      head: [["Total Cash Transactions", "Net Cash in Drawer"]],
      body: [[
        cd.total_transactions ?? 0,
        `INR ${(cd.net_cash_in_drawer ?? 0).toFixed(2)}`
      ]],
      theme: "grid", headStyles: { fillColor: [51, 65, 85], fontSize: 8 }, styles: { fontSize: 8 }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Financial_Master_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Backwards-compatible alias
export function generateFinancialPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  profitData: any,
  billProfitData: any,
  taxSummaryData: any,
  cashDenomData: any,
  outletEarningsData?: any
) {
  generateFinancialMasterPdfReport(restaurant, dateRangeLabel, {
    profitMarginData: profitData,
    billProfitData,
    taxSummaryData,
    cashDenomData,
    outletEarningsData
  });
}

// ==========================================
// 6. DAY BOOK REPORT
// ==========================================

export function generateDayBookPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  dayBookData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "DAILY CASH & TRADING LEDGER (DAY BOOK)", dateRangeLabel);

  if (!dayBookData) {
    doc.setFontSize(10);
    doc.text("No day book data available for this date.", 14, y + 10);
    doc.save(`DayBook_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  // 1. Drawer & Trading Summary Cards
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Day Closing Summary & Balances", 14, y);
  y += 5;

  const totalInflow = (dayBookData.total_cash_in || 0) + (dayBookData.total_sales || 0) + (dayBookData.total_purchase_returns || 0);
  const totalOutflow = (dayBookData.total_cash_out || 0) + (dayBookData.total_returns || 0) + (dayBookData.total_stock_intake_cost || 0);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Physical Drawer Position", "Amount (INR)", "Day Trading Flow", "Amount (INR)"]],
    body: [
      ["Opening Cash in Drawer", `INR ${(dayBookData.opening_cash ?? 0).toFixed(2)}`, "Total Inflow (All Modes)", `+INR ${totalInflow.toFixed(2)}`],
      ["Cash Sales", `+INR ${(dayBookData.cash_sales ?? 0).toFixed(2)}`, "Total Outflow (All Modes)", `-INR ${totalOutflow.toFixed(2)}`],
      ["Cash Refunds", `-INR ${(dayBookData.cash_refunds ?? 0).toFixed(2)}`, "Day Trading Balance", `INR ${(dayBookData.closing_balance ?? 0).toFixed(2)}`],
      ["Closing Cash in Drawer", `INR ${(dayBookData.closing_cash ?? dayBookData.closing_balance ?? 0).toFixed(2)}`, "Ledger Entries Count", `${dayBookData.entries?.length ?? 0} entries`],
    ],
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 40 },
      2: { fontStyle: "bold", cellWidth: 55 },
      3: { fontStyle: "bold", halign: "right", cellWidth: 45 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // 2. Entries Table
  const entries = dayBookData.entries || [];
  if (entries.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`2. Day Book Ledger Entries (${entries.length})`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Time", "Type", "Ref #", "Party / Contact", "Description", "Debit (Out)", "Credit (In)", "Balance"]],
      body: entries.map((e: any) => {
        let timeStr = "-";
        try {
          const d = parseUTCDate(e.timestamp);
          timeStr = isNaN(d.getTime()) ? String(e.timestamp) : d.toLocaleTimeString("en-IN");
        } catch {
          timeStr = String(e.timestamp || "-");
        }
        return [
          timeStr,
          (e.entry_type || "").replace(/_/g, " "),
          e.reference_number || "-",
          e.entity_name ? `${e.entity_name}${e.entity_phone ? ` (${e.entity_phone})` : ""}` : "-",
          e.description || "-",
          e.debit > 0 ? `INR ${Number(e.debit).toFixed(2)}` : "",
          e.credit > 0 ? `INR ${Number(e.credit).toFixed(2)}` : "",
          `INR ${Number(e.running_balance ?? 0).toFixed(2)}`
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { fontStyle: "bold", cellWidth: 26 },
        2: { cellWidth: 20 },
        3: { cellWidth: 32 },
        4: { cellWidth: 35 },
        5: { halign: "right", textColor: [225, 29, 72], cellWidth: 20 },
        6: { halign: "right", textColor: [16, 185, 129], cellWidth: 20 },
        7: { halign: "right", fontStyle: "bold", cellWidth: 22 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`DayBook_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ==========================================
// 2. SALES & ORDERS REPORTS
// ==========================================

export function generateSalesSummaryPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  itemSalesData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "SALES & REVENUE SUMMARY (RECONCILIATION)", dateRangeLabel);

  if (!itemSalesData?.reconciliation_bridge) {
    doc.setFontSize(10);
    doc.text("No summary reconciliation data available for this period.", 14, y + 10);
    doc.save(`Sales_Summary_${new Date().toISOString().slice(0, 10)}.pdf`);
    return;
  }

  const rb = itemSalesData.reconciliation_bridge;
  const grossItem = rb.gross_item_sales || 0;
  const delivery = rb.delivery_and_handling_charges ?? rb.taxes_and_charges ?? 0;
  const grossSalesAndService = grossItem + delivery;
  const billDiscounts = rb.bill_discounts || 0;
  const grossEffective = grossSalesAndService - billDiscounts;
  const roundingAdj = rb.rounding_adjustment ?? 0;
  const grossBilled = rb.gross_billed_revenue ?? (grossEffective + roundingAdj);
  const customerReturns = rb.customer_returns || 0;
  const netRevenue = grossBilled - customerReturns;
  const loyalty = rb.loyalty_discounts || 0;
  const netRealised = netRevenue - loyalty;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("1. Catalog Movement & Commercial Bridge", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Reconciliation Step", "Amount (INR)", "Accounting Context & Calculation"]],
    body: [
      ["Gross Item Sales (Catalog Value)", `INR ${grossItem.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Total value of all items billed at nominal catalog prices"],
      ["Gross Service Sales (Delivery/Charges)", `+INR ${delivery.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Delivery fees, handling charges, and packing fees"],
      ["Gross Sales and Service", `INR ${grossSalesAndService.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Subtotal of catalog merchandise plus service sales"],
      ["Bill Discounts (Coupons/Concessions)", `-INR ${billDiscounts.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Pre-tax concessions, promotional vouchers and item discounts"],
      ["Gross Effective Sales & Service", `INR ${grossEffective.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Merchandise value after customer concessions"],
      ["Bill Rounding Adjustments", `${roundingAdj >= 0 ? "+" : "-"}INR ${Math.abs(roundingAdj).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Per-bill fractional round-off to nearest integer rupee"],
    ],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("2. Authoritative Financial Summary", 14, y);
  y += 5;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Financial Line Item", "Amount (INR)", "Audit Description"]],
    body: [
      ["Gross Billed Revenue (Excl. Voided)", `INR ${grossBilled.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Total initial amount invoiced at counter"],
      ["Customer Returns (Refunded Items)", `-INR ${customerReturns.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Goods returned by customers or refunded at POS"],
      ["Net Revenue (Tied to Dashboard)", `INR ${netRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Final revenue retained by store (Gross Billed - Customer Returns)"],
      ["Loyalty Points Redeemed", `-INR ${loyalty.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Store points tendered as counter cash/currency"],
      ["Net Realised Revenue (Cash Realised)", `INR ${netRealised.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Final actual realized liquid cash/electronic collection"],
    ],
    theme: "grid",
    headStyles: { fillColor: [16, 185, 129], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
      2: { cellWidth: 85 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Statutory GST Note Box
  if (rb.extracted_gst_amount !== undefined) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("3. Statutory GST Breakdown", 14, y);
    y += 5;

    const taxableBase = grossItem - (rb.extracted_gst_amount || 0);

    (autoTable as any)(doc, {
      startY: y,
      head: [["Statutory Component", "Value (INR)", "Tax Compliance Details"]],
      body: [
        ["Extracted Statutory GST", `INR ${(rb.extracted_gst_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Catalog prices are tax-inclusive; embedded GST across bills"],
        ["Taxable Base Turnover", `INR ${taxableBase.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Net assessable value for GST computation"],
        ["Taxable Bills Processed", `${rb.taxable_bills_count ?? 0} bills`, "Count of invoices containing taxable products"],
      ],
      theme: "plain",
      headStyles: { fillColor: [88, 28, 135], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 65 },
        1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
        2: { cellWidth: 85 }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Sales_Summary_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateCategorySalesPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  categorySalesData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "CATEGORY SALES & REVENUE SHARE REPORT", dateRangeLabel);

  const items = categorySalesData?.items || [];
  const totalUnits = items.reduce((acc: number, c: any) => acc + (c.quantity_sold || 0), 0);
  const totalRevenue = items.reduce((acc: number, c: any) => acc + (c.revenue || 0), 0);
  const totalItemsSold = items.reduce((acc: number, c: any) => acc + (c.items_sold || 0), 0);

  // Executive summary
  (autoTable as any)(doc, {
    startY: y,
    head: [["Total Categories", "Unique Items Sold", "Total Units Sold", "Total Revenue (INR)"]],
    body: [[
      `${items.length} categories`,
      `${totalItemsSold} items`,
      totalUnits % 1 === 0 ? String(totalUnits) : totalUnits.toFixed(2),
      `INR ${totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: { fontSize: 8.5, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const tableBody = items.map((c: any) => [
    c.category_name || "Uncategorized",
    c.items_sold ?? "—",
    c.quantity_sold !== undefined ? (c.quantity_sold % 1 === 0 ? c.quantity_sold : c.quantity_sold.toFixed(2)) : "—",
    `INR ${(c.revenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `${(c.revenue_share_pct || 0).toFixed(1)}%`,
    c.avg_item_price ? `INR ${c.avg_item_price.toFixed(2)}` : "—"
  ]);

  // Grand Total Row
  tableBody.push([
    "GRAND TOTAL",
    totalItemsSold,
    totalUnits % 1 === 0 ? String(totalUnits) : totalUnits.toFixed(2),
    `INR ${totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    "100.0%",
    "—"
  ]);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Category Name", "Items Sold", "Units Sold", "Revenue (INR)", "Revenue Share %", "Avg Item Price"]],
    body: tableBody,
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right", fontStyle: "bold" },
      4: { halign: "right" },
      5: { halign: "right" }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Category_Sales_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateAovPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  aovData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "AVERAGE ORDER VALUE (AOV) & TENDER MIX REPORT", dateRangeLabel);

  const overallAov = aovData?.overall_aov || 0;

  (autoTable as any)(doc, {
    startY: y,
    head: [["Key Metric", "Average Value (INR)", "Context"]],
    body: [
      ["Overall Average Order Value (AOV)", `INR ${overallAov.toFixed(2)}`, "Average net basket revenue per completed customer order"]
    ],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 8.5 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 70 },
      1: { fontStyle: "bold", halign: "right", cellWidth: 40 },
      2: { cellWidth: 75 }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (aovData?.by_payment_method && Array.isArray(aovData.by_payment_method)) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("1. AOV Breakdown by Payment Method", 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Payment Method / Tenders", "Orders Count", "Method Share", "Average per Order Breakdown"]],
      body: aovData.by_payment_method.map((pm: any) => {
        const avgParts: string[] = [];
        if (pm.avg_cash != null && pm.avg_cash > 0) avgParts.push(`Cash INR ${pm.avg_cash.toFixed(2)}`);
        if (pm.avg_upi != null && pm.avg_upi > 0) avgParts.push(`UPI INR ${pm.avg_upi.toFixed(2)}`);
        if (pm.avg_credit != null && pm.avg_credit > 0) avgParts.push(`Credit INR ${pm.avg_credit.toFixed(2)}`);
        if (pm.avg_debit != null && pm.avg_debit > 0) avgParts.push(`Udhaar INR ${pm.avg_debit.toFixed(2)}`);

        return [
          pm.payment_method + (pm.tenders_present && pm.tenders_present.length > 1 ? ` (${pm.tenders_present.join(" + ")})` : ""),
          pm.orders_count || 0,
          pm.breakdown_description || "—",
          avgParts.length > 0 ? avgParts.join(" | ") : `INR ${(pm.avg_order_value || overallAov).toFixed(2)}`
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 50 },
        1: { halign: "right", cellWidth: 25 },
        2: { cellWidth: 45 },
        3: { cellWidth: 65 }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (aovData?.trend && Array.isArray(aovData.trend)) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("2. Date-wise AOV Trend", 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Date / Period", "Completed Orders", "Avg Order Value (INR)"]],
      body: aovData.trend.map((t: any) => [
        t.bucket ? new Date(t.bucket).toLocaleDateString("en-IN") : "—",
        t.orders_count || 0,
        `INR ${(t.avg_order_value || 0).toFixed(2)}`
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right", fontStyle: "bold" }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`AOV_Report_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generatePaymentMixPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  paymentMixData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "PAYMENT MIX & TENDER REPORT", dateRangeLabel);

  const methods = paymentMixData?.methods || [];
  const totalRevenue = methods.reduce((acc: number, m: any) => acc + (m.total_revenue || 0), 0);
  const totalOrders = methods.reduce((acc: number, m: any) => acc + (m.orders_count || 0), 0);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Total Payment Methods", "Total Transactions", "Total Collected Revenue (INR)"]],
    body: [[
      `${methods.length} methods`,
      `${totalOrders} transactions`,
      `INR ${totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: { fontSize: 8.5, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const tableBody = methods.map((m: any) => [
    m.payment_method ? m.payment_method.replace(/_/g, " ") : "Unknown",
    m.orders_count || 0,
    `INR ${(m.total_revenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `${(m.revenue_share_pct || 0).toFixed(1)}%`,
    m.cash_sub_total ? `INR ${m.cash_sub_total.toFixed(2)}` : "—",
    m.upi_sub_total ? `INR ${m.upi_sub_total.toFixed(2)}` : "—"
  ]);

  tableBody.push([
    "GRAND TOTAL",
    totalOrders,
    `INR ${totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    "100.0%",
    "—",
    "—"
  ]);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Payment Method", "Txn Count", "Revenue (INR)", "Share %", "Cash Sub-part", "UPI Sub-part"]],
    body: tableBody,
    theme: "grid",
    headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { halign: "right" },
      2: { halign: "right", fontStyle: "bold" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" }
    }
  });

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Payment_Mix_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateDiscountPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  discountData: any
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "DISCOUNTS & CONCESSIONS AUDIT REPORT", dateRangeLabel);

  const byType = discountData?.by_type || [];
  const bills = discountData?.discounted_bills || [];
  const totalDiscount = byType.reduce((acc: number, d: any) => acc + (d.total_amount || 0), 0);
  const totalCount = byType.reduce((acc: number, d: any) => acc + (d.count || 0), 0);

  (autoTable as any)(doc, {
    startY: y,
    head: [["Discount Categories", "Total Discounted Bills", "Total Discount Concession (INR)"]],
    body: [[
      `${byType.length} types`,
      `${bills.length || totalCount} bills`,
      `INR ${totalDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ]],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: { fontSize: 8.5, fontStyle: "bold", halign: "center" }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (byType.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("1. Discounts Summary by Type", 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Discount Type", "Orders Count", "Discount Amount (INR)", "Share of Discounts"]],
      body: byType.map((d: any) => [
        d.discount_type || "General",
        d.count || 0,
        `INR ${(d.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        totalDiscount > 0 ? `${(((d.total_amount || 0) / totalDiscount) * 100).toFixed(1)}%` : "0%"
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 60 },
        1: { halign: "right" },
        2: { halign: "right", fontStyle: "bold" },
        3: { halign: "right" }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (bills.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`2. Discounted Bills Log (${bills.length} bills)`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Bill #", "Date/Time", "Customer", "Gross (INR)", "Discount (INR)", "Discount Type", "Final Total (INR)"]],
      body: bills.map((b: any) => [
        b.basket_number || b.order_id?.slice(0, 8) || "—",
        b.created_at ? new Date(b.created_at).toLocaleDateString("en-IN") : "—",
        b.customer_name || "Walk-in",
        `INR ${(b.gross_total || b.total_amount || 0).toFixed(2)}`,
        `-INR ${(b.discount_amount || b.discount_value || 0).toFixed(2)}`,
        b.discount_type || "PROMO",
        `INR ${(b.final_total || b.total_amount || 0).toFixed(2)}`
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.5 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 35 },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
        5: { cellWidth: 25 },
        6: { halign: "right", fontStyle: "bold" }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Discounts_Report_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function generateSalesMasterPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  options: {
    categorySalesData?: any;
    itemSalesData?: any;
    aovData?: any;
    paymentMixData?: any;
    discountData?: any;
    selectedCategoryId?: string;
    filterCategoryName?: string;
  }
) {
  const doc = new (jsPDF as any)({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = drawHeader(doc, restaurant, "SALES & ORDERS MASTER AUDIT REPORT", dateRangeLabel);

  let sectionIdx = 1;

  // 1. Sales Summary Bridge
  if (options.itemSalesData?.reconciliation_bridge) {
    const rb = options.itemSalesData.reconciliation_bridge;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Commercial Sales & Revenue Reconciliation Bridge`, 14, y);
    sectionIdx++;
    y += 5;

    const grossItem = rb.gross_item_sales || 0;
    const delivery = rb.delivery_and_handling_charges ?? rb.taxes_and_charges ?? 0;
    const grossEffective = (grossItem + delivery) - (rb.bill_discounts || 0);
    const grossBilled = rb.gross_billed_revenue ?? grossEffective;
    const netRevenue = grossBilled - (rb.customer_returns || 0);
    const netRealised = netRevenue - (rb.loyalty_discounts || 0);

    (autoTable as any)(doc, {
      startY: y,
      head: [["Financial Step", "Amount (INR)", "Accounting Description"]],
      body: [
        ["Gross Item Sales", `INR ${grossItem.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Catalog merchandise value"],
        ["Service Charges / Delivery", `+INR ${delivery.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Delivery and handling services"],
        ["Bill Discounts", `-INR ${(rb.bill_discounts || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Coupons and item concessions"],
        ["Gross Billed Revenue", `INR ${grossBilled.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Total billed at registers"],
        ["Customer Returns", `-INR ${(rb.customer_returns || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Merchandise returned/refunded"],
        ["Net Counter Revenue", `INR ${netRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Final revenue retained by store"],
        ["Net Realised Revenue", `INR ${netRealised.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Cash and electronic tender realised"],
      ],
      theme: "grid",
      headStyles: { fillColor: [15, 23, 42], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 55 },
        1: { fontStyle: "bold", halign: "right", cellWidth: 35 },
        2: { cellWidth: 95 }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 2. Category Sales
  if (options.categorySalesData?.items && options.categorySalesData.items.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Sales by Category`, 14, y);
    sectionIdx++;
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Category", "Items Sold", "Units Sold", "Revenue (INR)", "% of Total"]],
      body: options.categorySalesData.items.map((c: any) => [
        c.category_name,
        c.items_sold ?? "—",
        c.quantity_sold !== undefined ? (c.quantity_sold % 1 === 0 ? c.quantity_sold : c.quantity_sold.toFixed(2)) : "—",
        `INR ${(c.revenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        `${(c.revenue_share_pct || 0).toFixed(1)}%`
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold" },
        4: { halign: "right" }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 3. Item-wise Sales
  if (options.itemSalesData?.items && options.itemSalesData.items.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Item-wise Sales Performance`, 14, y);
    sectionIdx++;
    y += 5;

    const itemsToPrint = options.selectedCategoryId
      ? options.itemSalesData.items.filter((it: any) => it.category_id === options.selectedCategoryId || it.category_name?.toLowerCase() === options.filterCategoryName?.toLowerCase())
      : options.itemSalesData.items;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Item Name", "Category", "Units Sold", "Revenue (INR)", "COGS (INR)", "Margin %"]],
      body: itemsToPrint.map((i: any) => {
        const itemCogs = i.cogs !== undefined ? i.cogs : (i.cost_per_unit || 0) * (i.quantity_sold || 0);
        return [
          i.item_name,
          i.category_name || "Uncategorized",
          i.quantity_sold !== undefined ? (i.quantity_sold % 1 === 0 ? i.quantity_sold : i.quantity_sold.toFixed(2)) : "—",
          `INR ${(i.revenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          `INR ${itemCogs.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          i.margin_pct !== undefined ? `${i.margin_pct.toFixed(1)}%` : "—"
        ];
      }),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.5 },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold" },
        4: { halign: "right" },
        5: { halign: "right" }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 4. AOV Breakdown
  if (options.aovData?.by_payment_method) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Average Order Value (AOV) by Tender`, 14, y);
    sectionIdx++;
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Payment Method / Tenders", "Orders Count", "Avg Ticket Context"]],
      body: options.aovData.by_payment_method.map((pm: any) => [
        pm.payment_method + (pm.tenders_present && pm.tenders_present.length > 1 ? ` (${pm.tenders_present.join(" + ")})` : ""),
        pm.orders_count || 0,
        pm.breakdown_description || `AOV: INR ${(pm.avg_order_value || options.aovData.overall_aov || 0).toFixed(2)}`
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        1: { halign: "right" }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 5. Payment Mix
  if (options.paymentMixData?.methods) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Payment Mix`, 14, y);
    sectionIdx++;
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Method", "Txn Count", "Revenue (INR)", "% of Total"]],
      body: options.paymentMixData.methods.map((p: any) => [
        p.payment_method.replace(/_/g, " "),
        p.orders_count,
        `INR ${(p.total_revenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        `${(p.revenue_share_pct || 0).toFixed(1)}%`
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right", fontStyle: "bold" },
        3: { halign: "right" }
      }
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // 6. Discounts
  if (options.discountData?.by_type) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${sectionIdx}. Discounts & Concessions`, 14, y);
    y += 5;

    (autoTable as any)(doc, {
      startY: y,
      head: [["Discount Type", "Orders Count", "Discount Value (INR)"]],
      body: options.discountData.by_type.map((d: any) => [
        d.discount_type,
        d.count,
        `INR ${(d.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
      ]),
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right", fontStyle: "bold" }
      }
    });
  }

  addPdfFooter(doc, restaurant);
  const cleanStoreName = (restaurant?.name || "Store").replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`Sales_Master_${cleanStoreName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Backwards-compatible alias for generateSalesPdfReport
export function generateSalesPdfReport(
  restaurant: any,
  dateRangeLabel: string,
  categorySalesData: any,
  itemSalesData: any,
  aovData: any,
  paymentMixData: any,
  discountData: any
) {
  generateSalesMasterPdfReport(restaurant, dateRangeLabel, {
    categorySalesData,
    itemSalesData,
    aovData,
    paymentMixData,
    discountData,
  });
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
