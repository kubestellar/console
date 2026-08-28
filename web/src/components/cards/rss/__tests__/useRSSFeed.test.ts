import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => {},
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
  isFeatureEnabled: () => true,
}))

vi.mock('../../../../hooks/useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../hooks/useDemoMode')>()),
  getDemoMode: () => true, default: () => true,
  useDemoMode: () => ({ isDemoMode: true, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

vi.mock('../storage', () => ({
  loadSavedFeeds: () => [],
  saveFeeds: vi.fn(),
  getCachedFeed: () => null,
  cacheFeed: vi.fn(),
}))

vi.mock('../demoData', () => ({
  RSS_DEMO_FEEDS: [{ url: 'demo:feed1', name: 'Demo Feed 1' }],
  getDemoRSSItems: () => [
    { title: 'Demo item', link: 'https://example.com/1', pubDate: new Date() },
  ],
}))

vi.mock('../feedFetcher', () => ({
  fetchSingleFeed: vi.fn().mockResolvedValue([]),
}))

import { useRSSFeed } from '../useRSSFeed'

describe('useRSSFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() => useRSSFeed({}))
    expect(result.current.activeFeedIndex).toBe(0)
    expect(result.current.showSettings).toBe(false)
    expect(result.current.showFeedSelector).toBe(false)
    expect(result.current.showFilterEditor).toBe(false)
    expect(result.current.showAggregateCreator).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('toggles settings panel', () => {
    const { result } = renderHook(() => useRSSFeed({}))
    expect(result.current.showSettings).toBe(false)
    act(() => { result.current.handleToggleSettings() })
    expect(result.current.showSettings).toBe(true)
    act(() => { result.current.handleToggleSettings() })
    expect(result.current.showSettings).toBe(false)
  })

  it('toggles feed selector', () => {
    const { result } = renderHook(() => useRSSFeed({}))
    expect(result.current.showFeedSelector).toBe(false)
    act(() => { result.current.handleToggleFeedSelector() })
    expect(result.current.showFeedSelector).toBe(true)
  })

  it('opens filter editor with current filter terms', () => {
    const { result } = renderHook(() => useRSSFeed({}))
    act(() => { result.current.handleOpenFilterEditor() })
    expect(result.current.showFilterEditor).toBe(true)
    expect(result.current.tempIncludeTerms).toBe('')
    expect(result.current.tempExcludeTerms).toBe('')
  })

  it('closes filter editor', () => {
    const { result } = renderHook(() => useRSSFeed({}))
    act(() => { result.current.handleOpenFilterEditor() })
    expect(result.current.showFilterEditor).toBe(true)
    act(() => { result.current.handleCloseFilterEditor() })
    expect(result.current.showFilterEditor).toBe(false)
  })

  it('toggles aggregate creator', () => {
    const { result } = renderHook(() => useRSSFeed({}))
    act(() => { result.current.handleToggleAggregateCreator() })
    expect(result.current.showAggregateCreator).toBe(true)
    act(() => { result.current.handleToggleAggregateCreator() })
    expect(result.current.showAggregateCreator).toBe(false)
  })

  it('cancels aggregate edit and resets state', () => {
    const { result } = renderHook(() => useRSSFeed({}))
    act(() => {
      result.current.setAggregateName('Test Agg')
      result.current.setSelectedSourceUrls(['https://example.com/feed'])
      result.current.handleToggleAggregateCreator()
    })
    expect(result.current.showAggregateCreator).toBe(true)
    act(() => { result.current.handleCancelAggregateEdit() })
    expect(result.current.showAggregateCreator).toBe(false)
    expect(result.current.aggregateName).toBe('')
    expect(result.current.selectedSourceUrls).toHaveLength(0)
  })
})
