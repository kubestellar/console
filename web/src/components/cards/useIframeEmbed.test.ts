import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HEIGHT, useIframeEmbed } from './useIframeEmbed'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const STORAGE_KEY = 'iframe_embed_saved'
const REFRESH_SECONDS = 2
const REFRESH_MS = 2000
const RELOAD_DELAY_MS = 50
const URL_VALUE = 'https://grafana.example.com'

describe('useIframeEmbed', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts unconfigured with editable defaults', () => {
    const { result } = renderHook(() => useIframeEmbed(undefined, false))
    expect(result.current).toMatchObject({
      url: '', title: 'Embed', height: DEFAULT_HEIGHT,
      refreshInterval: 0, showSettings: true, isLoading: false, loadError: null,
    })
  })

  it.each(['javascript:alert(1)', 'data:text/html,bad', '/relative', 'bad-url'])(
    'rejects unsafe configured and submitted URLs: %s', (url) => {
      const { result } = renderHook(() => useIframeEmbed({ url }, false))
      expect(result.current.url).toBe('')
      act(() => result.current.handleSaveConfig())
      expect(result.current.url).toBe('')
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    },
  )

  it('selects presets, saves normalized URLs, and preserves other saved embeds', () => {
    const other = { id: 'other', url: 'https://other.example/', title: 'Other', refreshInterval: 0 }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([other]))
    const { result } = renderHook(() => useIframeEmbed(undefined, false))
    act(() => result.current.handlePresetSelect({ url: URL_VALUE, title: ' Grafana ' }))
    expect(result.current.url).toBe('')
    act(() => result.current.setRefreshInterval(REFRESH_SECONDS))
    act(() => result.current.handleSaveConfig())
    expect(result.current).toMatchObject({
      url: `${URL_VALUE}/`, title: 'Grafana', showSettings: false, isLoading: true,
    })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([
      other, expect.objectContaining({ url: `${URL_VALUE}/`, title: 'Grafana', refreshInterval: REFRESH_SECONDS }),
    ])
    act(() => result.current.handleClear())
    expect(result.current).toMatchObject({ url: '', title: 'Embed', urlInput: '', titleInput: '', showSettings: true })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([other])
  })

  it('restores saved configuration while sanitizing persisted URLs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    const saved = { id: 'embed_123', url: URL_VALUE, title: 'Saved', refreshInterval: REFRESH_SECONDS }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([saved]))
    const { result, unmount } = renderHook(() => useIframeEmbed(undefined, false))
    expect(result.current).toMatchObject({ url: `${URL_VALUE}/`, title: 'Saved', showSettings: false })
    unmount()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...saved, url: 'data:text/html,bad' }]))
    const unsafe = renderHook(() => useIframeEmbed(undefined, false))
    expect(unsafe.result.current).toMatchObject({ url: '', urlInput: '', showSettings: true })
  })

  it('tolerates malformed storage', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-json')
    const { result } = renderHook(() => useIframeEmbed(undefined, false))
    expect(result.current.showSettings).toBe(true)
  })

  it('reports load errors and clears them on successful load', () => {
    const { result } = renderHook(() => useIframeEmbed({ url: URL_VALUE }, false))
    act(() => result.current.handleError())
    expect(result.current.loadError).toBe('cards:iframeEmbed.failedToLoadContent')
    act(() => result.current.handleLoad())
    expect(result.current).toMatchObject({ isLoading: false, loadError: null })
  })

  it('reloads on the configured interval and stops refreshing in demo mode and on unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ demo }) => useIframeEmbed({ url: URL_VALUE, refreshInterval: REFRESH_SECONDS }, demo),
      { initialProps: { demo: false } },
    )
    // A plain element-shaped object avoids actual iframe navigation in jsdom.
    const iframe = { src: `${URL_VALUE}/` } as HTMLIFrameElement
    result.current.iframeRef.current = iframe
    act(() => vi.advanceTimersByTime(REFRESH_MS))
    expect(iframe.src).toBe('')
    expect(result.current.isLoading).toBe(true)
    act(() => vi.advanceTimersByTime(RELOAD_DELAY_MS))
    expect(iframe.src).toBe(`${URL_VALUE}/`)
    act(() => result.current.handleLoad())
    rerender({ demo: true })
    act(() => vi.advanceTimersByTime(REFRESH_MS))
    expect(result.current.isLoading).toBe(false)
    rerender({ demo: false })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('opens the normalized URL in a new tab with opener protection', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { result } = renderHook(() => useIframeEmbed({ url: URL_VALUE }, false))
    act(() => result.current.openInNewTab())
    expect(open).toHaveBeenCalledWith(`${URL_VALUE}/`, '_blank', 'noopener,noreferrer')
  })
})
