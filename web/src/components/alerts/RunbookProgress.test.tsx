import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunbookProgress } from './RunbookProgress'
import type { EvidenceStepResult } from '../../lib/runbooks/types'

describe('RunbookProgress', () => {
  const makeStep = (
    overrides: Partial<EvidenceStepResult> & { stepId: string; label: string },
  ): EvidenceStepResult => ({
    status: 'pending',
    ...overrides,
  })

  it('renders title and step count', () => {
    const steps: EvidenceStepResult[] = [
      makeStep({ stepId: '1', label: 'Check pods', status: 'success' }),
      makeStep({ stepId: '2', label: 'Check services', status: 'pending' }),
    ]

    render(<RunbookProgress title="DNS Investigation" steps={steps} />)

    expect(screen.getByText('DNS Investigation')).toBeTruthy()
    expect(screen.getByText('1/2 steps')).toBeTruthy()
  })

  it('renders all step labels', () => {
    const steps: EvidenceStepResult[] = [
      makeStep({ stepId: '1', label: 'Gather events', status: 'success' }),
      makeStep({ stepId: '2', label: 'Check logs', status: 'running' }),
      makeStep({ stepId: '3', label: 'Analyze', status: 'pending' }),
    ]

    render(<RunbookProgress title="Runbook" steps={steps} />)

    expect(screen.getByText('Gather events')).toBeTruthy()
    expect(screen.getByText('Check logs')).toBeTruthy()
    expect(screen.getByText('Analyze')).toBeTruthy()
  })

  it('calculates progress correctly (completed = success + skipped + failed)', () => {
    const steps: EvidenceStepResult[] = [
      makeStep({ stepId: '1', label: 'Step 1', status: 'success' }),
      makeStep({ stepId: '2', label: 'Step 2', status: 'skipped' }),
      makeStep({ stepId: '3', label: 'Step 3', status: 'failed' }),
      makeStep({ stepId: '4', label: 'Step 4', status: 'pending' }),
    ]

    render(<RunbookProgress title="Test" steps={steps} />)

    // 3 of 4 completed = 75%
    expect(screen.getByText('3/4 steps')).toBeTruthy()
    const bar = document.querySelector('[style*="width"]')
    expect((bar as HTMLElement).style.width).toBe('75%')
  })

  it('shows duration when available', () => {
    const steps: EvidenceStepResult[] = [
      makeStep({ stepId: '1', label: 'Fast step', status: 'success', durationMs: 450 }),
      makeStep({ stepId: '2', label: 'Slow step', status: 'success', durationMs: 2500 }),
    ]

    render(<RunbookProgress title="Test" steps={steps} />)

    expect(screen.getByText('450ms')).toBeTruthy()
    expect(screen.getByText('2.5s')).toBeTruthy()
  })

  it('handles empty steps array', () => {
    render(<RunbookProgress title="Empty Runbook" steps={[]} />)

    expect(screen.getByText('Empty Runbook')).toBeTruthy()
    expect(screen.getByText('0/0 steps')).toBeTruthy()
  })
})
