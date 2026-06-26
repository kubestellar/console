import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────────
const { mockMissionCache, mockResetMissionCache } = vi.hoisted(() => ({
  mockMissionCache: { installersDone: true, fixesDone: true },
  mockResetMissionCache: vi.fn(),
}))

vi.mock('../browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../browser')>()
  return {
    ...actual,
    BROWSER_TABS: [
      { id: 'recommended', label: 'Recommended', icon: '🔍' },
      { id: 'installers', label: 'Installers', icon: '📦' },
      { id: 'fixes', label: 'Fixes', icon: '🔧' },
      { id: 'schedule', label: 'Schedule Action', icon: '🗓️' },
    ],
    missionCache: mockMissionCache,
    resetMissionCache: mockResetMissionCache,
  }
})

import { MissionBrowserTabBar } from '../MissionBrowserTabBar'

function renderTabBar(overrides: Partial<React.ComponentProps<typeof MissionBrowserTabBar>> = {}) {
  const props = {
    activeTab: 'recommended' as const,
    onTabChange: vi.fn(),
    installerCount: 0,
    fixerCount: 0,
    ...overrides,
  }
  return { ...render(<MissionBrowserTabBar {...props} />), props }
}

describe('MissionBrowserTabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMissionCache.installersDone = true
    mockMissionCache.fixesDone = true
  })

  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders all 4 tab buttons', () => {
    renderTabBar()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('Installers')).toBeInTheDocument()
    expect(screen.getByText('Fixes')).toBeInTheDocument()
    expect(screen.getByText('Schedule Action')).toBeInTheDocument()
  })

  it('renders the refresh button', () => {
    renderTabBar()
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(5) // 4 tabs + 1 refresh
  })

  it('renders tab icons', () => {
    renderTabBar()
    expect(screen.getByText('🔍')).toBeInTheDocument()
    expect(screen.getByText('📦')).toBeInTheDocument()
    expect(screen.getByText('🔧')).toBeInTheDocument()
    expect(screen.getByText('🗓️')).toBeInTheDocument()
  })

  // ── Active tab styling ──────────────────────────────────────────────────────

  it('highlights the active tab with purple styling', () => {
    renderTabBar({ activeTab: 'fixes' })
    const fixesBtn = screen.getByText('Fixes').closest('button')!
    expect(fixesBtn.className).toContain('bg-purple-500/20')
    expect(fixesBtn.className).toContain('text-purple-400')
  })

  it('does not highlight inactive tabs', () => {
    renderTabBar({ activeTab: 'recommended' })
    const installersBtn = screen.getByText('Installers').closest('button')!
    expect(installersBtn.className).not.toContain('bg-purple-500/20')
  })

  // ── Count badges ────────────────────────────────────────────────────────────

  it('shows installer count badge when installerCount > 0', () => {
    renderTabBar({ installerCount: 12 })
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows dash for installer count when installerCount is 0', () => {
    renderTabBar({ installerCount: 0 })
    const badges = screen.getAllByText('–')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('shows fixer count badge when fixerCount > 0', () => {
    renderTabBar({ fixerCount: 7 })
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('shows dash for fixer count when fixerCount is 0', () => {
    renderTabBar({ fixerCount: 0 })
    const badges = screen.getAllByText('–')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  // ── Tab click ───────────────────────────────────────────────────────────────

  it('calls onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn()
    renderTabBar({ onTabChange })
    fireEvent.click(screen.getByText('Fixes'))
    expect(onTabChange).toHaveBeenCalledWith('fixes')
  })

  it('calls onTabChange with installers tab id', () => {
    const onTabChange = vi.fn()
    renderTabBar({ onTabChange })
    fireEvent.click(screen.getByText('Installers'))
    expect(onTabChange).toHaveBeenCalledWith('installers')
  })

  it('calls onTabChange with recommended tab id', () => {
    const onTabChange = vi.fn()
    renderTabBar({ onTabChange })
    fireEvent.click(screen.getByText('Recommended'))
    expect(onTabChange).toHaveBeenCalledWith('recommended')
  })

  // ── Refresh button ──────────────────────────────────────────────────────────

  it('calls resetMissionCache when refresh button is clicked', () => {
    renderTabBar()
    const buttons = screen.getAllByRole('button')
    const refreshBtn = buttons[buttons.length - 1]
    fireEvent.click(refreshBtn)
    expect(mockResetMissionCache).toHaveBeenCalledTimes(1)
  })

  it('shows "Refresh installers" title when installers tab is active', () => {
    renderTabBar({ activeTab: 'installers' })
    const buttons = screen.getAllByRole('button')
    const refreshBtn = buttons[buttons.length - 1]
    expect(refreshBtn.title).toBe('Refresh installers')
  })

  it('shows "Refresh fixes" title when fixes tab is active', () => {
    renderTabBar({ activeTab: 'fixes' })
    const buttons = screen.getAllByRole('button')
    const refreshBtn = buttons[buttons.length - 1]
    expect(refreshBtn.title).toBe('Refresh fixes')
  })

  it('shows "Refresh all mission data" title for other tabs', () => {
    renderTabBar({ activeTab: 'recommended' })
    const buttons = screen.getAllByRole('button')
    const refreshBtn = buttons[buttons.length - 1]
    expect(refreshBtn.title).toBe('Refresh all mission data')
  })

  // ── Refresh spinner (isRefreshing) ──────────────────────────────────────────

  it('spins refresh icon when installers tab is active and installersDone=false', () => {
    mockMissionCache.installersDone = false
    const { container } = renderTabBar({ activeTab: 'installers' })
    const svg = container.querySelector('.animate-spin')
    expect(svg).toBeInTheDocument()
  })

  it('spins refresh icon when fixes tab is active and fixesDone=false', () => {
    mockMissionCache.fixesDone = false
    const { container } = renderTabBar({ activeTab: 'fixes' })
    const svg = container.querySelector('.animate-spin')
    expect(svg).toBeInTheDocument()
  })

  it('does not spin when schedule tab is active', () => {
    mockMissionCache.installersDone = false
    mockMissionCache.fixesDone = false
    const { container } = renderTabBar({ activeTab: 'schedule' })
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
  })

  it('does not spin when cache is done', () => {
    mockMissionCache.installersDone = true
    mockMissionCache.fixesDone = true
    const { container } = renderTabBar({ activeTab: 'recommended' })
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
  })
})
