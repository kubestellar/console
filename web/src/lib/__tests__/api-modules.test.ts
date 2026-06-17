import { describe, expect, it } from 'vitest'

import {
  BackendUnavailableError as BarrelBackendUnavailableError,
  RateLimitError as BarrelRateLimitError,
  UnauthenticatedError as BarrelUnauthenticatedError,
  UnauthorizedError as BarrelUnauthorizedError,
  checkBackendAvailability as barrelCheckBackendAvailability,
  checkOAuthConfigured as barrelCheckOAuthConfigured,
  checkOAuthConfiguredWithRetry as barrelCheckOAuthConfiguredWithRetry,
  isBackendUnavailable as barrelIsBackendUnavailable,
} from '../api'
import {
  BackendUnavailableError,
  RateLimitError,
  UnauthenticatedError,
  UnauthorizedError,
} from '../apiErrors'
import {
  checkBackendAvailability,
  checkOAuthConfigured,
  checkOAuthConfiguredWithRetry,
  isBackendUnavailable,
} from '../apiBackendCheck'

describe('api module split barrel exports', () => {
  it('re-exports error classes from apiErrors', () => {
    expect(BarrelUnauthenticatedError).toBe(UnauthenticatedError)
    expect(BarrelUnauthorizedError).toBe(UnauthorizedError)
    expect(BarrelRateLimitError).toBe(RateLimitError)
    expect(BarrelBackendUnavailableError).toBe(BackendUnavailableError)
  })

  it('re-exports backend check helpers from apiBackendCheck', () => {
    expect(barrelCheckBackendAvailability).toBe(checkBackendAvailability)
    expect(barrelCheckOAuthConfigured).toBe(checkOAuthConfigured)
    expect(barrelCheckOAuthConfiguredWithRetry).toBe(checkOAuthConfiguredWithRetry)
    expect(barrelIsBackendUnavailable).toBe(isBackendUnavailable)
  })
})
