import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EventRow } from './BatchMonitorModal.parts'
import type { BatchEvent } from './BatchMonitorModal.utils'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => ({ 'stellar.batch.resolutionSteps': 'Resolution steps' }[key] ?? key),
  }),
}))

const baseEvent: BatchEvent = {
  id: 'e1',
  name: 'api-server OOMKilled',
  status: 'resolved',
  durationSeconds: 75,
  steps: [],
}

const stepsEvent: BatchEvent = {
  ...baseEvent,
  steps: [
    { name: 'Analyze', status: 'completed', output: 'found OOM', error: null },
    { name: 'Patch', status: 'failed', error: 'patch denied' },
    { name: 'Verify', status: 'pending' },
  ] as BatchEvent['steps'],
}

describe('EventRow', () => {
  it('renders name and formatted duration without expand control when no steps', () => {
    render(<EventRow event={baseEvent} />)
    expect(screen.getByText('api-server OOMKilled')).toBeInTheDocument()
    expect(screen.getByText('1m 15s')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders current step and failure reason', () => {
    render(<EventRow event={{ ...baseEvent, status: 'failed', step: 'Executing', failureReason: 'timeout' }} />)
    expect(screen.getByText('Executing')).toBeInTheDocument()
    expect(screen.getByText('timeout')).toBeInTheDocument()
  })

  it('toggles steps on click', () => {
    render(<EventRow event={stepsEvent} />)
    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Resolution steps')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Resolution steps')).toBeInTheDocument()
    expect(screen.getByText('found OOM')).toBeInTheDocument()
    expect(screen.getByText('patch denied')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('Resolution steps')).not.toBeInTheDocument()
  })

  it('toggles steps with Enter and Space keys', () => {
    render(<EventRow event={stepsEvent} />)
    const toggle = screen.getByRole('button')
    fireEvent.keyDown(toggle, { key: 'Enter' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(toggle, { key: ' ' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
