const API_BASE = ''
const DEFAULT_TIMEOUT = 5000 // 5 seconds default timeout
const BACKEND_CHECK_INTERVAL = 30000 // 30 seconds between backend checks when unavailable

// Error class for unauthenticated requests
export class UnauthenticatedError extends Error {
  constructor() {
    super('No authentication token available')
    this.name = 'UnauthenticatedError'
  }
}

// Error class for backend unavailable
export class BackendUnavailableError extends Error {
  constructor() {
    super('Backend API is currently unavailable')
    this.name = 'BackendUnavailableError'
  }
}

// Backend availability tracking with localStorage persistence
const BACKEND_STATUS_KEY = 'kkc-backend-status'
let backendLastCheckTime = 0
let backendAvailable: boolean | null = null // null = unknown, true = available, false = unavailable
let backendCheckPromise: Promise<boolean> | null = null

// Initialize from localStorage
try {
  const stored = localStorage.getItem(BACKEND_STATUS_KEY)
  if (stored) {
    const { available, timestamp } = JSON.parse(stored)
    // Use cached status if checked within the last 5 minutes
    if (Date.now() - timestamp < 300000) {
      backendAvailable = available
      backendLastCheckTime = timestamp
    }
  }
} catch {
  // Ignore localStorage errors
}

/**
 * Check backend availability - only makes ONE request, all others wait
 * Caches result in localStorage to avoid repeated checks across page loads
 * @param forceCheck - If true, ignores cache and always checks (used by login)
 */
export async function checkBackendAvailability(forceCheck = false): Promise<boolean> {
  // If we already know the status and it was checked recently, return it
  if (!forceCheck && backendAvailable !== null) {
    const now = Date.now()
    if (backendAvailable || now - backendLastCheckTime < BACKEND_CHECK_INTERVAL) {
      return backendAvailable
    }
  }

  // If a check is already in progress, wait for it
  if (backendCheckPromise) {
    return backendCheckPromise
  }

  // Start a new check
  backendCheckPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      })
      // Backend is available if it responds at all (even 401 unauthorized)
      // Only 5xx or network errors indicate backend is down
      backendAvailable = response.status < 500
      backendLastCheckTime = Date.now()
      // Cache to localStorage
      try {
        localStorage.setItem(BACKEND_STATUS_KEY, JSON.stringify({
          available: backendAvailable,
          timestamp: backendLastCheckTime,
        }))
      } catch { /* ignore */ }
      return backendAvailable
    } catch {
      backendAvailable = false
      backendLastCheckTime = Date.now()
      // Cache to localStorage
      try {
        localStorage.setItem(BACKEND_STATUS_KEY, JSON.stringify({
          available: false,
          timestamp: backendLastCheckTime,
        }))
      } catch { /* ignore */ }
      return false
    } finally {
      backendCheckPromise = null
    }
  })()

  return backendCheckPromise
}

function markBackendFailure(): void {
  backendAvailable = false
  backendLastCheckTime = Date.now()
  try {
    localStorage.setItem(BACKEND_STATUS_KEY, JSON.stringify({
      available: false,
      timestamp: backendLastCheckTime,
    }))
  } catch { /* ignore */ }
}

function markBackendSuccess(): void {
  backendAvailable = true
  backendLastCheckTime = Date.now()
  try {
    localStorage.setItem(BACKEND_STATUS_KEY, JSON.stringify({
      available: true,
      timestamp: backendLastCheckTime,
    }))
  } catch { /* ignore */ }
}

/**
 * Check if the backend is known to be unavailable.
 * Returns true if backend is definitely unavailable (checked recently and failed).
 * Returns false if backend is available or status is unknown.
 */
export function isBackendUnavailable(): boolean {
  if (backendAvailable === null) return false // Unknown - allow first request
  if (backendAvailable) return false // Available

  // Check if enough time has passed for a recheck
  const now = Date.now()
  if (now - backendLastCheckTime >= BACKEND_CHECK_INTERVAL) {
    return false // Allow a recheck
  }

  return true // Known unavailable
}

class ApiClient {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const token = localStorage.getItem('token')
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  private hasToken(): boolean {
    const token = localStorage.getItem('token')
    // Demo token doesn't count as a real token for backend API calls
    return !!token && token !== 'demo-token'
  }

  private createAbortController(timeout: number): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    return { controller, timeoutId }
  }

  async get<T = any>(path: string, options?: { headers?: Record<string, string>; timeout?: number; requiresAuth?: boolean }): Promise<{ data: T }> {
    // Skip API calls to protected endpoints when not authenticated
    if (options?.requiresAuth !== false && !this.hasToken()) {
      throw new UnauthenticatedError()
    }

    // Check backend availability - waits for single health check on first load
    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const headers = { ...this.getHeaders(), ...options?.headers }
    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        // 5xx errors from Vite proxy indicate backend is down (proxy can't connect)
        if (response.status >= 500) {
          markBackendFailure()
        }
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
      const data = await response.json()
      return { data }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        markBackendFailure()
        throw new Error(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`)
      }
      // Network errors also indicate backend issues
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
      }
      throw err
    }
  }

  async post<T = any>(path: string, body?: any, options?: { timeout?: number }): Promise<{ data: T }> {
    // Check backend availability
    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status >= 500) {
          markBackendFailure()
        }
        throw new Error(`API error: ${response.status}`)
      }
      markBackendSuccess()
      const data = await response.json()
      return { data }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        markBackendFailure()
        throw new Error(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`)
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
      }
      throw err
    }
  }

  async put<T = any>(path: string, body?: any, options?: { timeout?: number }): Promise<{ data: T }> {
    // Check backend availability
    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status >= 500) {
          markBackendFailure()
        }
        throw new Error(`API error: ${response.status}`)
      }
      markBackendSuccess()
      const data = await response.json()
      return { data }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        markBackendFailure()
        throw new Error(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`)
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
      }
      throw err
    }
  }

  async delete(path: string, options?: { timeout?: number }): Promise<void> {
    // Check backend availability
    const available = await checkBackendAvailability()
    if (!available) {
      throw new BackendUnavailableError()
    }

    const { controller, timeoutId } = this.createAbortController(options?.timeout ?? DEFAULT_TIMEOUT)

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status >= 500) {
          markBackendFailure()
        }
        throw new Error(`API error: ${response.status}`)
      }
      markBackendSuccess()
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        markBackendFailure()
        throw new Error(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`)
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
      }
      throw err
    }
  }
}

export const api = new ApiClient()
