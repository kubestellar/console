import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StellarActivityPanel } from './StellarActivityPanel'
import type { StellarActivity } from '../../types/stellar'

const makeActivity = (overrides: Partial<StellarActivity> = {}): StellarActivity => ({
  id: 'act-1',
  userId: 'user-1',
  ts: new Date().toISOString(),
  kind: 'auto_fixed',
  title: 'Restarted pod my-app',
  severity: 'info',
  ...overrides,
})

describe('StellarActivityPanel', () => {
  it('renders the Stellar log header', () => {
    render(<StellarActivityPanel activity={[]} />)
    expect(screen.getByText('Stellar log')).toBeInTheDocument()
  })

  it('shows activity count badge', () => {
    render(<StellarActivityPanel activity={[makeActivity(), makeActivity({ id: 'act-2' })]} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows empty message when no activity', () => {
    render(<StellarActivityPanel activity={[]} />)
    expect(screen.getByText(/Nothing to report yet/)).toBeInTheDocument()
  })

  it('renders activity entry title', () => {
    render(<StellarActivityPanel activity={[makeActivity()]} />)
    expect(screen.getByText('Restarted pod my-app')).toBeInTheDocument()
  })

  it('collapses the panel when header is clicked', () => {
    render(<StellarActivityPanel activity={[makeActivity()]} />)
    const header = screen.getByText('Stellar log').closest('div') as HTMLElement
    fireEvent.click(header)
    expect(screen.queryByText('Restarted pod my-app')).not.toBeInTheDocument()
  })

  it('filters to actions-only when Actions only chip is clicked', () => {
    const activities = [
      makeActivity({ id: 'act-eval', kind: 'evaluated', title: 'Noticed pod issue' }),
      makeActivity({ id: 'act-fix', kind: 'auto_fixed', title: 'Restarted pod my-app' }),
    ]
    render(<StellarActivityPanel activity={activities} />)
    fireEvent.click(screen.getByText('Actions only'))
    expect(screen.queryByText('Noticed pod issue')).not.toBeInTheDocument()
    expect(screen.getByText('Restarted pod my-app')).toBeInTheDocument()
  })

  it('calls onOpenEvent when a row with eventId is clicked', () => {
    const onOpenEvent = vi.fn()
    const activity = makeActivity({ id: 'act-evt', kind: 'auto_fixed', title: 'Fixed it', eventId: 'evt-99' })
    render(<StellarActivityPanel activity={[activity]} onOpenEvent={onOpenEvent} />)
    fireEvent.click(screen.getByText('Fixed it'))
    expect(onOpenEvent).toHaveBeenCalledWith('evt-99', activity)
  })
})
