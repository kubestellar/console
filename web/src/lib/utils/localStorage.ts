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
 * Safely get an item from localStorage
 * @param key - The key to retrieve
 * @returns The stored value or null if not found or error occurs
 */
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (error: unknown) {
    // localStorage may throw in private browsing mode or when disabled
    console.error('Failed to read from localStorage:', sanitizeKeyForLog(key), error)
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
    console.error('Failed to write to localStorage:', sanitizeKeyForLog(key), error)
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
    console.error('Failed to remove from localStorage:', sanitizeKeyForLog(key), error)
    return false
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
    console.error('Failed to read/parse JSON from localStorage:', sanitizeKeyForLog(key), error)
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
    console.error('Failed to write JSON to localStorage:', sanitizeKeyForLog(key), error)
    return false
  }
}
