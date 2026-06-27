import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MissionBrowserTabBar } from './MissionBrowserTabBar'
import type { BrowserTab } from './browser'

vi.mock('./browser', () => ({
  BROWSER_TABS: [
    { id: 'recommended', label: 'Recommended', icon: '⭐' },
    { id: 'installers', label: 'Installers', icon: '📦' },
    { id: 'fixes', label: 'Fixes', icon: '🔧' },
    { id: 'schedule', label: 'Schedule', icon: '📅' },
  ],
  missionCache: {
    installersDone: true,
    fixesDone: true,
  },
  resetMissionCache: vi.fn(),
}))

describe('MissionBrowserTabBar', () => {
  it('renders all tabs', () => {
    render(
      <MissionBrowserTabBar
        activeTab="recommended"
        onTabChange={vi.fn()}
        installerCount={10}
        fixerCount={5}
      />
    )
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('Installers')).toBeInTheDocument()
    expect(screen.getByText('Fixes')).toBeInTheDocument()
    expect(screen.getByText('Schedule')).toBeInTheDocument()
  })

  it('highlights the active tab', () => {
    render(
      <MissionBrowserTabBar
        activeTab="installers"
        onTabChange={vi.fn()}
        installerCount={10}
        fixerCount={5}
      />
    )
    const installersButton = screen.getByText('Installers').closest('button')
    expect(installersButton).toHaveClass('bg-purple-500/20')
  })

  it('displays installer count badge', () => {
    render(
      <MissionBrowserTabBar
        activeTab="recommended"
        onTabChange={vi.fn()}
        installerCount={42}
        fixerCount={5}
      />
    )
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('displays fixer count badge', () => {
    render(
      <MissionBrowserTabBar
        activeTab="recommended"
        onTabChange={vi.fn()}
        installerCount={10}
        fixerCount={23}
      />
    )
    expect(screen.getByText('23')).toBeInTheDocument()
  })

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn()
    render(
      <MissionBrowserTabBar
        activeTab="recommended"
        onTabChange={onTabChange}
        installerCount={10}
        fixerCount={5}
      />
    )
    screen.getByText('Installers').click()
    expect(onTabChange).toHaveBeenCalledWith('installers')
  })

  it('renders refresh button', () => {
    const { container } = render(
      <MissionBrowserTabBar
        activeTab="recommended"
        onTabChange={vi.fn()}
        installerCount={10}
        fixerCount={5}
      />
    )
    const refreshButton = container.querySelector('button[title*="Refresh"]')
    expect(refreshButton).toBeInTheDocument()
  })
})
