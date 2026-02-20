import {
  MCP_HOOK_TIMEOUT_MS,
  BACKEND_HEALTH_CHECK_TIMEOUT_MS,
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_USER_CACHE,
  DEMO_TOKEN_VALUE,
} from './constants'
import { trackSessionExpired } from './analytics'

const API_BASE = ''
const DEFAULT_TIMEOUT = MCP_HOOK_TIMEOUT_MS
const BACKEND_CHECK_INTERVAL = 10000 // 10 seconds between backend checks when unavailable

// Error class for unauthenticated requests
export class UnauthenticatedError extends Error {
  constructor() {
    super('No authentication token available')
    this.name = 'UnauthenticatedError'
  }
}

// Error class for 401 unauthorized responses (invalid/expired token)
export class UnauthorizedError extends Error {
  constructor() {
    super('Token is invalid or expired')
    this.name = 'UnauthorizedError'
  }
}

// Debounce 401 handling to avoid multiple simultaneous logouts
let handling401 = false

/**
 * Handle 401 Unauthorized responses by clearing auth state and redirecting to login.
 * This is debounced to avoid multiple simultaneous logouts from parallel API calls.
 */
function handle401(): void {
  if (handling401) return
  handling401 = true

  console.warn('[API] Received 401 Unauthorized - token invalid or expired, logging out')

  // Show an in-page notification before redirecting (DOM-injected, no React dependency)
  showSessionExpiredBanner()

  trackSessionExpired()

  // Clear auth state
  localStorage.removeItem(STORAGE_KEY_TOKEN)
  localStorage.removeItem(STORAGE_KEY_USER_CACHE)

  // Redirect to login after a delay so the user sees the banner
  setTimeout(() => {
    window.location.href = '/login?reason=session_expired'
  }, 3000)
}

/**
 * Inject a DOM-based notification banner for session expiry.
 * This runs outside React so it works from any context (API client, background fetches, etc).
 */
function showSessionExpiredBanner(): void {
  // Avoid duplicates
  if (document.getElementById('session-expired-banner')) return

  const toast = document.createElement('div')
  toast.id = 'session-expired-banner'
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 99999;
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px;
    background: rgba(234,179,8,0.15);
    border: 1px solid rgba(234,179,8,0.4);
    border-radius: 8px; backdrop-filter: blur(8px);
    color: #fbbf24; font-family: system-ui, sans-serif; font-size: 14px;
    animation: slideUp 0.3s ease-out;
  `
  toast.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
      <path d="M12 9v4"/><path d="M12 17h.01"/>
    </svg>
    <span><strong>Session expired</strong> — Redirecting to sign in...</span>
  `

  const style = document.createElement('style')
  style.textContent = `@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }`
  document.head.appendChild(style)
  document.body.appendChild(toast)
}

// Error class for backend unavailable
export class BackendUnavailableError extends Error {
  constructor() {
    super('Backend API is currently unavailable')
    this.name = 'BackendUnavailableError'
  }
}

// Backend availability tracking with localStorage persistence
const BACKEND_STATUS_KEY = 'kc-backend-status'
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
    // If backend was already determined available, return immediately
    // If unavailable, allow re-check after interval
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
        signal: AbortSignal.timeout(BACKEND_HEALTH_CHECK_TIMEOUT_MS),
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

/**
 * Check if the backend has OAuth configured by reading the /health endpoint.
 * Returns { backendUp, oauthConfigured }.
 */
export async function checkOAuthConfigured(): Promise<{ backendUp: boolean; oauthConfigured: boolean }> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(BACKEND_HEALTH_CHECK_TIMEOUT_MS),
    })
    if (!response.ok) return { backendUp: false, oauthConfigured: false }
    const data = await response.json()
    return {
      backendUp: data.status === 'ok',
      oauthConfigured: !!data.oauth_configured,
    }
  } catch {
    return { backendUp: false, oauthConfigured: false }
  }
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
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  private hasToken(): boolean {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN)
    // Demo token doesn't count as a real token for backend API calls
    return !!token && token !== DEMO_TOKEN_VALUE
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
        // Handle 401 Unauthorized - token is invalid or expired
        if (response.status === 401) {
          handle401()
          throw new UnauthorizedError()
        }
        const errorText = await response.text().catch(() => '')
        // Note: We don't mark backend as failed on 500 responses here.
        // The health check is the source of truth for backend availability.
        // Individual API 500s could be endpoint-specific issues, not infrastructure failure.
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
      const data = await response.json()
      return { data }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`)
      }
      // Only mark backend failure on actual network errors (fetch TypeError)
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
        // Handle 401 Unauthorized - token is invalid or expired
        if (response.status === 401) {
          handle401()
          throw new UnauthorizedError()
        }
        const errorText = await response.text().catch(() => '')
        // Note: Don't mark backend as failed on 500s - health check is source of truth
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
      const data = await response.json()
      return { data }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`)
      }
      // Only mark backend failure on actual network errors
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
        // Handle 401 Unauthorized - token is invalid or expired
        if (response.status === 401) {
          handle401()
          throw new UnauthorizedError()
        }
        const errorText = await response.text().catch(() => '')
        // Note: Don't mark backend as failed on 500s - health check is source of truth
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
      const data = await response.json()
      return { data }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`)
      }
      // Only mark backend failure on actual network errors
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
        // Handle 401 Unauthorized - token is invalid or expired
        if (response.status === 401) {
          handle401()
          throw new UnauthorizedError()
        }
        const errorText = await response.text().catch(() => '')
        // Note: Don't mark backend as failed on 500s - health check is source of truth
        throw new Error(errorText || `API error: ${response.status}`)
      }
      markBackendSuccess()
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${(options?.timeout ?? DEFAULT_TIMEOUT) / 1000}s: ${path}`)
      }
      // Only mark backend failure on actual network errors
      if (err instanceof TypeError && err.message.includes('fetch')) {
        markBackendFailure()
      }
      throw err
    }
  }
}

export const api = new ApiClient()
