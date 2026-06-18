/**
 * Session identity management.
 * Generates a unique session ID per browser tab (survives page navigation, not tab close).
 */

// Generate a unique session ID per browser tab (survives page navigation, not tab close)
export function getSessionId(): string {
  let id = sessionStorage.getItem('kc-session-id')
  if (!id) {
    // crypto.randomUUID() requires a secure context (HTTPS / localhost).
    // Fall back to crypto.getRandomValues() for HTTP contexts where randomUUID is unavailable.
    if (typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID()
    } else {
      const arr = new Uint8Array(9)
      crypto.getRandomValues(arr)
      id = `${Date.now().toString(36)}-${Array.from(arr).map(b => b.toString(36).padStart(2, '0')).join('')}`
    }
    sessionStorage.setItem('kc-session-id', id)
  }
  return id
}
