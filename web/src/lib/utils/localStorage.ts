/**
 * Safe localStorage utility functions that handle private browsing mode
 * and quota exceeded errors gracefully.
 */

/**
 * Sanitize a localStorage key for safe use in log messages.
 * encodeURIComponent() escapes special characters (including format-string
 * metacharacters) so the key cannot inject unexpected content into log output.
 */
function sanitizeKeyForLog(key: string): string {
  return encodeURIComponent(key)
}

/**
 * Dispatch a structured storage error event for monitoring and debugging.
 * Logs to console with clear warning and dispatches a custom event that
 * monitoring tools, error boundaries, and debug panels can subscribe to.
 *
 * @param operation - The operation that failed (e.g., 'getItem', 'setItem')
 * @param key - The localStorage key involved (will be sanitized)
 * @param error - The error that occurred
 */
function dispatchStorageError(operation: string, key: string, error: unknown): void {
  const sanitizedKey = sanitizeKeyForLog(key)
  const errorMessage = error instanceof Error ? error.message : String(error)
  
  // Log with clear warning (not just error) for better visibility
  // All dynamic values passed as separate console.warn arguments to avoid format-string injection
  console.warn('[localStorage] operation failed —', 'op:', operation, 'key:', sanitizedKey, 'error:', errorMessage)
  
  // Dispatch custom event for monitoring/debugging tools
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('storage-error', {
        detail: {
          operation,
          key: sanitizedKey,
          error: errorMessage,
          timestamp: Date.now(),
        },
      })
    )
  }
}

/**
 * Safely get an item from localStorage
 * @param key - The key to retrieve
 * @returns The stored value or null if not found or error occurs
 */
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (error: unknown) {
    // localStorage may throw in private browsing mode or when disabled
    dispatchStorageError('getItem', key, error)
    return null
  }
}

/**
 * Safely set an item in localStorage
 * @param key - The key to store
 * @param value - The value to store
 * @returns true if successful, false otherwise
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error: unknown) {
    // localStorage may throw in private browsing mode, when quota exceeded, or when disabled
    dispatchStorageError('setItem', key, error)
    return false
  }
}

/**
 * Safely remove an item from localStorage
 * @param key - The key to remove
 * @returns true if successful, false otherwise
 */
export function safeRemoveItem(key: string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch (error: unknown) {
    dispatchStorageError('removeItem', key, error)
    return false
  }
}

/**
 * Safely read a localStorage key by index.
 * @param index - The storage index to read
 * @returns The key at the given index or null if unavailable
 */
export function safeKey(index: number): string | null {
  try {
    return localStorage.key(index)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.warn(`[localStorage] key() failed for index=${index}:`, errorMessage)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('storage-error', {
          detail: {
            operation: 'key',
            key: `index:${index}`,
            error: errorMessage,
            timestamp: Date.now(),
          },
        })
      )
    }
    return null
  }
}

/**
 * Safely read the current localStorage length.
 * @returns The number of keys or 0 if localStorage is unavailable
 */
export function safeGetStorageLength(): number {
  try {
    return localStorage.length
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.warn('[localStorage] length read failed:', errorMessage)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('storage-error', {
          detail: {
            operation: 'length',
            key: 'N/A',
            error: errorMessage,
            timestamp: Date.now(),
          },
        })
      )
    }
    return 0
  }
}

/**
 * Safely parse JSON from localStorage
 * @param key - The key to retrieve and parse
 * @returns The parsed object or null if not found, invalid JSON, or error occurs
 */
export function safeGetJSON<T = unknown>(key: string): T | null {
  try {
    const item = localStorage.getItem(key)
    if (item) {
      return JSON.parse(item) as T
    }
  } catch (error: unknown) {
    dispatchStorageError('getJSON', key, error)
  }
  return null
}

/**
 * Safely stringify and store JSON in localStorage
 * @param key - The key to store
 * @param value - The value to stringify and store
 * @returns true if successful, false otherwise
 */
export function safeSetJSON<T = unknown>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error: unknown) {
    dispatchStorageError('setJSON', key, error)
    return false
  }
}
