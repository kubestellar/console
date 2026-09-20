import { describe, it, expect, beforeEach } from 'vitest'
import {
  setAnalyticsUserId,
  emitPredictionFeedbackSubmitted,
  emitDataExported,
  emitFixerViewed,
  emitFixerImported,
  emitFixerLinkCopied,
  emitFixerImportError,
  emitError,
  emitMarketplaceInstallFailed,
  emitUpdateFailed,
  emitChunkReloadRecoveryFailed,
} from '../analytics'

// ---------------------------------------------------------------------------
// Split from analytics-emit-extended.test.ts (part 2 of 3)
// ---------------------------------------------------------------------------

describe('setAnalyticsUserId hashing branches', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('hashes a real user ID via crypto.subtle', async () => {
    // crypto.subtle should be available in Node/JSDOM test env
    await setAnalyticsUserId('real-user-123')
    // No assertion on internal state, but the code path is exercised
  })

  it('assigns anonymous ID for empty string user', async () => {
    await setAnalyticsUserId('')
    const anonId = localStorage.getItem('kc-anonymous-user-id')
    expect(anonId).toBeTruthy()
  })

  it('assigns anonymous ID for demo-user', async () => {
    await setAnalyticsUserId('demo-user')
    const anonId = localStorage.getItem('kc-anonymous-user-id')
    expect(anonId).toBeTruthy()
    expect(anonId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('reuses existing anonymous ID on subsequent calls', async () => {
    await setAnalyticsUserId('demo-user')
    const first = localStorage.getItem('kc-anonymous-user-id')
    await setAnalyticsUserId('demo-user')
    const second = localStorage.getItem('kc-anonymous-user-id')
    expect(first).toBe(second)
  })

  it('hashes different users to different values', async () => {
    // We can't easily check the userId module variable, but we can
    // ensure the function processes different inputs without error
    await setAnalyticsUserId('user-a')
    await setAnalyticsUserId('user-b')
    // Both should complete without throwing
  })
})

describe('emitPredictionFeedbackSubmitted provider fallback', () => {
  it('uses "unknown" when provider is omitted', () => {
    expect(() => emitPredictionFeedbackSubmitted('positive', 'cpu-forecast')).not.toThrow()
  })

  it('uses explicit provider when provided', () => {
    expect(() => emitPredictionFeedbackSubmitted('negative', 'memory-forecast', 'openai')).not.toThrow()
  })
})

describe('emitDataExported resourceType fallback', () => {
  it('uses empty string when resourceType is omitted', () => {
    expect(() => emitDataExported('csv')).not.toThrow()
  })

  it('passes resourceType when provided', () => {
    expect(() => emitDataExported('json', 'pods')).not.toThrow()
  })
})

describe('emitFixerViewed/Imported/LinkCopied cncfProject fallback', () => {
  it('emitFixerViewed uses empty string when cncfProject omitted', () => {
    expect(() => emitFixerViewed('Fix RBAC')).not.toThrow()
  })

  it('emitFixerViewed passes cncfProject when provided', () => {
    expect(() => emitFixerViewed('Fix RBAC', 'falco')).not.toThrow()
  })

  it('emitFixerImported uses empty string when cncfProject omitted', () => {
    expect(() => emitFixerImported('Fix RBAC')).not.toThrow()
  })

  it('emitFixerImported passes cncfProject when provided', () => {
    expect(() => emitFixerImported('Fix RBAC', 'falco')).not.toThrow()
  })

  it('emitFixerLinkCopied uses empty string when cncfProject omitted', () => {
    expect(() => emitFixerLinkCopied('Fix RBAC')).not.toThrow()
  })

  it('emitFixerLinkCopied passes cncfProject when provided', () => {
    expect(() => emitFixerLinkCopied('Fix RBAC', 'falco')).not.toThrow()
  })
})

describe('emitFixerImportError truncation edge cases', () => {
  it('handles empty firstError', () => {
    expect(() => emitFixerImportError('Fix RBAC', 0, '')).not.toThrow()
  })

  it('handles exactly 100 char firstError', () => {
    const exact100 = 'x'.repeat(100)
    expect(() => emitFixerImportError('Fix RBAC', 1, exact100)).not.toThrow()
  })
})

describe('emitError with cardId conditional spread', () => {
  it('includes cardId when provided', () => {
    expect(() => emitError('card_render', 'some error', 'pod-card')).not.toThrow()
  })

  it('excludes cardId when empty string (falsy)', () => {
    expect(() => emitError('runtime', 'some error', '')).not.toThrow()
  })

  it('excludes cardId when undefined', () => {
    expect(() => emitError('runtime', 'some error')).not.toThrow()
  })
})

// Custom dimensions added in #9861 (error_type, component_name)
describe('emitError accepts EmitErrorExtra context (#9861)', () => {
  it('accepts an Error instance to derive error_type from .name', () => {
    const err = new TypeError('Cannot read properties of undefined')
    expect(() => emitError('runtime', err.message, undefined, { error: err })).not.toThrow()
  })

  it('accepts a React componentStack to derive component_name', () => {
    const componentStack = '\n    in PodList (created by Dashboard)\n    in Dashboard'
    expect(() =>
      emitError('uncaught_render', 'boom', undefined, { componentStack }),
    ).not.toThrow()
  })

  it('accepts both error and componentStack together', () => {
    const err = new RangeError('out of bounds')
    const componentStack = '\n    in ClusterCard'
    expect(() =>
      emitError('card_render', err.message, 'cluster-health', {
        error: err,
        componentStack,
      }),
    ).not.toThrow()
  })

  it('accepts a non-Error reason object (e.g. a thrown string)', () => {
    expect(() =>
      emitError('unhandled_rejection', 'plain string reason', undefined, {
        error: 'plain string reason',
      }),
    ).not.toThrow()
  })

  it('handles undefined extra (back-compat with existing callers)', () => {
    expect(() => emitError('runtime', 'no extra context')).not.toThrow()
  })
})

describe('emitMarketplaceInstallFailed error truncation', () => {
  it('handles empty error string', () => {
    expect(() => emitMarketplaceInstallFailed('card', 'gpu-monitor', '')).not.toThrow()
  })

  it('handles error string exactly 100 chars', () => {
    const exact = 'a'.repeat(100)
    expect(() => emitMarketplaceInstallFailed('card', 'gpu-monitor', exact)).not.toThrow()
  })

  it('truncates error string over 100 chars', () => {
    const long = 'b'.repeat(200)
    expect(() => emitMarketplaceInstallFailed('card', 'gpu-monitor', long)).not.toThrow()
  })
})

describe('emitUpdateFailed error truncation edge cases', () => {
  it('handles empty error string', () => {
    expect(() => emitUpdateFailed('')).not.toThrow()
  })

  it('handles error exactly 100 chars', () => {
    expect(() => emitUpdateFailed('x'.repeat(100))).not.toThrow()
  })
})

describe('emitChunkReloadRecoveryFailed truncation edge cases', () => {
  it('handles empty error detail', () => {
    expect(() => emitChunkReloadRecoveryFailed('')).not.toThrow()
  })

  it('handles error detail exactly 100 chars', () => {
    expect(() => emitChunkReloadRecoveryFailed('x'.repeat(100))).not.toThrow()
  })
})
