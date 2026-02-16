/**
 * ImageKit CDN + Image Optimization Utility
 *
 * Transforms Supabase Storage URLs into ImageKit CDN URLs with:
 * - Auto-format (WebP/AVIF based on browser support)
 * - On-the-fly resizing
 * - Face-detection cropping (great for profile photos)
 * - Quality optimization
 *
 * Environment variable required:
 *   NEXT_PUBLIC_IMAGEKIT_URL — your ImageKit URL endpoint (e.g., https://ik.imagekit.io/matchindeed)
 *
 * Setup:
 * 1. Create ImageKit account at https://imagekit.io
 * 2. Add Supabase Storage as an origin:
 *    Origin URL: https://<your-project>.supabase.co/storage/v1/object/public
 * 3. Set NEXT_PUBLIC_IMAGEKIT_URL to your ImageKit endpoint
 *
 * Usage:
 *   import { getOptimizedImageUrl, ImagePreset } from "@/lib/imagekit";
 *   <Image src={getOptimizedImageUrl(supabaseUrl, ImagePreset.PROFILE_CARD)} ... />
 */

const IMAGEKIT_URL = process.env.NEXT_PUBLIC_IMAGEKIT_URL;

// ---------------------------------------------------------------
// Image Transformation Presets
// ---------------------------------------------------------------
export const ImagePreset = {
  /** Profile card in discover/search grids — 400x500, face crop */
  PROFILE_CARD: "tr=w-400,h-500,fo-face,q-80,f-auto",

  /** Profile thumbnail in lists/messages — 80x80 circle crop */
  THUMBNAIL: "tr=w-80,h-80,fo-face,r-max,q-80,f-auto",

  /** Full profile detail view — 800px wide, auto height */
  PROFILE_FULL: "tr=w-800,fo-face,q-85,f-auto",

  /** Top picks carousel — 300x400 */
  TOP_PICKS: "tr=w-300,h-400,fo-face,q-80,f-auto",

  /** Admin moderation — original quality, max 1200px */
  MODERATION: "tr=w-1200,q-90,f-auto",

  /** Blurred preview (for non-subscribers) — low quality + blur */
  BLURRED: "tr=w-400,h-500,bl-30,q-50,f-auto",
} as const;

type PresetValue = (typeof ImagePreset)[keyof typeof ImagePreset];

/**
 * Convert a Supabase Storage URL into an optimized ImageKit URL.
 *
 * If ImageKit is not configured (no NEXT_PUBLIC_IMAGEKIT_URL), returns
 * the original URL unchanged — making this safe to use everywhere.
 *
 * @param originalUrl - The Supabase Storage URL
 * @param preset - An ImagePreset transformation string
 * @returns Optimized ImageKit URL or original URL if not configured
 */
export function getOptimizedImageUrl(
  originalUrl: string,
  preset: PresetValue | string = ImagePreset.PROFILE_CARD
): string {
  // If ImageKit is not configured, return original URL
  if (!IMAGEKIT_URL || !originalUrl) return originalUrl;

  // Only transform Supabase Storage URLs
  if (!originalUrl.includes("supabase.co/storage")) return originalUrl;

  try {
    // Extract the path after /storage/v1/object/public/
    const storagePathMatch = originalUrl.match(
      /\/storage\/v1\/object\/public\/(.*)/
    );
    if (!storagePathMatch) return originalUrl;

    const storagePath = storagePathMatch[1];

    // Build ImageKit URL: endpoint/transformations/path
    const imagekitUrl = `${IMAGEKIT_URL}/${storagePath}?${preset}`;
    return imagekitUrl;
  } catch {
    // If anything goes wrong, return original URL
    return originalUrl;
  }
}

/**
 * Get a responsive srcSet for Next.js Image component.
 * Returns multiple sizes for the `sizes` prop.
 */
export function getResponsiveSrcSet(
  originalUrl: string,
  widths: number[] = [320, 640, 960, 1280]
): string {
  if (!IMAGEKIT_URL || !originalUrl) return "";

  return widths
    .map((w) => {
      const url = getOptimizedImageUrl(
        originalUrl,
        `tr=w-${w},fo-face,q-80,f-auto`
      );
      return `${url} ${w}w`;
    })
    .join(", ");
}
