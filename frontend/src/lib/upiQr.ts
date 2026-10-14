import QRCode from "qrcode";

export interface UpiUriParams {
  upiId?: string | null;
  rawPayload?: string | null;
  payeeName?: string | null;
  amount: number;
  billNo?: string | null;
}

/**
 * Extracts and normalizes the UPI ID (VPA) from outlet or store settings.
 */
export function getOutletUpiId(storeOrOutlet?: any): string | null {
  if (!storeOrOutlet) return null;
  const directId = storeOrOutlet.direct_upi_id || storeOrOutlet.upi_id;
  if (directId && typeof directId === "string" && directId.trim()) {
    return directId.trim().replace(/\s+/g, "");
  }

  // Fallback: check if raw_upi_payload or bill_qr_url has a pa= parameter
  const raw = storeOrOutlet.raw_upi_payload || storeOrOutlet.bill_qr_url;
  if (raw && typeof raw === "string" && raw.includes("upi://pay")) {
    const match = raw.match(/[?&]pa=([^&]+)/i);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim().replace(/\s+/g, "");
    }
  }

  return null;
}

/**
 * Builds a standard NPCI-compliant UPI Intent URI:
 * upi://pay?pa={UPI_ID}&pn={NAME}&am={AMOUNT}&cu=INR&tn={NOTE}
 */
export function buildUpiPaymentUri(params: UpiUriParams): string | null {
  const { upiId, rawPayload, payeeName, amount, billNo } = params;

  let targetUpiId = upiId?.trim() || "";
  let cleanName = (payeeName || "ApnaGreen Basket")
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .slice(0, 30) || "Store";
  let mcc: string | null = null;
  let orgId: string | null = null;

  // If a raw merchant QR payload is configured, parse its existing params
  if (rawPayload && rawPayload.includes("upi://pay")) {
    try {
      // Fix potential formatting issues for URL parser
      const urlString = rawPayload.startsWith("upi://")
        ? rawPayload.replace("upi://pay?", "http://dummy/pay?")
        : rawPayload;
      const parsed = new URL(urlString);
      const q = parsed.searchParams;

      if (!targetUpiId && q.get("pa")) {
        targetUpiId = q.get("pa") || "";
      }
      if (q.get("pn")) {
        cleanName = q.get("pn") || cleanName;
      }
      if (q.get("mc")) {
        mcc = q.get("mc");
      }
      if (q.get("orgid")) {
        orgId = q.get("orgid");
      }
    } catch {
      const paMatch = rawPayload.match(/[?&]pa=([^&]+)/i);
      if (!targetUpiId && paMatch) targetUpiId = decodeURIComponent(paMatch[1]);
      const pnMatch = rawPayload.match(/[?&]pn=([^&]+)/i);
      if (pnMatch) cleanName = decodeURIComponent(pnMatch[1]);
      const mcMatch = rawPayload.match(/[?&]mc=([^&]+)/i);
      if (mcMatch) mcc = decodeURIComponent(mcMatch[1]);
    }
  }

  if (!targetUpiId) {
    return null;
  }

  // Remove any whitespace inside the VPA
  targetUpiId = targetUpiId.replace(/\s+/g, "");

  const parts: string[] = [];
  // pa: Payee VPA
  parts.push(`pa=${targetUpiId}`);

  // pn: Payee Name (encoded)
  parts.push(`pn=${encodeURIComponent(cleanName)}`);

  // mc: Merchant Category Code (if available)
  if (mcc) {
    parts.push(`mc=${encodeURIComponent(mcc)}`);
  }

  // orgid: NPCI Org ID (if present)
  if (orgId) {
    parts.push(`orgid=${encodeURIComponent(orgId)}`);
  }

  // am: Exact Net Payable Amount (format to 2 decimals)
  if (amount > 0) {
    parts.push(`am=${amount.toFixed(2)}`);
  }

  // cu: Currency (Always INR for UPI)
  parts.push("cu=INR");

  // tn: Transaction Note (Shown on bank statement / UPI apps)
  if (billNo) {
    const cleanNote = String(billNo)
      .replace(/[^a-zA-Z0-9#_-]/g, "")
      .slice(0, 30);
    if (cleanNote) {
      parts.push(`tn=${encodeURIComponent(`Bill #${cleanNote}`)}`);
    }
  } else {
    parts.push(`tn=${encodeURIComponent("POS Bill Payment")}`);
  }

  return `upi://pay?${parts.join("&")}`;
}

/**
 * Generates a high-contrast Base64 PNG data URL of the UPI QR code.
 */
export async function generateUpiQrDataUrl(
  upiUri: string,
  options: { width?: number; margin?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H" } = {}
): Promise<string | null> {
  if (!upiUri) return null;
  try {
    return await QRCode.toDataURL(upiUri, {
      width: options.width || 300,
      margin: options.margin !== undefined ? options.margin : 1,
      errorCorrectionLevel: options.errorCorrectionLevel || "M",
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  } catch (err) {
    console.error("Failed to generate UPI QR code:", err);
    return null;
  }
}
