import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../types/predictions', () => ({
  DEFAULT_PREDICTION_SETTINGS: {
    aiEnabled: true,
    minConfidence: 50,
    consensusMode: false,
    thresholds: { cpu: 80, memory: 80, restarts: 5 },
  },
}))

import { usePredictionSettings, getPredictionSettings, getSettingsForBackend } from '../usePredictionSettings'

describe('usePredictionSettings', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('returns default settings', () => {
    const { result } = renderHook(() => usePredictionSettings())
    expect(result.current.settings).toHaveProperty('aiEnabled')
    expect(result.current.settings).toHaveProperty('minConfidence')
  })

  it('updateSettings modifies settings', () => {
    const { result } = renderHook(() => usePredictionSettings())
    act(() => { result.current.updateSettings({ minConfidence: 75 }) })
    expect(result.current.settings.minConfidence).toBe(75)
  })

  it('resetSettings restores defaults', () => {
    const { result } = renderHook(() => usePredictionSettings())
    act(() => { result.current.updateSettings({ minConfidence: 90 }) })
    act(() => { result.current.resetSettings() })
    expect(result.current.settings.minConfidence).toBe(50)
  })

  it('toggleAI flips aiEnabled', () => {
    const { result } = renderHook(() => usePredictionSettings())
    const initial = result.current.settings.aiEnabled
    act(() => { result.current.toggleAI() })
    expect(result.current.settings.aiEnabled).toBe(!initial)
  })

  it('toggleConsensus flips consensusMode', () => {
    const { result } = renderHook(() => usePredictionSettings())
    const initial = result.current.settings.consensusMode
    act(() => { result.current.toggleConsensus() })
    expect(result.current.settings.consensusMode).toBe(!initial)
  })

  it('updateThreshold updates a single threshold', () => {
    const { result } = renderHook(() => usePredictionSettings())
    act(() => { result.current.updateThreshold('cpu', 95) })
    expect(result.current.settings.thresholds.cpu).toBe(95)
  })

  it('persists settings to localStorage', () => {
    const { result } = renderHook(() => usePredictionSettings())
    act(() => { result.current.updateSettings({ minConfidence: 60 }) })
    const stored = localStorage.getItem('kubestellar-prediction-settings')
    expect(stored).not.toBeNull()
  })
})

describe('getPredictionSettings', () => {
  it('returns current settings without subscribing', () => {
    const settings = getPredictionSettings()
    expect(settings).toHaveProperty('aiEnabled')
  })
})

describe('getSettingsForBackend', () => {
  it('returns a copy of settings', () => {
    const settings = getSettingsForBackend()
    expect(settings).toHaveProperty('aiEnabled')
  })
})
