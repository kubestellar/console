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
