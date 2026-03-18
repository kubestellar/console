import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAIMode } from '../useAIMode'
import type { AIMode } from '../useAIMode'

// Must match the value in the source file
const STORAGE_KEY = 'kubestellar-ai-mode'

describe('useAIMode', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  // ── Default state initialisation ──────────────────────────────────────

  it('defaults to "medium" when localStorage is empty', () => {
    const { result } = renderHook(() => useAIMode())
    expect(result.current.mode).toBe('medium')
  })

  it('initialises from localStorage if a valid mode is stored', () => {
    localStorage.setItem(STORAGE_KEY, 'high')
    const { result } = renderHook(() => useAIMode())
    expect(result.current.mode).toBe('high')
  })

  it('initialises from localStorage with "low" mode', () => {
    localStorage.setItem(STORAGE_KEY, 'low')
    const { result } = renderHook(() => useAIMode())
    expect(result.current.mode).toBe('low')
  })

  // ── State changes ─────────────────────────────────────────────────────

  it('setMode changes the mode to "high"', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('high')
    })

    expect(result.current.mode).toBe('high')
  })

  it('setMode changes the mode to "low"', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('low')
    })

    expect(result.current.mode).toBe('low')
  })

  it('setMode changes the mode from "low" back to "medium"', () => {
    localStorage.setItem(STORAGE_KEY, 'low')
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('medium')
    })

    expect(result.current.mode).toBe('medium')
  })

  // ── localStorage persistence ──────────────────────────────────────────

  it('persists mode changes to localStorage', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('high')
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe('high')
  })

  it('persists each successive mode change', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('low')
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('low')

    act(() => {
      result.current.setMode('high')
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('high')

    act(() => {
      result.current.setMode('medium')
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('medium')
  })

  // ── Dispatches settings-changed event ─────────────────────────────────

  it('dispatches kubestellar-settings-changed event on mode change', () => {
    const handler = vi.fn()
    window.addEventListener('kubestellar-settings-changed', handler)

    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('high')
    })

    expect(handler).toHaveBeenCalled()

    window.removeEventListener('kubestellar-settings-changed', handler)
  })

  // ── Config correctness ────────────────────────────────────────────────

  it('returns the correct config for "low" mode', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('low')
    })

    const { config } = result.current
    expect(config.mode).toBe('low')
    expect(config.features.proactiveSuggestions).toBe(false)
    expect(config.features.summarizeData).toBe(false)
    expect(config.features.naturalLanguage).toBe(false)
    expect(config.features.contextualHelp).toBe(true)
    expect(config.features.autoAnalyze).toBe(false)
  })

  it('returns the correct config for "medium" mode', () => {
    const { result } = renderHook(() => useAIMode())
    // Default is medium
    const { config } = result.current
    expect(config.mode).toBe('medium')
    expect(config.features.proactiveSuggestions).toBe(false)
    expect(config.features.summarizeData).toBe(true)
    expect(config.features.naturalLanguage).toBe(true)
    expect(config.features.contextualHelp).toBe(true)
    expect(config.features.autoAnalyze).toBe(false)
  })

  it('returns the correct config for "high" mode', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('high')
    })

    const { config } = result.current
    expect(config.mode).toBe('high')
    expect(config.features.proactiveSuggestions).toBe(true)
    expect(config.features.summarizeData).toBe(true)
    expect(config.features.naturalLanguage).toBe(true)
    expect(config.features.contextualHelp).toBe(true)
    expect(config.features.autoAnalyze).toBe(true)
  })

  // ── Description ───────────────────────────────────────────────────────

  it('returns a non-empty description string for each mode', () => {
    const { result } = renderHook(() => useAIMode())

    const modes: AIMode[] = ['low', 'medium', 'high']
    for (const m of modes) {
      act(() => {
        result.current.setMode(m)
      })
      expect(result.current.description).toBeTruthy()
      expect(typeof result.current.description).toBe('string')
      expect(result.current.description.length).toBeGreaterThan(0)
    }
  })

  it('returns different descriptions for each mode', () => {
    const { result } = renderHook(() => useAIMode())
    const descriptions: string[] = []

    const modes: AIMode[] = ['low', 'medium', 'high']
    for (const m of modes) {
      act(() => {
        result.current.setMode(m)
      })
      descriptions.push(result.current.description)
    }

    // All three descriptions should be unique
    const unique = new Set(descriptions)
    expect(unique.size).toBe(3)
  })

  // ── isFeatureEnabled helper ───────────────────────────────────────────

  it('isFeatureEnabled returns correct values for "low" mode', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('low')
    })

    expect(result.current.isFeatureEnabled('contextualHelp')).toBe(true)
    expect(result.current.isFeatureEnabled('summarizeData')).toBe(false)
    expect(result.current.isFeatureEnabled('proactiveSuggestions')).toBe(false)
    expect(result.current.isFeatureEnabled('naturalLanguage')).toBe(false)
    expect(result.current.isFeatureEnabled('autoAnalyze')).toBe(false)
  })

  it('isFeatureEnabled returns correct values for "high" mode', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('high')
    })

    // All features are enabled in high mode
    expect(result.current.isFeatureEnabled('contextualHelp')).toBe(true)
    expect(result.current.isFeatureEnabled('summarizeData')).toBe(true)
    expect(result.current.isFeatureEnabled('proactiveSuggestions')).toBe(true)
    expect(result.current.isFeatureEnabled('naturalLanguage')).toBe(true)
    expect(result.current.isFeatureEnabled('autoAnalyze')).toBe(true)
  })

  // ── tokenMultiplier ───────────────────────────────────────────────────

  it('returns tokenMultiplier=0.1 for "low" mode', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('low')
    })

    expect(result.current.tokenMultiplier).toBe(0.1)
  })

  it('returns tokenMultiplier=0.5 for "medium" mode', () => {
    const { result } = renderHook(() => useAIMode())
    // Default is medium
    expect(result.current.tokenMultiplier).toBe(0.5)
  })

  it('returns tokenMultiplier=1.0 for "high" mode', () => {
    const { result } = renderHook(() => useAIMode())

    act(() => {
      result.current.setMode('high')
    })

    expect(result.current.tokenMultiplier).toBe(1.0)
  })

  // ── Convenience booleans ──────────────────────────────────────────────

  it('convenience booleans match config features', () => {
    const { result } = renderHook(() => useAIMode())

    // Medium mode defaults
    expect(result.current.shouldProactivelySuggest).toBe(false)
    expect(result.current.shouldSummarize).toBe(true)
    expect(result.current.shouldAutoAnalyze).toBe(false)

    act(() => {
      result.current.setMode('high')
    })

    expect(result.current.shouldProactivelySuggest).toBe(true)
    expect(result.current.shouldSummarize).toBe(true)
    expect(result.current.shouldAutoAnalyze).toBe(true)

    act(() => {
      result.current.setMode('low')
    })

    expect(result.current.shouldProactivelySuggest).toBe(false)
    expect(result.current.shouldSummarize).toBe(false)
    expect(result.current.shouldAutoAnalyze).toBe(false)
  })

  // ── Edge cases ────────────────────────────────────────────────────────

  it('crashes when localStorage has an invalid (non-AIMode) value', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-mode')
    // The hook does `stored || 'medium'` — an unrecognised string is truthy,
    // so it is used as-is. The config lookup `AI_MODE_CONFIGS[mode]` returns
    // undefined, causing a runtime error when accessing `.features`.
    // This documents the current (unguarded) behaviour.
    expect(() => {
      renderHook(() => useAIMode())
    }).toThrow()
  })

  it('falls back to "medium" when localStorage value is an empty string', () => {
    localStorage.setItem(STORAGE_KEY, '')
    const { result } = renderHook(() => useAIMode())
    // Empty string is falsy, so `stored || 'medium'` returns 'medium'
    expect(result.current.mode).toBe('medium')
  })

  it('handles missing localStorage gracefully (no key set)', () => {
    // localStorage is cleared in beforeEach — no key exists
    const { result } = renderHook(() => useAIMode())
    expect(result.current.mode).toBe('medium')
  })

  // ── Multiple hook instances ───────────────────────────────────────────

  it('multiple hook instances each have independent local state', () => {
    // useAIMode uses useState (no shared singleton), so each instance
    // initialises from localStorage independently. Changing one does NOT
    // automatically notify the other (unlike useDemoMode's pub/sub).
    const { result: a } = renderHook(() => useAIMode())
    const { result: b } = renderHook(() => useAIMode())

    // Both start at 'medium'
    expect(a.current.mode).toBe('medium')
    expect(b.current.mode).toBe('medium')

    act(() => {
      a.current.setMode('high')
    })

    // Instance a has updated
    expect(a.current.mode).toBe('high')
    // Instance b retains its own state (no cross-instance pub/sub)
    expect(b.current.mode).toBe('medium')
  })

  it('new hook instance picks up previously persisted mode', () => {
    const { result: first } = renderHook(() => useAIMode())

    act(() => {
      first.current.setMode('low')
    })

    // A new instance should read 'low' from localStorage
    const { result: second } = renderHook(() => useAIMode())
    expect(second.current.mode).toBe('low')
  })

  // ── Return shape ──────────────────────────────────────────────────────

  it('returns the expected API shape', () => {
    const { result } = renderHook(() => useAIMode())
    expect(result.current).toHaveProperty('mode')
    expect(result.current).toHaveProperty('setMode')
    expect(result.current).toHaveProperty('config')
    expect(result.current).toHaveProperty('description')
    expect(result.current).toHaveProperty('isFeatureEnabled')
    expect(result.current).toHaveProperty('tokenMultiplier')
    expect(result.current).toHaveProperty('shouldProactivelySuggest')
    expect(result.current).toHaveProperty('shouldSummarize')
    expect(result.current).toHaveProperty('shouldAutoAnalyze')
    expect(typeof result.current.setMode).toBe('function')
    expect(typeof result.current.isFeatureEnabled).toBe('function')
    expect(typeof result.current.tokenMultiplier).toBe('number')
  })
})
