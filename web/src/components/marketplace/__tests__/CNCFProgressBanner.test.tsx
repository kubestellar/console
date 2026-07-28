import React from 'react'
/**
 * Coverage for CNCFProgressBanner.tsx (Auto-QA #21690 — missing test file).
 *
 * Verifies the null-render guard, progress percentage/label rendering,
 * collapse/expand toggle (with localStorage persistence), and cross-tab
 * sync via the `storage` event (fix #6006).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CNCFProgressBanner } from '../CNCFProgressBanner'
import type { CNCFStats } from '../../../hooks/useMarketplace'

const BANNER_COLLAPSED_KEY = 'kc-cncf-banner-collapsed'

function makeStats(overrides: Partial<CNCFStats> = {}): CNCFStats {
  return {
    total: 10,
    completed: 4,
    graduatedTotal: 5,
    incubatingTotal: 3,
    helpWanted: 2,
    ...overrides,
  } as CNCFStats
}

describe('CNCFProgressBanner', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders nothing when stats.total is 0', () => {
    const { container } = render(<CNCFProgressBanner stats={makeStats({ total: 0 })} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the computed percentage and completed/total copy', () => {
    render(<CNCFProgressBanner stats={makeStats({ completed: 4, total: 10 })} />)

    expect(screen.getByText('40%')).toBeVisible()
    expect(screen.getByText('4 of 10 cards implemented')).toBeVisible()
  })

  it('is expanded by default and shows stats + action links', () => {
    render(<CNCFProgressBanner stats={makeStats()} />)

    expect(screen.getByText(/Graduated/)).toBeVisible()
    expect(screen.getByText(/Incubating/)).toBeVisible()
    expect(screen.getByText(/Help Wanted/)).toBeVisible()
    expect(screen.getByText('Browse Issues')).toBeVisible()
    expect(screen.getByText('Contributor Guide')).toBeVisible()
  })

  it('starts collapsed when localStorage has the collapsed flag set', () => {
    localStorage.setItem(BANNER_COLLAPSED_KEY, 'true')
    render(<CNCFProgressBanner stats={makeStats()} />)

    expect(screen.queryByText('Browse Issues')).not.toBeInTheDocument()
  })

  it('toggles collapse state and persists it to localStorage on click', () => {
    render(<CNCFProgressBanner stats={makeStats()} />)

    expect(screen.getByText('Browse Issues')).toBeVisible()

    fireEvent.click(screen.getByText('CNCF Project Coverage'))

    expect(screen.queryByText('Browse Issues')).not.toBeInTheDocument()
    expect(localStorage.getItem(BANNER_COLLAPSED_KEY)).toBe('true')

    fireEvent.click(screen.getByText('CNCF Project Coverage'))

    expect(screen.getByText('Browse Issues')).toBeVisible()
    expect(localStorage.getItem(BANNER_COLLAPSED_KEY)).toBe('false')
  })

  it('syncs collapsed state across tabs via the storage event', () => {
    render(<CNCFProgressBanner stats={makeStats()} />)

    expect(screen.getByText('Browse Issues')).toBeVisible()

    fireEvent(
      window,
      Object.assign(new Event('storage'), { key: BANNER_COLLAPSED_KEY, newValue: 'true' }),
    )

    expect(screen.queryByText('Browse Issues')).not.toBeInTheDocument()
  })

  it('ignores storage events for unrelated keys', () => {
    render(<CNCFProgressBanner stats={makeStats()} />)

    fireEvent(
      window,
      Object.assign(new Event('storage'), { key: 'some-other-key', newValue: 'true' }),
    )

    expect(screen.getByText('Browse Issues')).toBeVisible()
  })
})
