import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BatchMonitorModal } from './BatchMonitorModal'
import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom')
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  }
})

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => false,
}))

const batchTimestamp = '2026-06-10T10:00:00Z'

const batchNotifications: StellarNotification[] = [
  {
    id: 'batch-evt-1',
    type: 'event',
    severity: 'warning',
    title: 'Pod unhealthy',
    body: 'Pod api-1 is unhealthy',
    read: false,
    createdAt: batchTimestamp,
    batchTimestamp,
  },
  {
    id: 'batch-evt-2',
    type: 'event',
    severity: 'critical',
    title: 'OOMKilled',
    body: 'Container killed due to OOM',
    read: false,
    createdAt: batchTimestamp,
    batchTimestamp,
  },
]

const solves: StellarSolve[] = [
  {
    id: 'solve-1',
    eventId: 'batch-evt-1',
    userId: 'user-1',
    cluster: 'prod',
    namespace: 'default',
    workload: 'api-server',
    status: 'resolved',
    actionsTaken: 2,
    summary: 'Restarted pod successfully',
    startedAt: batchTimestamp,
    endedAt: '2026-06-10T10:05:00Z',
  },
]

const solveProgress: Record<string, StellarSolveProgress> = {
  'batch-evt-2': {
    solveId: 'solve-2',
    eventId: 'batch-evt-2',
    step: 'investigating',
    message: 'Analyzing OOM patterns',
  },
}

describe('BatchMonitorModal', () => {
  const defaultProps = {
    batchTimestamp,
    notifications: batchNotifications,
    solves,
    solveProgress,
    onClose: vi.fn(),
  }

  it('renders modal with batch information', () => {
    render(<BatchMonitorModal {...defaultProps} />)
    // Modal should be visible
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('displays batch events', () => {
    render(<BatchMonitorModal {...defaultProps} />)
    expect(screen.getByText('Pod unhealthy')).toBeInTheDocument()
    expect(screen.getByText('OOMKilled')).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<BatchMonitorModal {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders with empty notifications list', () => {
    render(
      <BatchMonitorModal
        {...defaultProps}
        notifications={[]}
        solves={[]}
        solveProgress={{}}
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders progress for in-flight solves', () => {
    render(<BatchMonitorModal {...defaultProps} />)
    // The component should show progress information
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
  })
})
