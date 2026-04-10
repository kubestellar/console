/**
 * Delay in ms before revoking a blob Object URL after triggering a download.
 * Browsers (especially Firefox) may still need the URL reference while the
 * download action spins up on the main thread.  Revoking synchronously can
 * produce a corrupted or empty file.
 */
const REVOKE_OBJECT_URL_DELAY_MS = 100

/**
 * Safely revoke a blob Object URL after a short delay so the browser can
 * finish initiating the download.
 */
export function safeRevokeObjectURL(url: string): void {
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_OBJECT_URL_DELAY_MS)
}

// ─────────────────────────────────────────────────────────────────────
// downloadBlob — try/catch wrapper around the
// createObjectURL + <a>.click() pattern.
//
// #6226: 6 download sites used this pattern with no try/catch, so a
// failure (storage quota exceeded, browser policy block, extension
// blocker, detached document) propagated as an unhandled exception
// and could produce a white screen with no user feedback. This helper
// captures any failure and returns it so callers can surface a toast.
// ─────────────────────────────────────────────────────────────────────

/** Result of a download attempt. `ok=true` when the click was
 * dispatched successfully (note: this does NOT guarantee the user
 * accepted the save dialog or that the file landed on disk; the
 * browser handles that asynchronously and gives no feedback to JS). */
export interface DownloadResult {
  ok: boolean
  /** Error captured during the attempt. Always set when ok=false. */
  error?: Error
}

/**
 * Trigger a browser download for the given Blob with the given filename.
 * Always wraps the work in try/catch and always revokes the object URL
 * (deferred via safeRevokeObjectURL so the click handler completes
 * before the URL is freed).
 *
 * Returns `{ ok: true }` on success or `{ ok: false, error }` so
 * callers can surface a user-visible error toast on failure.
 */
export function downloadBlob(filename: string, blob: Blob): DownloadResult {
  let url: string | undefined
  let anchor: HTMLAnchorElement | undefined
  try {
    url = URL.createObjectURL(blob)
    anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    // Older Firefox requires the anchor to be in the document tree for
    // click() to actually trigger a download.
    document.body.appendChild(anchor)
    anchor.click()
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  } finally {
    // Always clean up the DOM node and the object URL, even on the
    // error path — leaving them around leaks memory and (for the URL)
    // pins the blob.
    if (anchor && anchor.parentNode) {
      try {
        anchor.parentNode.removeChild(anchor)
      } catch {
        // Already removed or never attached — ignore.
      }
    }
    if (url) {
      safeRevokeObjectURL(url)
    }
  }
}

/**
 * Convenience wrapper that builds a Blob from a string + MIME type and
 * downloads it. Used for the common case of saving text content (YAML,
 * JSON, kubectl output, logs).
 */
export function downloadText(
  filename: string,
  text: string,
  mimeType = 'text/plain;charset=utf-8',
): DownloadResult {
  return downloadBlob(filename, new Blob([text], { type: mimeType }))
}

/**
 * Trigger a download for a data URL string (e.g. the output of
 * `canvas.toDataURL()` or `echartsInstance.getDataURL()`). Used by
 * chart export buttons that already have a rendered image.
 *
 * Same try/catch behavior as `downloadBlob` — returns `{ ok }` so
 * callers can surface a toast on failure. Does not need to revoke
 * anything because data: URLs are not held by the URL store.
 */
export function downloadDataUrl(filename: string, dataUrl: string): DownloadResult {
  let anchor: HTMLAnchorElement | undefined
  try {
    anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  } finally {
    if (anchor && anchor.parentNode) {
      try {
        anchor.parentNode.removeChild(anchor)
      } catch {
        // Ignore.
      }
    }
  }
}
