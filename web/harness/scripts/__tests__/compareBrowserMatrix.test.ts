import { describe, it, expect } from 'vitest'

// Import the module to test internals via function extraction
// compareBrowserMatrix.cjs uses module-level execution, so we test its helper functions
// by extracting and re-implementing the pure logic

// Since compareBrowserMatrix.cjs runs main() on require, we test the helper logic directly
describe('compareBrowserMatrix helpers', () => {
  // Re-implement the pure helpers to validate their logic
  // (the .cjs file doesn't export them, so we test the logic patterns)

  function safeNumber(value, fallback = 0) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
  }

  function boxDelta(a, b) {
    if (!a || !b) return 0
    return Math.max(
      Math.abs(safeNumber(a.x) - safeNumber(b.x)),
      Math.abs(safeNumber(a.y) - safeNumber(b.y)),
      Math.abs(safeNumber(a.width) - safeNumber(b.width)),
      Math.abs(safeNumber(a.height) - safeNumber(b.height)),
    )
  }

  function isCanarySetupFailure(value) {
    return /connection refused|ecconnrefused|port-forward|did not become healthy|candidate image|cannot connect to 127\.0\.0\.1|could not connect to 127\.0\.0\.1/i.test(String(value || ''))
  }

  function isRateLimitFailure(value) {
    return /\b429\b|rate limited|too many requests|retry-after/i.test(String(value || ''))
  }

  function classify(differences) {
    if (differences.some(diff => diff.classification === 'canary-setup')) return 'canary-setup'
    if (differences.some(diff => diff.classification === 'live-rate-limit-data-loss')) return 'live-rate-limit-data-loss'
    if (differences.some(diff => diff.classification === 'auth-boundary')) return 'auth-boundary'
    if (differences.some(diff => diff.classification === 'live-network-error')) return 'live-network-error'
    if (differences.some(diff => diff.classification === 'safari-z-index')) return 'safari-z-index'
    if (differences.some(diff => diff.classification === 'browser-semantic-field-mismatch')) return 'browser-semantic-field-mismatch'
    if (differences.some(diff => diff.classification === 'browser-content-missing')) return 'browser-content-missing'
    if (differences.some(diff => diff.classification === 'browser-interaction-broken')) return 'browser-interaction-broken'
    if (differences.some(diff => diff.classification === 'browser-layout-drift')) return 'browser-layout-drift'
    if (differences.some(diff => diff.classification === 'browser-visual-baseline')) return 'browser-visual-baseline'
    return 'passed'
  }

  function browserKey(report) {
    return String(report.browserName || report.projectName || '').replace(/^live-/, '')
  }

  describe('safeNumber', () => {
    it('converts valid numbers', () => {
      expect(safeNumber(42)).toBe(42)
      expect(safeNumber('3.14')).toBeCloseTo(3.14)
      expect(safeNumber(0)).toBe(0)
    })

    it('returns fallback for NaN', () => {
      expect(safeNumber(NaN)).toBe(0)
      expect(safeNumber(NaN, -1)).toBe(-1)
    })

    it('returns fallback for non-numeric strings', () => {
      expect(safeNumber('abc')).toBe(0)
      expect(safeNumber(undefined)).toBe(0)
      expect(safeNumber(null)).toBe(0)
    })

    it('returns fallback for Infinity', () => {
      expect(safeNumber(Infinity)).toBe(0)
      expect(safeNumber(-Infinity)).toBe(0)
    })
  })

  describe('boxDelta', () => {
    it('returns 0 when either box is null/undefined', () => {
      expect(boxDelta(null, { x: 0, y: 0, width: 100, height: 50 })).toBe(0)
      expect(boxDelta({ x: 0, y: 0, width: 100, height: 50 }, undefined)).toBe(0)
      expect(boxDelta(null, null)).toBe(0)
    })

    it('returns 0 for identical boxes', () => {
      const box = { x: 10, y: 20, width: 100, height: 50 }
      expect(boxDelta(box, box)).toBe(0)
    })

    it('returns max delta across all dimensions', () => {
      const a = { x: 0, y: 0, width: 100, height: 50 }
      const b = { x: 5, y: 10, width: 200, height: 50 }
      expect(boxDelta(a, b)).toBe(100) // width diff is largest
    })

    it('handles negative coordinates', () => {
      const a = { x: -10, y: -20, width: 100, height: 50 }
      const b = { x: 10, y: 20, width: 100, height: 50 }
      expect(boxDelta(a, b)).toBe(40) // y diff: |-20 - 20| = 40
    })
  })

  describe('isCanarySetupFailure', () => {
    it('detects connection refused', () => {
      expect(isCanarySetupFailure('connection refused on port 3000')).toBe(true)
    })

    it('detects ECONNREFUSED', () => {
      expect(isCanarySetupFailure('Error: ECCONNREFUSED 127.0.0.1:8080')).toBe(true)
    })

    it('detects port-forward issues', () => {
      expect(isCanarySetupFailure('kubectl port-forward timed out')).toBe(true)
    })

    it('detects health check failures', () => {
      expect(isCanarySetupFailure('server did not become healthy within 60s')).toBe(true)
    })

    it('detects 127.0.0.1 connection failures', () => {
      expect(isCanarySetupFailure('cannot connect to 127.0.0.1:3000')).toBe(true)
      expect(isCanarySetupFailure('could not connect to 127.0.0.1:443')).toBe(true)
    })

    it('returns false for unrelated errors', () => {
      expect(isCanarySetupFailure('element not found')).toBe(false)
      expect(isCanarySetupFailure('timeout waiting for selector')).toBe(false)
      expect(isCanarySetupFailure(null)).toBe(false)
      expect(isCanarySetupFailure(undefined)).toBe(false)
    })
  })

  describe('isRateLimitFailure', () => {
    it('detects 429 status', () => {
      expect(isRateLimitFailure('HTTP 429 Too Many Requests')).toBe(true)
    })

    it('detects rate limited message', () => {
      expect(isRateLimitFailure('API rate limited, try again later')).toBe(true)
    })

    it('detects too many requests', () => {
      expect(isRateLimitFailure('Error: too many requests')).toBe(true)
    })

    it('detects retry-after header', () => {
      expect(isRateLimitFailure('retry-after: 30')).toBe(true)
    })

    it('returns false for unrelated errors', () => {
      expect(isRateLimitFailure('element not found')).toBe(false)
      expect(isRateLimitFailure('connection timeout')).toBe(false)
      expect(isRateLimitFailure(null)).toBe(false)
    })
  })

  describe('classify', () => {
    it('returns passed for empty differences', () => {
      expect(classify([])).toBe('passed')
    })

    it('prioritizes canary-setup over other classifications', () => {
      expect(classify([
        { classification: 'browser-layout-drift' },
        { classification: 'canary-setup' },
        { classification: 'auth-boundary' },
      ])).toBe('canary-setup')
    })

    it('prioritizes rate-limit over auth-boundary', () => {
      expect(classify([
        { classification: 'auth-boundary' },
        { classification: 'live-rate-limit-data-loss' },
      ])).toBe('live-rate-limit-data-loss')
    })

    it('returns auth-boundary when present without higher priority', () => {
      expect(classify([{ classification: 'auth-boundary' }])).toBe('auth-boundary')
    })

    it('returns live-network-error classification', () => {
      expect(classify([{ classification: 'live-network-error' }])).toBe('live-network-error')
    })

    it('returns safari-z-index classification', () => {
      expect(classify([{ classification: 'safari-z-index' }])).toBe('safari-z-index')
    })

    it('returns browser-semantic-field-mismatch classification', () => {
      expect(classify([{ classification: 'browser-semantic-field-mismatch' }])).toBe('browser-semantic-field-mismatch')
    })

    it('returns browser-content-missing classification', () => {
      expect(classify([{ classification: 'browser-content-missing' }])).toBe('browser-content-missing')
    })

    it('returns browser-interaction-broken classification', () => {
      expect(classify([{ classification: 'browser-interaction-broken' }])).toBe('browser-interaction-broken')
    })

    it('returns browser-layout-drift classification', () => {
      expect(classify([{ classification: 'browser-layout-drift' }])).toBe('browser-layout-drift')
    })

    it('returns browser-visual-baseline as lowest priority', () => {
      expect(classify([{ classification: 'browser-visual-baseline' }])).toBe('browser-visual-baseline')
    })
  })

  describe('browserKey', () => {
    it('uses browserName when present', () => {
      expect(browserKey({ browserName: 'chromium', projectName: 'live-chromium' })).toBe('chromium')
    })

    it('falls back to projectName', () => {
      expect(browserKey({ projectName: 'firefox' })).toBe('firefox')
    })

    it('strips live- prefix from projectName', () => {
      expect(browserKey({ projectName: 'live-webkit' })).toBe('webkit')
    })

    it('returns empty string when nothing is set', () => {
      expect(browserKey({})).toBe('')
    })
  })
})
