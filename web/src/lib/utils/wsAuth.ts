/**
 * Append the kc-agent authentication token to a WebSocket URL.
 *
 * Browsers cannot set custom headers on WebSocket handshake requests,
 * so we pass the token as a query parameter instead.
 */
import { STORAGE_KEY_TOKEN } from '../constants'

/** Query-string key used to pass the auth token on WebSocket URLs */
export const WS_AUTH_QUERY_PARAM = 'token'

/**
 * If a session token exists in localStorage, append it to `url` as
 * `?token=<value>` (or `&token=<value>` when other params are present).
 * Returns the original URL unchanged when no token is stored.
 */
export function appendWsAuthToken(url: string): string {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  if (!token) return url

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${WS_AUTH_QUERY_PARAM}=${encodeURIComponent(token)}`
}
