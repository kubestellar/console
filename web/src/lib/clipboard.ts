/**
 * Safe clipboard write that handles non-secure contexts (HTTP without localhost)
 * and browsers where the Clipboard API is unavailable.
 *
 * Falls back to the deprecated document.execCommand('copy') when
 * navigator.clipboard is undefined (Safari on HTTP, older browsers).
 *
 * Returns true if the copy succeeded, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Clipboard API is only available in secure contexts (HTTPS or localhost)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Clipboard API can throw even when available (e.g., iframe restrictions)
      // Fall through to execCommand fallback
    }
  }

  // Fallback: textarea + execCommand for non-secure contexts
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    // Position off-screen to avoid visual flash
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
