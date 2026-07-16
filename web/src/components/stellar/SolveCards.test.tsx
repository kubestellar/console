import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SolveProgressCard, SolveEscalatedCard } from './SolveCards'
import type { StellarSolve, StellarSolveProgress } from '../../types/stellar'

const progress: StellarSolveProgress = {
  solveId: 'solve-1',
  eventId: 'evt-1',
  step: 'investigating',
  message: 'Analyzing pod logs',
  actionsTaken: 1,
}

const escalatedSolve: StellarSolve = {
  id: 'solve-2',
  eventId: 'evt-2',
  userId: 'user-1',
  cluster: 'prod',
  namespace: 'payments',
  workload: 'worker',
  status: 'escalated',
  actionsTaken: 3,
  summary: 'Could not recover after 3 attempts',
  startedAt: '2026-06-10T10:00:00Z',
  endedAt: '2026-06-10T10:05:00Z',
}

const exhaustedSolve: StellarSolve = {
  ...escalatedSolve,
  id: 'solve-3',
  status: 'exhausted',
  summary: 'Exhausted budget without resolution',
  limitHit: 'cost',
}

describe('SolveProgressCard', () => {
  it('renders the current step', () => {
    render(<SolveProgressCard progress={progress} />)
    expect(screen.getByText(/investigating/)).toBeInTheDocument()
  })

  it('renders the progress message', () => {
    render(<SolveProgressCard progress={progress} />)
    expect(screen.getByText('Analyzing pod logs')).toBeInTheDocument()
  })

  it('renders the action count', () => {
    render(<SolveProgressCard progress={progress} />)
    expect(screen.getByText('1 action')).toBeInTheDocument()
  })

  it('renders plural actions label', () => {
    render(<SolveProgressCard progress={{ ...progress, actionsTaken: 2 }} />)
    expect(screen.getByText('2 actions')).toBeInTheDocument()
  })
})

describe('SolveEscalatedCard', () => {
  it('renders escalated tag', () => {
    render(<SolveEscalatedCard solve={escalatedSolve} />)
    expect(screen.getByText('⚠ Escalated')).toBeInTheDocument()
  })

  it('renders exhausted tag for exhausted solves', () => {
    render(<SolveEscalatedCard solve={exhaustedSolve} />)
    expect(screen.getByText('⏸ Paused at budget')).toBeInTheDocument()
  })

  it('renders cluster/namespace/workload', () => {
    render(<SolveEscalatedCard solve={escalatedSolve} />)
    expect(screen.getByText('prod/payments/worker')).toBeInTheDocument()
  })

  it('renders the solve summary', () => {
    render(<SolveEscalatedCard solve={escalatedSolve} />)
    expect(screen.getByText('Could not recover after 3 attempts')).toBeInTheDocument()
  })

  it('shows limit hit note for exhausted solve', () => {
    render(<SolveEscalatedCard solve={exhaustedSolve} />)
    expect(screen.getByText(/limit hit: cost/)).toBeInTheDocument()
  })

  it('expands to show detail when expand button clicked', () => {
    render(<SolveEscalatedCard solve={escalatedSolve} />)
    fireEvent.click(screen.getByText('▶'))
    expect(screen.getByText(/actions taken: 3/)).toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<SolveEscalatedCard solve={escalatedSolve} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByTitle('Dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('does not render dismiss button when onDismiss is not provided', () => {
    render(<SolveEscalatedCard solve={escalatedSolve} />)
    expect(screen.queryByTitle('Dismiss')).not.toBeInTheDocument()
  })

  it('shows error when solve has an error field', () => {
    const solveWithError = { ...escalatedSolve, error: 'timeout connecting to cluster' }
    render(<SolveEscalatedCard solve={solveWithError} />)
    fireEvent.click(screen.getByText('▶'))
    expect(screen.getByText(/timeout connecting to cluster/)).toBeInTheDocument()
  })
})
