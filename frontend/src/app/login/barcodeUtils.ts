/**
 * Barcode utilities for Weighing Scale integrations, EAN-13 masks, and PLU generation.
 */

export interface ParsedBarcodeMask {
  rawFormat: string;
  pattern: string; // e.g. "21 IIIII WWWWW C" or "02 IIII WWWWW"
  normalizedPattern: string; // pattern without spaces, e.g. "21IIIIIWWWWWC"
  prefix: string; // leading constant digits, e.g. "21"
  itemCodeLength: number; // count of 'I'
  hasWeight: boolean;
  weightLength: number; // count of 'W'
  hasPrice: boolean;
  priceLength: number; // count of 'P'
  hasChecksum: boolean; // includes 'C'
  totalLength: number;
}

/**
 * Resolves preset IDs (e.g. "21_5I_5W_GRAMS") or "CUSTOM:<pattern>" into a readable pattern.
 */
export function resolveBarcodePattern(formatString?: string | null): string {
  if (!formatString) return "21 IIIII WWWWW C";
  if (formatString.startsWith("CUSTOM:")) {
    const customPattern = formatString.replace("CUSTOM:", "").trim();
    return customPattern || "XX IIIII WWWWW C";
  }
  switch (formatString) {
    case "21_5I_5W_GRAMS":
      return "21 IIIII WWWWW C";
    case "21_5I_5P_INR":
      return "21 IIIII PPPPP C";
    case "20_6I_4W_GRAMS":
      return "20 IIIIII WWWW C";
    case "03_3I_5W_GRAMS":
      return "03 III WWWWW";
    default:
      return formatString;
  }
}

/**
 * Parses a resolved pattern into structured metadata.
 */
export function parseBarcodeMask(formatString?: string | null): ParsedBarcodeMask {
  const pattern = resolveBarcodePattern(formatString);
  const normalizedPattern = pattern.replace(/\s+/g, "").toUpperCase();

  let itemCodeLength = 0;
  let weightLength = 0;
  let priceLength = 0;
  let hasChecksum = false;
  let prefix = "";
  let inPrefix = true;

  for (let i = 0; i < normalizedPattern.length; i++) {
    const char = normalizedPattern[i];
    if (char === "I") {
      itemCodeLength++;
      inPrefix = false;
    } else if (char === "W") {
      weightLength++;
      inPrefix = false;
    } else if (char === "P") {
      priceLength++;
      inPrefix = false;
    } else if (char === "C") {
      hasChecksum = true;
      inPrefix = false;
    } else {
      if (inPrefix) {
        prefix += char;
      }
    }
  }

  // Fallback item code length if pattern has no 'I'
  if (itemCodeLength === 0) {
    itemCodeLength = 5;
  }

  return {
    rawFormat: formatString || "21_5I_5W_GRAMS",
    pattern,
    normalizedPattern,
    prefix,
    itemCodeLength,
    hasWeight: weightLength > 0,
    weightLength,
    hasPrice: priceLength > 0,
    priceLength,
    hasChecksum,
    totalLength: normalizedPattern.length,
  };
}

/**
 * Computes standard EAN-13 check digit for the first 12 digits using Modulo-10 algorithm.
 */
export function calculateEan13CheckDigit(first12Digits: string): string {
  const cleanDigits = first12Digits.replace(/\D/g, "").slice(0, 12);
  if (cleanDigits.length < 12) return "0";

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(cleanDigits[i], 10) || 0;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const remainder = sum % 10;
  return remainder === 0 ? "0" : (10 - remainder).toString();
}

/**
 * Generates an unused numeric Item PLU of exact `length` digits.
 */
export function generateItemPlu(length: number = 5, existingBarcodes: string[] = []): string {
  const safeLength = Math.max(1, Math.min(10, length));
  const min = Math.pow(10, safeLength - 1);
  const max = Math.pow(10, safeLength) - 1;

  const existingSet = new Set(existingBarcodes.map((b) => (b ? b.trim() : "")));

  // Try random attempts
  for (let attempt = 0; attempt < 100; attempt++) {
    const randomNum = Math.floor(min + Math.random() * (max - min + 1));
    const candidate = randomNum.toString().padStart(safeLength, "0");
    if (!existingSet.has(candidate) && !existingSet.has(randomNum.toString())) {
      return candidate;
    }
  }

  // Fallback sequential
  for (let seq = min; seq <= max; seq++) {
    const candidate = seq.toString().padStart(safeLength, "0");
    if (!existingSet.has(candidate) && !existingSet.has(seq.toString())) {
      return candidate;
    }
  }

  // If exhausted, return random padded
  return Math.floor(min + Math.random() * (max - min + 1))
    .toString()
    .padStart(safeLength, "0");
}

/**
 * Builds a composite barcode string from mask variables.
 */
export function buildScaleBarcode(
  formatString: string | null | undefined,
  params: {
    itemPlu?: string | number | null;
    weightGrams?: number | string | null;
    priceInr?: number | string | null;
  }
): string {
  const mask = parseBarcodeMask(formatString);
  const { normalizedPattern, itemCodeLength, weightLength, priceLength } = mask;

  // Clean and pad Item PLU
  let pluRaw = params.itemPlu ? String(params.itemPlu).replace(/\D/g, "") : "";
  if (!pluRaw) pluRaw = "1";
  const pluPadded = pluRaw.slice(-itemCodeLength).padStart(itemCodeLength, "0");

  // Clean and pad Weight in grams
  const rawWeight = typeof params.weightGrams === "number" ? Math.round(params.weightGrams) : parseInt(String(params.weightGrams || "0"), 10) || 0;
  const weightPadded = Math.max(0, rawWeight).toString().slice(-weightLength).padStart(weightLength, "0");

  // Clean and pad Price in INR
  const rawPrice = typeof params.priceInr === "number" ? Math.round(params.priceInr) : parseInt(String(params.priceInr || "0"), 10) || 0;
  const pricePadded = Math.max(0, rawPrice).toString().slice(-priceLength).padStart(priceLength, "0");

  let result = "";
  let iIdx = 0;
  let wIdx = 0;
  let pIdx = 0;

  for (let i = 0; i < normalizedPattern.length; i++) {
    const char = normalizedPattern[i];
    if (char === "I") {
      result += pluPadded[iIdx] || "0";
      iIdx++;
    } else if (char === "W") {
      result += weightPadded[wIdx] || "0";
      wIdx++;
    } else if (char === "P") {
      result += pricePadded[pIdx] || "0";
      pIdx++;
    } else if (char === "C") {
      // Calculate Checksum of what precedes
      const checkDigit = calculateEan13CheckDigit(result);
      result += checkDigit;
    } else if (char === "X") {
      result += "0";
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Decodes a scale barcode according to the mask for preview / verification.
 */
export function decodeScaleBarcode(
  formatString: string | null | undefined,
  barcode: string
): {
  isValidLength: boolean;
  itemPlu: string;
  weightGrams?: number;
  priceInr?: number;
  checksum?: string;
  isChecksumValid?: boolean;
} {
  const mask = parseBarcodeMask(formatString);
  const cleanCode = (barcode || "").trim();

  if (cleanCode.length !== mask.totalLength) {
    return {
      isValidLength: false,
      itemPlu: cleanCode,
    };
  }

  let itemPlu = "";
  let weightStr = "";
  let priceStr = "";
  let checksum = "";

  for (let i = 0; i < mask.normalizedPattern.length; i++) {
    const maskChar = mask.normalizedPattern[i];
    const codeChar = cleanCode[i];

    if (maskChar === "I") itemPlu += codeChar;
    else if (maskChar === "W") weightStr += codeChar;
    else if (maskChar === "P") priceStr += codeChar;
    else if (maskChar === "C") checksum += codeChar;
  }

  const weightGrams = weightStr ? parseInt(weightStr, 10) : undefined;
  const priceInr = priceStr ? parseInt(priceStr, 10) : undefined;

  let isChecksumValid: boolean | undefined = undefined;
  if (checksum && cleanCode.length === 13) {
    const expectedCheck = calculateEan13CheckDigit(cleanCode.slice(0, 12));
    isChecksumValid = expectedCheck === checksum;
  }

  return {
    isValidLength: true,
    itemPlu,
    weightGrams: !isNaN(weightGrams as number) ? weightGrams : undefined,
    priceInr: !isNaN(priceInr as number) ? priceInr : undefined,
    checksum: checksum || undefined,
    isChecksumValid,
  };
}
