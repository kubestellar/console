import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavigationShell } from '../NavigationShell'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../lib/safeLazy', () => ({
  safeLazy: () => (() => null),
}))

vi.mock('../navbar/index', () => ({
  Navbar: () => <div data-testid="navbar">Navbar</div>,
}))

vi.mock('../Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}))

vi.mock('../../PageErrorBoundary', () => ({
  PageErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../updates/UpdateProgressBanner', () => ({
  UpdateProgressBanner: ({ progress }: { progress: any }) => 
    progress ? <div data-testid="update-banner">Update Progress</div> : null,
}))

vi.mock('../../onboarding/Tour', () => ({
  TourOverlay: () => null,
  TourPrompt: () => null,
}))

vi.mock('../StarsBackground', () => ({
  StarsBackground: () => null,
}))

vi.mock('../../stellar/StellarToastBridge', () => ({
  StellarToastBridge: () => null,
}))

vi.mock('../../stellar/StellarMissionBridge', () => ({
  StellarMissionBridge: () => null,
}))

vi.mock('../../CompactErrorBoundary', () => ({
  CompactErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const defaultProps = {
  dismissUpdateProgress: vi.fn(),
  isMobile: false,
  pathname: '/',
  shouldReserveNavbarFilterPanelOffset: false,
  sidebarWidthPx: 240,
  totalBannerHeight: 0,
  updateProgress: null,
  visibleBanners: [],
}

describe('NavigationShell', () => {
  it('renders core navigation components', () => {
    render(
      <MemoryRouter>
        <NavigationShell {...defaultProps} />
      </MemoryRouter>
    )

    expect(screen.getByTestId('navbar')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders skip-to-content link for accessibility', () => {
    render(
      <MemoryRouter>
        <NavigationShell {...defaultProps} />
      </MemoryRouter>
    )

    const skipLink = screen.getByText('actions.skipToContent')
    expect(skipLink).toBeInTheDocument()
    expect(skipLink).toHaveAttribute('href', '#main-content')
  })

  it('renders update progress banner when updateProgress is provided', () => {
    const updateProgress = { progress: 50, message: 'Updating...' }
    render(
      <MemoryRouter>
        <NavigationShell {...defaultProps} updateProgress={updateProgress} />
      </MemoryRouter>
    )

    expect(screen.getByTestId('update-banner')).toBeInTheDocument()
  })

  it('does not render update progress banner when updateProgress is null', () => {
    render(
      <MemoryRouter>
        <NavigationShell {...defaultProps} updateProgress={null} />
      </MemoryRouter>
    )

    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument()
  })

  it('applies zero margin for mobile mode', () => {
    render(
      <MemoryRouter>
        <NavigationShell {...defaultProps} isMobile={true} />
      </MemoryRouter>
    )

    const main = screen.getByRole('main')
    expect(main).toHaveStyle({ marginLeft: '0' })
  })

  it('renders children when provided', () => {
    render(
      <MemoryRouter>
        <NavigationShell {...defaultProps}>
          <div data-testid="custom-child">Custom Content</div>
        </NavigationShell>
      </MemoryRouter>
    )

    expect(screen.getByTestId('custom-child')).toBeInTheDocument()
  })
})
