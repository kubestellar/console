import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  api,
  checkBackendAvailability,
  checkOAuthConfigured,
  checkOAuthConfiguredWithRetry,
  isBackendUnavailable,
  UnauthenticatedError,
  UnauthorizedError,
  RateLimitError,
  BackendUnavailableError,
} from './api'
import {
  getStoredAuthToken,
} from './authToken'
