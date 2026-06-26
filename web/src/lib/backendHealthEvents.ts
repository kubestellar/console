const BACKEND_HEALTH_EVENT_NAME = 'kc:backend-health'

const BACKEND_UNAVAILABLE_STATUSES = new Set([502, 503, 504])

type BackendHealthSource = 'http' | 'ws' | 'health'

export interface BackendHealthEventDetail {
  isAvailable: boolean
  source: BackendHealthSource
  status?: number
}

export function shouldMarkBackendUnavailable(status: number): boolean {
  return BACKEND_UNAVAILABLE_STATUSES.has(status)
}

function dispatchBackendHealthEvent(detail: BackendHealthEventDetail): void {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(new CustomEvent<BackendHealthEventDetail>(BACKEND_HEALTH_EVENT_NAME, { detail }))
}

export function reportBackendAvailable(source: BackendHealthSource = 'http', status?: number): void {
  dispatchBackendHealthEvent({ isAvailable: true, source, status })
}

export function reportBackendUnavailable(source: BackendHealthSource = 'http', status?: number): void {
  dispatchBackendHealthEvent({ isAvailable: false, source, status })
}

export function subscribeToBackendHealthEvents(
  listener: (detail: BackendHealthEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<BackendHealthEventDetail>
    if (customEvent.detail) {
      listener(customEvent.detail)
    }
  }

  window.addEventListener(BACKEND_HEALTH_EVENT_NAME, handleEvent)
  return () => window.removeEventListener(BACKEND_HEALTH_EVENT_NAME, handleEvent)
}
