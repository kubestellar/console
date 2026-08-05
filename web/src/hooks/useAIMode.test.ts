import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAIMode } from './useAIMode'

const STORAGE_KEY = 'kubestellar-ai-mode'

describe('useAIMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to medium mode when nothing is stored', () => {
    const { result } = renderHook(() => useAIMode())
    expect(result.current.mode).toBe('medium')
    expect(result.current.config.mode).toBe('medium')
  })

  it('reads a persisted valid mode from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'high')
    const { result } = renderHook(() => useAIMode())
    expect(result.current.mode).toBe('high')
  })

  it('falls back to medium when localStorage contains an invalid mode string', () => {
    localStorage.setItem(STORAGE_KEY, 'ultra')
    const { result } = renderHook(() => useAIMode())
    expect(result.current.mode).toBe('medium')
  })

  it('setMode updates state and persists to localStorage', () => {
    const { result } = renderHook(() => useAIMode())
    act(() => {
      result.current.setMode('low')
    })
    expect(result.current.mode).toBe('low')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('low')
  })

  it('dispatches kubestellar-settings-changed on mode change', () => {
    const listener = vi.fn()
    window.addEventListener('kubestellar-settings-changed', listener)
    try {
      const { result } = renderHook(() => useAIMode())
      // One dispatch fires on mount (initial mode effect).
      const initialCalls = listener.mock.calls.length
      act(() => {
        result.current.setMode('high')
      })
      expect(listener.mock.calls.length).toBeGreaterThan(initialCalls)
    } finally {
      window.removeEventListener('kubestellar-settings-changed', listener)
    }
  })

  describe('feature flags per mode', () => {
    it('low disables analytical features but keeps contextual help', () => {
      localStorage.setItem(STORAGE_KEY, 'low')
      const { result } = renderHook(() => useAIMode())
      const f = result.current.config.features
      expect(f.proactiveSuggestions).toBe(false)
      expect(f.summarizeData).toBe(false)
      expect(f.naturalLanguage).toBe(false)
      expect(f.autoAnalyze).toBe(false)
      expect(f.contextualHelp).toBe(true)
      expect(result.current.shouldProactivelySuggest).toBe(false)
      expect(result.current.shouldSummarize).toBe(false)
      expect(result.current.shouldAutoAnalyze).toBe(false)
    })

    it('medium enables summarize + natural language but not proactive/auto-analyze', () => {
      localStorage.setItem(STORAGE_KEY, 'medium')
      const { result } = renderHook(() => useAIMode())
      const f = result.current.config.features
      expect(f.summarizeData).toBe(true)
      expect(f.naturalLanguage).toBe(true)
      expect(f.proactiveSuggestions).toBe(false)
      expect(f.autoAnalyze).toBe(false)
    })

    it('high enables all features', () => {
      localStorage.setItem(STORAGE_KEY, 'high')
      const { result } = renderHook(() => useAIMode())
      const f = result.current.config.features
      expect(f.proactiveSuggestions).toBe(true)
      expect(f.summarizeData).toBe(true)
      expect(f.naturalLanguage).toBe(true)
      expect(f.contextualHelp).toBe(true)
      expect(f.autoAnalyze).toBe(true)
      expect(result.current.shouldProactivelySuggest).toBe(true)
      expect(result.current.shouldAutoAnalyze).toBe(true)
    })
  })

  it('isFeatureEnabled reflects the current mode', () => {
    localStorage.setItem(STORAGE_KEY, 'high')
    const { result } = renderHook(() => useAIMode())
    expect(result.current.isFeatureEnabled('proactiveSuggestions')).toBe(true)
    expect(result.current.isFeatureEnabled('autoAnalyze')).toBe(true)
  })

  it('tokenMultiplier scales with mode', () => {
    const { result, rerender } = renderHook(() => useAIMode())
    expect(result.current.tokenMultiplier).toBe(0.5)

    act(() => {
      result.current.setMode('low')
    })
    rerender()
    expect(result.current.tokenMultiplier).toBe(0.1)

    act(() => {
      result.current.setMode('high')
    })
    rerender()
    expect(result.current.tokenMultiplier).toBe(1.0)
  })

  it('description text matches the active mode', () => {
    const { result } = renderHook(() => useAIMode())
    expect(result.current.description).toMatch(/Balanced approach/)

    act(() => {
      result.current.setMode('low')
    })
    expect(result.current.description).toMatch(/Minimal token usage/)

    act(() => {
      result.current.setMode('high')
    })
    expect(result.current.description).toMatch(/Full AI assistance/)
  })
})
