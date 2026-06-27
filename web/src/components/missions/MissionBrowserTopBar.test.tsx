import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MissionBrowserTopBar } from './MissionBrowserTopBar'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'missions.browser.showFilters': 'Show filters',
        'missions.browser.hideFilters': 'Hide filters',
      }
      return map[key] ?? key
    },
  }),
}))

describe('MissionBrowserTopBar', () => {
  it('renders search input', () => {
    render(
      <MissionBrowserTopBar
        searchQuery=""
        onSearchChange={vi.fn()}
        activeTab="recommended"
        showFilters={false}
        onToggleFilters={vi.fn()}
        activeFilterCount={0}
        viewMode="grid"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
        isSmallScreen={false}
      />
    )
    expect(screen.getByTestId('mission-search')).toBeInTheDocument()
  })

  it('displays search query value', () => {
    render(
      <MissionBrowserTopBar
        searchQuery="kubernetes"
        onSearchChange={vi.fn()}
        activeTab="recommended"
        showFilters={false}
        onToggleFilters={vi.fn()}
        activeFilterCount={0}
        viewMode="grid"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
        isSmallScreen={false}
      />
    )
    const input = screen.getByTestId('mission-search') as HTMLInputElement
    expect(input.value).toBe('kubernetes')
  })

  it('renders filter toggle button', () => {
    render(
      <MissionBrowserTopBar
        searchQuery=""
        onSearchChange={vi.fn()}
        activeTab="recommended"
        showFilters={false}
        onToggleFilters={vi.fn()}
        activeFilterCount={0}
        viewMode="grid"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
        isSmallScreen={false}
      />
    )
    expect(screen.getByRole('button', { name: /Show filters/i })).toBeInTheDocument()
  })

  it('displays active filter count badge', () => {
    render(
      <MissionBrowserTopBar
        searchQuery=""
        onSearchChange={vi.fn()}
        activeTab="recommended"
        showFilters={false}
        onToggleFilters={vi.fn()}
        activeFilterCount={3}
        viewMode="grid"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
        isSmallScreen={false}
      />
    )
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders grid and list view toggle buttons', () => {
    render(
      <MissionBrowserTopBar
        searchQuery=""
        onSearchChange={vi.fn()}
        activeTab="recommended"
        showFilters={false}
        onToggleFilters={vi.fn()}
        activeFilterCount={0}
        viewMode="grid"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
        isSmallScreen={false}
      />
    )
    expect(screen.getByRole('button', { name: /Grid view/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /List view/i })).toBeInTheDocument()
  })

  it('highlights active view mode', () => {
    render(
      <MissionBrowserTopBar
        searchQuery=""
        onSearchChange={vi.fn()}
        activeTab="recommended"
        showFilters={false}
        onToggleFilters={vi.fn()}
        activeFilterCount={0}
        viewMode="list"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
        isSmallScreen={false}
      />
    )
    const listButton = screen.getByRole('button', { name: /List view/i })
    expect(listButton).toHaveClass('bg-purple-500/20')
  })

  it('renders close button', () => {
    render(
      <MissionBrowserTopBar
        searchQuery=""
        onSearchChange={vi.fn()}
        activeTab="recommended"
        showFilters={false}
        onToggleFilters={vi.fn()}
        activeFilterCount={0}
        viewMode="grid"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
        isSmallScreen={false}
      />
    )
    expect(screen.getByRole('button', { name: /Close mission browser/i })).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <MissionBrowserTopBar
        searchQuery=""
        onSearchChange={vi.fn()}
        activeTab="recommended"
        showFilters={false}
        onToggleFilters={vi.fn()}
        activeFilterCount={0}
        viewMode="grid"
        onViewModeChange={vi.fn()}
        onClose={onClose}
        isSmallScreen={false}
      />
    )
    screen.getByRole('button', { name: /Close mission browser/i }).click()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('disables search on schedule tab', () => {
    render(
      <MissionBrowserTopBar
        searchQuery=""
        onSearchChange={vi.fn()}
        activeTab="schedule"
        showFilters={false}
        onToggleFilters={vi.fn()}
        activeFilterCount={0}
        viewMode="grid"
        onViewModeChange={vi.fn()}
        onClose={vi.fn()}
        isSmallScreen={false}
      />
    )
    const input = screen.getByTestId('mission-search') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})
