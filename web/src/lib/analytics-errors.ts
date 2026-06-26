import { CHUNK_RELOAD_TS_KEY, isChunkLoadMessage } from './chunkErrors'
import { isDemoMode, isNetlifyDeployment } from './demoMode'
import type { CapturedApiCall, CapturedError, EmitErrorExtra } from './analytics-types'
import { send } from './analytics-dispatch'
import { initialized, setPendingRecoveryEvent, userHasInteracted } from './analytics-core-state'

const ERROR_DETAIL_MAX_LEN = 100
const COMPONENT_NAME_MAX_LEN = 60
const ERROR_TYPE_MAX_LEN = 40
const ERROR_TYPE_UNKNOWN = 'Unknown'
const COMPONENT_NAME_UNKNOWN = 'unknown'
const ERROR_NAME_PREFIX_RE = /^([A-Z][A-Za-z0-9]*Error):/
const NETWORK_ERROR_FRAGMENTS = [
  'Failed to fetch',
  'NetworkError',
  'net::ERR_',
  'Load failed',
] as const
const REACT_COMPONENT_FRAME_RE = /\n\s*in\s+([A-Za-z0-9_$.]+)/
const STACK_FILE_BASENAME_RE = /\/([A-Za-z0-9_-]+)\.(?:tsx?|jsx?|mjs)[:?]/
const DEDUP_EXPIRY_MS = 5_000
const ERROR_RING_BUFFER_SIZE = 50
const API_ERROR_RING_BUFFER_SIZE = 20
const ERROR_EVENT_MAX_PER_WINDOW = 10
const ERROR_EVENT_WINDOW_MS = 5 * 60 * 1000
const ERROR_THROTTLE_MS = 300_000
const MAX_ERRORS_PER_PAGE_SESSION = 50
const HTTP_ERROR_THROTTLE_MS = 300_000
const GLOBAL_RELOAD_THROTTLE_MS = 5_000
const STRICT_CHUNK_INDICATORS = [
  'dynamically imported module',
  'Loading chunk',
  'Loading CSS chunk',
  'Unable to preload CSS',
  'is not a valid JavaScript MIME type',
  'Importing a module script failed',
  'chunk may be stale',
] as const
const BARE_NETWORK_NOISE_SUBSTRINGS = [
  'Failed to fetch',
  'NetworkError',
  'net::ERR_',
  'Index fetch failed',
] as const

const recentlyReportedErrors = new Map<string, number>()
const capturedErrors: CapturedError[] = []
const capturedApiCalls: CapturedApiCall[] = []
const globalErrorEventTimestamps: { ksc_error: number[]; ksc_http_error: number[] } = {
  ksc_error: [],
  ksc_http_error: [],
}
const recentErrorEmissions = new Map<string, number>()
const pageErrorCounts = new Map<string, number>()
const recentHttpErrorEmissions = new Map<string, number>()

let consoleRestoreCleanup: (() => void) | null = null
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null
let errorHandler: ((event: ErrorEvent) => void) | null = null

function inferErrorType(detail: string, error?: unknown): string {
  if (error && typeof error === 'object') {
    const name = (error as { name?: unknown }).name
    if (typeof name === 'string' && name.length > 0 && name !== 'Error') {
      return name.slice(0, ERROR_TYPE_MAX_LEN)
    }
  }
  const match = detail.match(ERROR_NAME_PREFIX_RE)
  if (match) return match[1].slice(0, ERROR_TYPE_MAX_LEN)
  for (const fragment of NETWORK_ERROR_FRAGMENTS) {
    if (detail.includes(fragment)) return 'NetworkError'
  }
  return ERROR_TYPE_UNKNOWN
}

function inferComponentName(
  cardId?: string,
  componentStack?: string,
  error?: unknown,
  pathname?: string,
): string {
  if (cardId && cardId.length > 0) {
    return cardId.slice(0, COMPONENT_NAME_MAX_LEN)
  }
  if (typeof componentStack === 'string') {
    const match = componentStack.match(REACT_COMPONENT_FRAME_RE)
    if (match) return match[1].slice(0, COMPONENT_NAME_MAX_LEN)
  }
  const stack = (error && typeof error === 'object')
    ? (error as { stack?: unknown }).stack
    : undefined
  if (typeof stack === 'string') {
    const match = stack.match(STACK_FILE_BASENAME_RE)
    if (match) return match[1].slice(0, COMPONENT_NAME_MAX_LEN)
  }
  if (typeof pathname === 'string' && pathname.length > 0) {
    const segment = pathname === '/' ? 'dashboard' : pathname.split('/').filter(Boolean)[0]
    if (segment && segment.length > 0) {
      return segment.slice(0, COMPONENT_NAME_MAX_LEN)
    }
  }
  return COMPONENT_NAME_UNKNOWN
}

export function markErrorReported(msg: string) {
  recentlyReportedErrors.set(msg.slice(0, ERROR_DETAIL_MAX_LEN), Date.now())
}

function wasAlreadyReported(msg: string): boolean {
  const key = msg.slice(0, ERROR_DETAIL_MAX_LEN)
  const timestamp = recentlyReportedErrors.get(key)
  if (!timestamp) return false
  if (Date.now() - timestamp > DEDUP_EXPIRY_MS) {
    recentlyReportedErrors.delete(key)
    return false
  }
  return true
}

function isBrowserExtensionNoise(msg: string, reason: unknown): boolean {
  if (
    msg.includes('MetaMask') ||
    msg.includes('ethereum') ||
    msg.includes('web3') ||
    msg.includes('evmAsk') ||
    msg.includes('solana') ||
    msg.includes('Could not establish connection. Receiving end does not exist')
  ) return true
  const stack = (reason as { stack?: string } | null)?.stack
  if (typeof stack === 'string' && (
    stack.includes('chrome-extension://') ||
    stack.includes('moz-extension://') ||
    stack.includes('safari-extension://')
  )) return true
  return false
}

function pushCapturedError(level: 'error' | 'warn', message: string, source?: string) {
  const entry: CapturedError = {
    timestamp: new Date().toISOString(),
    level,
    message: message.slice(0, 500),
    ...(source && { source }),
  }
  capturedErrors.push(entry)
  if (capturedErrors.length > ERROR_RING_BUFFER_SIZE) {
    capturedErrors.shift()
  }
}

export function getRecentBrowserErrors(): CapturedError[] {
  return [...capturedErrors]
}

export function _resetCapturedErrors() {
  capturedErrors.length = 0
}

function pushCapturedApiCall(status: number | string, endpoint: string, detail?: string) {
  const entry: CapturedApiCall = {
    timestamp: new Date().toISOString(),
    status,
    endpoint,
    ...(detail && { detail: detail.slice(0, 500) }),
  }
  capturedApiCalls.push(entry)
  if (capturedApiCalls.length > API_ERROR_RING_BUFFER_SIZE) {
    capturedApiCalls.shift()
  }
}

export function getRecentFailedApiCalls(): CapturedApiCall[] {
  return [...capturedApiCalls]
}

export function _resetCapturedApiCalls() {
  capturedApiCalls.length = 0
}

function isGlobalRateLimited(eventName: 'ksc_error' | 'ksc_http_error'): boolean {
  const now = Date.now()
  const timestamps = globalErrorEventTimestamps[eventName]
  while (timestamps.length > 0 && now - timestamps[0] > ERROR_EVENT_WINDOW_MS) {
    timestamps.shift()
  }
  if (timestamps.length >= ERROR_EVENT_MAX_PER_WINDOW) return true
  timestamps.push(now)
  return false
}

function isHttpErrorThrottled(httpStatus: string, page: string): boolean {
  const key = `${page}:${httpStatus}`
  const lastEmit = recentHttpErrorEmissions.get(key)
  if (lastEmit && Date.now() - lastEmit < HTTP_ERROR_THROTTLE_MS) return true
  if (initialized && userHasInteracted) {
    recentHttpErrorEmissions.set(key, Date.now())
  }
  if (recentHttpErrorEmissions.size > 100) {
    const now = Date.now()
    for (const [mapKey, timestamp] of recentHttpErrorEmissions) {
      if (now - timestamp > HTTP_ERROR_THROTTLE_MS) recentHttpErrorEmissions.delete(mapKey)
    }
  }
  return false
}

export function _resetErrorThrottles() {
  recentErrorEmissions.clear()
  pageErrorCounts.clear()
  recentHttpErrorEmissions.clear()
  globalErrorEventTimestamps.ksc_error = []
  globalErrorEventTimestamps.ksc_http_error = []
}

export function resetAnalyticsErrorState() {
  _resetErrorThrottles()
  _resetCapturedErrors()
  _resetCapturedApiCalls()
}

export function emitHttpError(httpStatus: string, errorDetail: string) {
  const page = window.location.pathname
  pushCapturedApiCall(httpStatus, page, errorDetail)

  if (isDemoMode()) {
    return
  }

  if (httpStatus === 'timeout' || errorDetail.includes('AbortError') || errorDetail.includes('aborted')) {
    return
  }

  if (httpStatus === 'auth' || httpStatus === '401' || httpStatus === '403') {
    return
  }

  if (!isHttpErrorThrottled(httpStatus, page) && !isGlobalRateLimited('ksc_http_error')) {
    send('ksc_http_error', {
      http_status: httpStatus,
      error_detail: errorDetail.slice(0, ERROR_DETAIL_MAX_LEN),
      error_page: page,
    })
  }
}

function isErrorThrottled(category: string, page: string, cardId?: string): boolean {
  const pageCount = pageErrorCounts.get(page) ?? 0
  if (pageCount >= MAX_ERRORS_PER_PAGE_SESSION) return true

  const throttleKey = `${page}:${category}:${cardId ?? '_global'}`
  const lastEmit = recentErrorEmissions.get(throttleKey)
  if (lastEmit && Date.now() - lastEmit < ERROR_THROTTLE_MS) return true

  recentErrorEmissions.set(throttleKey, Date.now())
  pageErrorCounts.set(page, pageCount + 1)

  if (recentErrorEmissions.size > 200) {
    const now = Date.now()
    for (const [key, timestamp] of recentErrorEmissions) {
      if (now - timestamp > ERROR_THROTTLE_MS) recentErrorEmissions.delete(key)
    }
  }
  return false
}

export function emitError(
  category: string,
  detail: string,
  cardId?: string,
  extra?: EmitErrorExtra,
) {
  const page = window.location.pathname
  if (isErrorThrottled(category, page, cardId)) return
  if (isGlobalRateLimited('ksc_error')) return

  const errorType = inferErrorType(detail, extra?.error)
  const componentName = inferComponentName(cardId, extra?.componentStack, extra?.error, extra?.pathname)
  send('ksc_error', {
    error_code: category,
    error_category: category,
    error_detail: detail.slice(0, ERROR_DETAIL_MAX_LEN),
    error_page: page,
    error_type: errorType,
    component_name: componentName,
    ...(cardId && { card_id: cardId }),
    ...(cardId && { card_type: cardId }),
  })
}

export function emitChunkReloadRecoveryFailed(errorDetail: string) {
  send('ksc_chunk_reload_recovery', {
    recovery_result: 'failed',
    recovery_page: window.location.pathname,
    error_detail: errorDetail.slice(0, ERROR_DETAIL_MAX_LEN),
  })
}

function checkChunkReloadRecovery() {
  try {
    const reloadTs = sessionStorage.getItem(CHUNK_RELOAD_TS_KEY)
    if (!reloadTs) return

    const recoveryMs = Date.now() - parseInt(reloadTs)
    sessionStorage.removeItem(CHUNK_RELOAD_TS_KEY)

    setPendingRecoveryEvent({
      latencyMs: recoveryMs,
      page: window.location.pathname,
    })
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

function isBareNetworkNoise(msg: string): boolean {
  if (!BARE_NETWORK_NOISE_SUBSTRINGS.some(substring => msg.includes(substring))) return false
  return !STRICT_CHUNK_INDICATORS.some(substring => msg.includes(substring))
}

function tryChunkReloadRecovery(msg: string): boolean {
  if (!isChunkLoadMessage(msg)) return false
  if (!wasAlreadyReported(msg)) {
    emitError('chunk_load', msg)
  }
  try {
    const lastReload = sessionStorage.getItem(CHUNK_RELOAD_TS_KEY)
    const now = Date.now()
    if (!lastReload || now - parseInt(lastReload) > GLOBAL_RELOAD_THROTTLE_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_TS_KEY, String(now))
      window.location.reload()
      return true
    }
    sessionStorage.removeItem(CHUNK_RELOAD_TS_KEY)
    emitChunkReloadRecoveryFailed(msg)
  } catch {
    // sessionStorage unavailable — chunk_load was already emitted above
  }
  return true
}

export function startGlobalErrorTracking() {
  checkChunkReloadRecovery()

  if (rejectionHandler) {
    window.removeEventListener('unhandledrejection', rejectionHandler)
  }
  if (errorHandler) {
    window.removeEventListener('error', errorHandler)
  }
  if (consoleRestoreCleanup) {
    consoleRestoreCleanup()
  }

  let isEmitting = false

  rejectionHandler = (event: PromiseRejectionEvent) => {
    if (isEmitting) return
    isEmitting = true
    try {
      const msg = event.reason?.message || String(event.reason || 'unknown')
      if (wasAlreadyReported(msg)) return
      if (msg.includes('writeText') || msg.includes('clipboard') || msg.includes('copy')) return
      if (isBrowserExtensionNoise(msg, event.reason)) return
      if (isBareNetworkNoise(msg)) return
      if (tryChunkReloadRecovery(msg)) return
      const errorName: string = (event.reason as { name?: string })?.name ?? ''
      if (errorName === 'AbortError' || errorName === 'TimeoutError') return
      if (
        msg.includes('Fetch is aborted') ||
        msg.includes('The user aborted a request') ||
        msg.includes('signal is aborted') ||
        msg.includes('The operation timed out') ||
        msg.includes('signal timed out') ||
        msg.includes('Load failed')
      ) return
      if (msg.includes('did not match the expected pattern')) return
      if (
        msg.includes('JSON.parse') ||
        msg.includes('is not valid JSON') ||
        msg.includes('JSON Parse error') ||
        msg.includes('Unexpected token') ||
        msg.includes('Unexpected end of JSON') ||
        errorName === 'SyntaxError'
      ) return
      if (msg.includes('showNotification') || msg.includes('No active registration')) return
      if (msg.includes('send was called before connect') || msg.includes('InvalidStateError')) return
      if (isNetlifyDeployment && msg.includes('Backend API is currently unavailable')) return
      if (msg.includes('WebGL') || msg.includes('context lost')) return
      if (errorName === 'UnauthenticatedError' || errorName === 'UnauthorizedError') {
        pushCapturedError('error', msg, 'auth_error')
        if (!isDemoMode()) {
          emitHttpError('auth', msg)
        }
        return
      }
      if (msg.includes('No authentication token') || msg.includes('Token is invalid or expired')) {
        pushCapturedError('error', msg, 'auth_error')
        if (!isDemoMode()) {
          emitHttpError('auth', msg)
        }
        return
      }
      if (/\b50[234]\b/.test(msg) && (msg.includes('fetch') || msg.includes('Fetch') || msg.includes('upstream'))) {
        const statusMatch = msg.match(/\b(50[234])\b/)
        const httpStatus = statusMatch?.[1] ?? '5xx'
        pushCapturedError('error', msg, `http_${httpStatus}`)
        emitHttpError(httpStatus, msg)
        return
      }
      pushCapturedError('error', msg, 'unhandled_rejection')
      emitError('unhandled_rejection', msg, undefined, { error: event.reason })
    } finally {
      isEmitting = false
    }
  }
  window.addEventListener('unhandledrejection', rejectionHandler)

  errorHandler = (event: ErrorEvent) => {
    if (!event.message || event.message === 'Script error.') return
    if (isEmitting) return
    isEmitting = true
    try {
      if (wasAlreadyReported(event.message)) return
      if (event.message.includes('writeText') || event.message.includes('clipboard') || event.message.includes('copy')) return
      if (isBrowserExtensionNoise(event.message, event.error)) return
      if (typeof event.filename === 'string' && (
        event.filename.startsWith('chrome-extension://') ||
        event.filename.startsWith('moz-extension://') ||
        event.filename.startsWith('safari-extension://')
      )) return
      if (event.message.includes('ResizeObserver loop')) return
      if (
        event.message.includes('WebGL') ||
        event.message.includes('context lost') ||
        event.message.includes('GL_INVALID')
      ) return
      if (event.message.includes('canvas') || event.message.includes('CanvasRenderingContext')) return
      if (
        event.message.includes('Failed to fetch') ||
        event.message.includes('NetworkError') ||
        event.message.includes('net::ERR_')
      ) return
      if (event.message.includes('Non-Error')) return
      if (tryChunkReloadRecovery(event.message)) return
      if (event.error?.name === 'UnauthenticatedError' || event.error?.name === 'UnauthorizedError') {
        pushCapturedError('error', event.message, 'auth_error')
        if (!isDemoMode()) {
          emitHttpError('auth', event.message)
        }
        return
      }
      if (event.message.includes('No authentication token') || event.message.includes('Token is invalid or expired')) {
        pushCapturedError('error', event.message, 'auth_error')
        if (!isDemoMode()) {
          emitHttpError('auth', event.message)
        }
        return
      }
      pushCapturedError('error', event.message, 'runtime')
      emitError('runtime', event.message, undefined, {
        error: event.error,
        pathname: window.location.pathname,
      })
    } finally {
      isEmitting = false
    }
  }
  window.addEventListener('error', errorHandler)

  const originalConsoleError = console.error
  const originalConsoleWarn = console.warn
  console.error = (...args: unknown[]) => {
    const msg = args.map(arg => (typeof arg === 'string' ? arg : String(arg))).join(' ')
    if (!isBrowserExtensionNoise(msg, null)) {
      pushCapturedError('error', msg, 'console.error')
    }
    originalConsoleError.apply(console, args)
  }
  console.warn = (...args: unknown[]) => {
    const msg = args.map(arg => (typeof arg === 'string' ? arg : String(arg))).join(' ')
    pushCapturedError('warn', msg, 'console.warn')
    originalConsoleWarn.apply(console, args)
  }

  consoleRestoreCleanup = () => {
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
  }
}

export function stopGlobalErrorTracking() {
  if (rejectionHandler) {
    window.removeEventListener('unhandledrejection', rejectionHandler)
    rejectionHandler = null
  }
  if (errorHandler) {
    window.removeEventListener('error', errorHandler)
    errorHandler = null
  }
  if (consoleRestoreCleanup) {
    consoleRestoreCleanup()
    consoleRestoreCleanup = null
  }
}

export const __testables = {
  inferErrorType,
  inferComponentName,
  isBrowserExtensionNoise,
  isBareNetworkNoise,
  isErrorThrottled,
  markErrorReported,
  wasAlreadyReported,
  restoreConsole: () => consoleRestoreCleanup?.(),
}
