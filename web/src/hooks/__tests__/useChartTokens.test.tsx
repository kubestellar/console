import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChartTokens } from '../useChartTokens'

const mockUseTheme = vi.fn()
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => mockUseTheme(),
}))

function stubTokens(values: Record<string, string>) {
  vi.stubGlobal('getComputedStyle', vi.fn().mockReturnValue({
    getPropertyValue: (name: string) => values[name] ?? '',
  }))
}

describe('useChartTokens', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mockUseTheme.mockReset()
  })

  it('returns fallback tokens when CSS variables are unavailable', () => {
    mockUseTheme.mockReturnValue({ themeId: 'kubestellar' })
    vi.stubGlobal('getComputedStyle', undefined)

    const { result } = renderHook(() => useChartTokens())
    expect(result.current).toEqual({
      textMuted: '#aaa',
      axisStroke: '#333',
      gridStroke: '#333',
      tickColor: '#888',
    })
  })

  it('re-reads the CSS tokens when the theme id changes', () => {
    mockUseTheme.mockReturnValue({ themeId: 'kubestellar' })
    stubTokens({ '--chart-text-muted': '#aaaaaa', '--chart-axis-stroke': '#333333' })

    const { result, rerender } = renderHook(() => useChartTokens())
    expect(result.current.textMuted).toBe('#aaaaaa')
    expect(result.current.axisStroke).toBe('#333333')

    stubTokens({ '--chart-text-muted': '#555555', '--chart-axis-stroke': '#cccccc' })
    mockUseTheme.mockReturnValue({ themeId: 'kubestellar-light' })
    act(() => rerender())

    expect(result.current.textMuted).toBe('#555555')
    expect(result.current.axisStroke).toBe('#cccccc')
  })

  it('keeps the same tokens object when values are unchanged', () => {
    mockUseTheme.mockReturnValue({ themeId: 'kubestellar' })
    stubTokens({ '--chart-text-muted': '#aaaaaa' })

    const { result, rerender } = renderHook(() => useChartTokens())
    const first = result.current

    mockUseTheme.mockReturnValue({ themeId: 'other-theme-same-tokens' })
    act(() => rerender())

    expect(result.current).toBe(first)
  })
})
