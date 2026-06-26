/**
 * Tests for pure helper functions exported via __testables from:
 *   - useDropdownKeyNav.ts  (nextFocusIndex, prevFocusIndex)
 *   - useQASMFiles.ts       (normalizeFileList, extractErrorMessage)
 *
 * No mocking of the functions under test — only the external module
 * dependencies that prevent the host modules from loading are mocked.
 */
import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Module stubs — needed so the host files can be imported, but the pure
// helpers under test never call any of these.
// ---------------------------------------------------------------------------

vi.mock('../../lib/auth', () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: false })),
}))

vi.mock('../../lib/demoMode', () => ({
  isQuantumForcedToDemo: vi.fn(() => false),
  getDemoMode: vi.fn(() => false),
  isDemoMode: vi.fn(() => false),
  isNetlifyDeployment: false,
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

import { __testables as dropdownTestables } from '../useDropdownKeyNav'
import { __testables as qasmTestables } from '../useQASMFiles'

const { nextFocusIndex, prevFocusIndex } = dropdownTestables
const { normalizeFileList, extractErrorMessage } = qasmTestables

// ===========================================================================
// useDropdownKeyNav helpers
// ===========================================================================

// ---------------------------------------------------------------------------
// nextFocusIndex — clamps idx+1 within [0, total-1]
// ---------------------------------------------------------------------------

describe('nextFocusIndex', () => {
  it('advances from the first item to the second', () => {
    expect(nextFocusIndex(0, 3)).toBe(1)
  })

  it('advances from the middle of the list', () => {
    expect(nextFocusIndex(1, 3)).toBe(2)
  })

  it('clamps at the last item when already there', () => {
    expect(nextFocusIndex(2, 3)).toBe(2)
  })

  it('clamps when already past the last item', () => {
    expect(nextFocusIndex(4, 5)).toBe(4)
  })

  it('wraps a not-found idx (-1) to the first item', () => {
    // indexOf returns -1 when the focused element is not in the list
    expect(nextFocusIndex(-1, 3)).toBe(0)
  })

  it('stays at 0 for a single-item list', () => {
    expect(nextFocusIndex(0, 1)).toBe(0)
  })

  it('clamps an out-of-range idx that exceeds total', () => {
    expect(nextFocusIndex(10, 3)).toBe(2)
  })

  it('advances correctly in a larger list', () => {
    expect(nextFocusIndex(5, 10)).toBe(6)
  })

  it('returns -1 for an empty list (total=0) — no items to navigate', () => {
    // Math.min(0+1, 0-1) = Math.min(1,-1) = -1; caller must guard on empty list
    expect(nextFocusIndex(0, 0)).toBe(-1)
  })

  it('advances from second-to-last item to last', () => {
    expect(nextFocusIndex(8, 10)).toBe(9)
  })
})

// ---------------------------------------------------------------------------
// prevFocusIndex — clamps idx-1 within [0, ∞)
// ---------------------------------------------------------------------------

describe('prevFocusIndex', () => {
  it('moves backward from the last item', () => {
    expect(prevFocusIndex(2)).toBe(1)
  })

  it('moves backward from the second item to the first', () => {
    expect(prevFocusIndex(1)).toBe(0)
  })

  it('clamps at 0 when already at the first item', () => {
    expect(prevFocusIndex(0)).toBe(0)
  })

  it('clamps a not-found idx (-1) to 0 — no item below first', () => {
    expect(prevFocusIndex(-1)).toBe(0)
  })

  it('handles large positive indices correctly', () => {
    expect(prevFocusIndex(10)).toBe(9)
  })

  it('clamps large negative indices to 0', () => {
    expect(prevFocusIndex(-5)).toBe(0)
  })

  it('moves backward in the middle of a list', () => {
    expect(prevFocusIndex(5)).toBe(4)
  })

  it('moves backward from an arbitrary large index', () => {
    expect(prevFocusIndex(100)).toBe(99)
  })

  it('clamps -2 to 0', () => {
    expect(prevFocusIndex(-2)).toBe(0)
  })

  it('produces 0 for idx=1 regardless of list length', () => {
    expect(prevFocusIndex(1)).toBe(0)
  })
})

// ===========================================================================
// useQASMFiles helpers
// ===========================================================================

// ---------------------------------------------------------------------------
// normalizeFileList — converts raw API payload to QASMFile[]
// ---------------------------------------------------------------------------

describe('normalizeFileList', () => {
  it('returns an array input unchanged', () => {
    const input = [{ name: 'algo.qasm', size: 512 }]
    expect(normalizeFileList(input)).toEqual(input)
  })

  it('returns an empty array for an empty array input', () => {
    expect(normalizeFileList([])).toEqual([])
  })

  it('extracts data.files when the response is wrapped in an object', () => {
    const files = [{ name: 'grover.qasm' }]
    expect(normalizeFileList({ files })).toEqual(files)
  })

  it('returns empty array when data.files is null', () => {
    expect(normalizeFileList({ files: null })).toEqual([])
  })

  it('returns empty array when data.files is undefined', () => {
    expect(normalizeFileList({ files: undefined })).toEqual([])
  })

  it('returns empty array when data.files is a non-array value', () => {
    expect(normalizeFileList({ files: 'not-an-array' })).toEqual([])
  })

  it('returns empty array for null input', () => {
    expect(normalizeFileList(null)).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    expect(normalizeFileList(undefined)).toEqual([])
  })

  it('returns empty array for a plain object with no files property', () => {
    expect(normalizeFileList({ count: 3 })).toEqual([])
  })

  it('returns empty array for a primitive string', () => {
    expect(normalizeFileList('algo.qasm')).toEqual([])
  })

  it('preserves the optional size field on QASMFile entries', () => {
    const files = [{ name: 'shor.qasm', size: 2048 }, { name: 'bell.qasm' }]
    expect(normalizeFileList(files)).toEqual(files)
  })

  it('handles an object whose files property is an empty array', () => {
    expect(normalizeFileList({ files: [] })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// extractErrorMessage — extracts a human-readable string from a thrown value
// ---------------------------------------------------------------------------

describe('extractErrorMessage', () => {
  it('returns the message from a native Error instance', () => {
    const err = new Error('quantum decoherence detected')
    expect(extractErrorMessage(err)).toBe('quantum decoherence detected')
  })

  it('returns the full message without truncation', () => {
    const msg = 'a'.repeat(500)
    expect(extractErrorMessage(new Error(msg))).toBe(msg)
  })

  it('returns empty string for an Error with an empty message', () => {
    expect(extractErrorMessage(new Error(''))).toBe('')
  })

  it('returns the default message for a plain object', () => {
    expect(extractErrorMessage({ code: 404 })).toBe('Failed to fetch QASM files')
  })

  it('returns the default message for null', () => {
    expect(extractErrorMessage(null)).toBe('Failed to fetch QASM files')
  })

  it('returns the default message for undefined', () => {
    expect(extractErrorMessage(undefined)).toBe('Failed to fetch QASM files')
  })

  it('returns the default message for a string throw', () => {
    expect(extractErrorMessage('timeout')).toBe('Failed to fetch QASM files')
  })

  it('returns the default message for a numeric throw', () => {
    expect(extractErrorMessage(503)).toBe('Failed to fetch QASM files')
  })

  it('returns the default message for a boolean throw', () => {
    expect(extractErrorMessage(false)).toBe('Failed to fetch QASM files')
  })

  it('returns the message from an Error subclass', () => {
    class NetworkError extends Error {
      constructor(msg: string) {
        super(msg)
        this.name = 'NetworkError'
      }
    }
    expect(extractErrorMessage(new NetworkError('fetch failed'))).toBe('fetch failed')
  })
})
