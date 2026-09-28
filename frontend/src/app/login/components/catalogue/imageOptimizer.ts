/**
 * Image optimization utilities for Catalogue PDF generator and print templates.
 * Transforms Cloudinary URLs to high-density, web-optimized images (450px max width, q_85)
 * so that catalogues with 100-250 items stay well under 10 MB without any loss of visual sharpness.
 */

export function getOptimizedImageUrl(
  url: string | undefined | null,
  width: number = 450,
  quality: number = 85
): string {
  if (!url || typeof url !== "string") return "";

  const trimmed = url.trim();
  if (!trimmed) return "";

  // Cloudinary image URL transformation
  if (trimmed.includes("res.cloudinary.com") && trimmed.includes("/image/upload/")) {
    // Prevent applying transformation twice
    if (trimmed.includes("/image/upload/w_") || trimmed.includes("/image/upload/c_")) {
      return trimmed;
    }
    return trimmed.replace(
      "/image/upload/",
      `/image/upload/w_${width},c_limit,q_${quality},f_auto/`
    );
  }

  return trimmed;
}
