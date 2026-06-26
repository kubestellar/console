export function isWebDriverAutomation(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver
}

export function resolveAgentWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export function isLikelyWsError(error: unknown): boolean {
  if (error instanceof DOMException) return true
  if (error instanceof TypeError) return true
  const message = String((error as { message?: string } | null)?.message || error || '').toLowerCase()
  return message.includes('websocket') || message.includes('ws') || message.includes('network') || message.includes('failed')
}
