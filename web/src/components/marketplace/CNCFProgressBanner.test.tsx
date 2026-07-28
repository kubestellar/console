import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CNCFProgressBanner } from './CNCFProgressBanner'
import type { CNCFStats } from '../../hooks/useMarketplace'

const makeStats = (overrides: Partial<CNCFStats> = {}): CNCFStats => ({
  total: 10,
  completed: 6,
  graduatedTotal: 3,
  incubatingTotal: 3,
  helpWanted: 2,
  ...overrides,
})

describe('CNCFProgressBanner', () => {
  it('renders nothing when total is 0', () => {
    const { container } = render(<CNCFProgressBanner stats={makeStats({ total: 0 })} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the CNCF Project Coverage heading', () => {
    render(<CNCFProgressBanner stats={makeStats()} />)
    expect(screen.getByText('CNCF Project Coverage')).toBeInTheDocument()
  })

  it('displays completed/total cards count', () => {
    render(<CNCFProgressBanner stats={makeStats({ completed: 6, total: 10 })} />)
    expect(screen.getByText('6 of 10 cards implemented')).toBeInTheDocument()
  })

  it('shows calculated percentage', () => {
    render(<CNCFProgressBanner stats={makeStats({ completed: 6, total: 10 })} />)
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('shows stats row with Graduated, Incubating, and Help Wanted counts', () => {
    render(<CNCFProgressBanner stats={makeStats({ graduatedTotal: 3, incubatingTotal: 4, helpWanted: 2 })} />)
    expect(screen.getByText('3 Graduated')).toBeInTheDocument()
    expect(screen.getByText('4 Incubating')).toBeInTheDocument()
    expect(screen.getByText('2 Help Wanted')).toBeInTheDocument()
  })

  it('collapses and hides detail section when header button is clicked', () => {
    render(<CNCFProgressBanner stats={makeStats()} />)
    expect(screen.getByText('Browse Issues')).toBeInTheDocument()
    fireEvent.click(screen.getByText('CNCF Project Coverage').closest('button')!)
    expect(screen.queryByText('Browse Issues')).not.toBeInTheDocument()
  })

  it('expands again when clicked a second time', () => {
    render(<CNCFProgressBanner stats={makeStats()} />)
    const btn = screen.getByText('CNCF Project Coverage').closest('button')!
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.getByText('Browse Issues')).toBeInTheDocument()
  })

  it('renders action links with correct hrefs', () => {
    render(<CNCFProgressBanner stats={makeStats()} />)
    expect(screen.getByRole('link', { name: /browse issues/i })).toHaveAttribute(
      'href',
      expect.stringContaining('console-marketplace/issues'),
    )
    expect(screen.getByRole('link', { name: /contributor guide/i })).toHaveAttribute(
      'href',
      expect.stringContaining('console-marketplace'),
    )
  })
})
