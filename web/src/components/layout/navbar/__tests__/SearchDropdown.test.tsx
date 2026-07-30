import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { SearchItem } from '../../../../hooks/useSearchIndex'

const navigateMock = vi.fn()
const locationState = { pathname: '/' }
const mockUseSearchIndex = vi.fn()
const startMissionMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => locationState,
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../../../hooks/useSearchIndex', () => ({
  useSearchIndex: (...args: unknown[]) => mockUseSearchIndex(...args),
  CATEGORY_ORDER: ['page', 'card', 'stat', 'setting', 'cluster', 'namespace', 'deployment', 'pod', 'service', 'mission', 'dashboard', 'helm', 'node'],
}))

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({
    openSidebar: vi.fn(),
    setActiveMission: vi.fn(),
    startMission: startMissionMock,
  }),
}))

vi.mock('../../../../hooks/useSidebarConfig', () => ({
  useSidebarConfig: () => ({
    config: { primaryNav: [] },
  }),
  DISCOVERABLE_DASHBOARDS: [],
}))

vi.mock('../../../../lib/scrollToCard', () => ({
  scrollToCard: vi.fn(),
}))

vi.mock('../../../../hooks/useFeatureHints', () => ({
  useFeatureHints: () => ({
    action: vi.fn(),
    dismiss: vi.fn(),
    isVisible: false,
  }),
}))

vi.mock('../../../ui/FeatureHintTooltip', () => ({
  FeatureHintTooltip: () => null,
}))

vi.mock('../../../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/analytics')>()),
  emitGlobalSearchOpened: vi.fn(),
  emitGlobalSearchQueried: vi.fn(),
  emitGlobalSearchSelected: vi.fn(),
  emitGlobalSearchAskAI: vi.fn(),
}
))

describe('SearchDropdown', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    startMissionMock.mockReset()
    locationState.pathname = '/'
    mockUseSearchIndex.mockReturnValue({ results: new Map(), totalCount: 0 })
  })

  it('clears the search query when the pathname changes', async () => {
    const { SearchDropdown } = await import('../SearchDropdown')
    const { rerender } = render(<SearchDropdown />)

    const searchInput = screen.getByTestId('global-search-input') as HTMLInputElement
    fireEvent.change(searchInput, { target: { value: 'zzzzzzz' } })
    expect(searchInput.value).toBe('zzzzzzz')

    locationState.pathname = '/clusters'
    rerender(<SearchDropdown />)

    expect(screen.getByTestId('global-search-input')).toHaveValue('')
  })

  it('renders readable type chips for search results', async () => {
    const results = new Map<string, SearchItem[]>([
      ['page', [{ id: 'clusters-page', name: 'Clusters', category: 'page', href: '/clusters' }]],
    ])
    mockUseSearchIndex.mockReturnValue({ results, totalCount: 1 })

    const { SearchDropdown } = await import('../SearchDropdown')
    render(<SearchDropdown />)

    fireEvent.change(screen.getByTestId('global-search-input'), { target: { value: 'pod' } })

    const item = screen.getByTestId('global-search-result-item')
    const chip = item.querySelector('span')

    expect(chip).toHaveClass('text-xs')
    expect(chip).toHaveClass('bg-secondary')
    expect(chip).toHaveClass('px-2')
    expect(chip).toHaveClass('py-0.5')
    expect(chip).toHaveClass('text-foreground')
  })

  it('sanitizes search input before starting an AI mission', async () => {
    mockUseSearchIndex.mockReturnValue({ results: new Map(), totalCount: 0 })

    const { SearchDropdown } = await import('../SearchDropdown')
    render(<SearchDropdown />)

    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: '\\u003cscript\\u003ealert(1)\\u003c/script\\u003e & pods' },
    })
    fireEvent.click(screen.getByText('layout.navbar.askAIInstead'))

    expect(startMissionMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'scriptalert(1)/script &amp; pods',
      initialPrompt: 'scriptalert(1)/script &amp; pods',
      type: 'custom',
    }))
  })
})
