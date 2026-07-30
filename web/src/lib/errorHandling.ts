/**
 * Unified error handling utilities for consistent error classification
 * across API, agent, and MCP flows.
 *
 * This module provides:
 * - A canonical error type enum covering all flow-level failure modes
 * - A classification function that maps raw errors to typed categories
 * - User-friendly message mapping for each error category
 * - HTTP status code mapping
 *
 * Consumers: API hooks, agent hooks, MCP queries, error boundaries.
 */

import { classifyError, type ClusterErrorType } from './errorClassifier'
import { friendlyErrorMessage } from './clusterErrors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Canonical error categories across all flows */
export type ApiErrorCategory =
  | 'network'
  | 'auth'
  | 'timeout'
  | 'service_unavailable'
  | 'not_found'
  | 'rate_limited'
  | 'certificate'
  | 'unknown'

export interface ClassifiedApiError {
  category: ApiErrorCategory
  message: string
  userMessage: string
  retryable: boolean
}

// ---------------------------------------------------------------------------
// HTTP status → category
// ---------------------------------------------------------------------------

const HTTP_STATUS_CATEGORY: Record<number, ApiErrorCategory> = {
  401: 'auth',
  403: 'auth',
  404: 'not_found',
  408: 'timeout',
  429: 'rate_limited',
  502: 'service_unavailable',
  503: 'service_unavailable',
  504: 'timeout',
}

// ---------------------------------------------------------------------------
// User-friendly messages per category
// ---------------------------------------------------------------------------

const USER_MESSAGES: Record<ApiErrorCategory, string> = {
  network: 'Unable to reach the server. Check your network connection.',
  auth: 'Authentication failed. Please sign in again.',
  timeout: 'The request timed out. Please try again.',
  service_unavailable: 'The service is temporarily unavailable. Please try again later.',
  not_found: 'The requested resource was not found.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  certificate: 'Certificate verification failed. Check your TLS configuration.',
  unknown: 'An unexpected error occurred. Please try again.',
}

// ---------------------------------------------------------------------------
// Retryability
// ---------------------------------------------------------------------------

const RETRYABLE_CATEGORIES: ReadonlySet<ApiErrorCategory> = new Set([
  'network',
  'timeout',
  'service_unavailable',
  'rate_limited',
])

// ---------------------------------------------------------------------------
// Bridge: ClusterErrorType → ApiErrorCategory
// ---------------------------------------------------------------------------

function clusterErrorToCategory(clusterType: ClusterErrorType): ApiErrorCategory {
  const mapping: Record<ClusterErrorType, ApiErrorCategory> = {
    timeout: 'timeout',
    auth: 'auth',
    network: 'network',
    certificate: 'certificate',
    unknown: 'unknown',
  }
  return mapping[clusterType]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify an HTTP status code into an {@link ApiErrorCategory}.
 */
export function classifyHttpStatus(status: number): ApiErrorCategory {
  return HTTP_STATUS_CATEGORY[status] ?? 'unknown'
}

/**
 * Classify a raw error (string, Error object, or HTTP status) into a
 * consistent {@link ClassifiedApiError}.
 *
 * This is the single entry point for all error classification across flows.
 */
export function classifyApiError(
  error: string | Error | number,
): ClassifiedApiError {
  // HTTP status code path
  if (typeof error === 'number') {
    const category = classifyHttpStatus(error)
    return {
      category,
      message: `HTTP ${error}`,
      userMessage: USER_MESSAGES[category],
      retryable: RETRYABLE_CATEGORIES.has(category),
    }
  }

  const rawMessage = error instanceof Error ? error.message : error

  // Special-case: fetch-level network failures (no HTTP status)
  if (isFetchNetworkError(rawMessage)) {
    return {
      category: 'network',
      message: rawMessage,
      userMessage: USER_MESSAGES.network,
      retryable: true,
    }
  }

  // Special-case: service unavailable patterns
  if (isServiceUnavailableError(rawMessage)) {
    return {
      category: 'service_unavailable',
      message: rawMessage,
      userMessage: USER_MESSAGES.service_unavailable,
      retryable: true,
    }
  }

  // Delegate to the cluster-level classifier for pattern matching
  const classified = classifyError(rawMessage)
  const category = clusterErrorToCategory(classified.type)

  // Use friendlyErrorMessage for user-facing text when available
  const friendly = friendlyErrorMessage(rawMessage)
  const userMessage = friendly !== rawMessage ? friendly : USER_MESSAGES[category]

  return {
    category,
    message: classified.message,
    userMessage,
    retryable: RETRYABLE_CATEGORIES.has(category),
  }
}

/**
 * Get the user-friendly message for a given error category.
 */
export function getUserMessage(category: ApiErrorCategory): string {
  return USER_MESSAGES[category]
}

/**
 * Check if an error category is retryable.
 */
export function isRetryable(category: ApiErrorCategory): boolean {
  return RETRYABLE_CATEGORIES.has(category)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFetchNetworkError(message: string): boolean {
  const patterns = [
    /^failed to fetch$/i,
    /^load failed$/i,
    /^networkerror/i,
    /network request failed/i,
    /ERR_NETWORK/i,
    /ERR_INTERNET_DISCONNECTED/i,
    /ERR_NAME_NOT_RESOLVED/i,
    /net::ERR_/i,
  ]
  return patterns.some(p => p.test(message))
}

function isServiceUnavailableError(message: string): boolean {
  const patterns = [
    /503/,
    /service unavailable/i,
    /server is shutting down/i,
    /backend unavailable/i,
    /temporarily unavailable/i,
    /ECONNREFUSED/i,
  ]
  return patterns.some(p => p.test(message))
}
