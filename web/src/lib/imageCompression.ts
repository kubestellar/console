/**
 * Compress an image data URI to fit within GitHub's issue body limit.
 *
 * Screenshots are embedded as base64 in issue bodies and processed into
 * rendered images by a GitHub Actions workflow. GitHub limits issue bodies
 * to 65,536 characters, so we compress images to JPEG and resize if needed.
 *
 * Target: ~30KB per screenshot (~40K base64 chars), leaving room for
 * the issue template and multiple screenshots.
 */

/** Maximum base64 characters per screenshot to stay within GitHub's 65K body limit */
const MAX_B64_CHARS_PER_SCREENSHOT = 40_000

/** Maximum pixel dimension (width or height) after resize */
const MAX_DIMENSION_PX = 1024

/** JPEG quality for compression (0-1) */
const JPEG_QUALITY = 0.6

/** Lower JPEG quality for retry if first pass is still too large */
const JPEG_QUALITY_LOW = 0.3

/** Maximum dimension for aggressive retry */
const MAX_DIMENSION_LOW_PX = 640

/**
 * Compress an image data URI to a JPEG data URI that fits within the
 * base64 character budget for GitHub issue embedding.
 *
 * Returns the compressed data URI, or null if compression fails.
 */
export async function compressScreenshot(dataUri: string): Promise<string | null> {
  try {
    // First pass: resize to MAX_DIMENSION_PX, JPEG at normal quality
    let result = await resizeAndCompress(dataUri, MAX_DIMENSION_PX, JPEG_QUALITY)
    if (result && getBase64Length(result) <= MAX_B64_CHARS_PER_SCREENSHOT) {
      return result
    }

    // Second pass: more aggressive — smaller size, lower quality
    result = await resizeAndCompress(dataUri, MAX_DIMENSION_LOW_PX, JPEG_QUALITY_LOW)
    if (result && getBase64Length(result) <= MAX_B64_CHARS_PER_SCREENSHOT) {
      return result
    }

    // Still too large — give up
    console.warn('[Screenshot] Image too large even after aggressive compression')
    return null
  } catch (err: unknown) {
    console.error('[Screenshot] Compression failed:', err)
    return null
  }
}

/** Get the length of the base64 portion of a data URI */
function getBase64Length(dataUri: string): number {
  const commaIdx = dataUri.indexOf(',')
  return commaIdx >= 0 ? dataUri.length - commaIdx - 1 : dataUri.length
}

/** Resize image to fit within maxDim and compress to JPEG */
function resizeAndCompress(dataUri: string, maxDim: number, quality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img

      // Scale down if either dimension exceeds max
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(null)
    img.src = dataUri
  })
}
