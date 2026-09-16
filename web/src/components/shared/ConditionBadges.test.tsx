import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  ConditionBadges,
  getConditionStyle,
  hasConditionIssues,
  getConditionIssuesSummary,
  type Condition,
} from './ConditionBadges'

describe('ConditionBadges', () => {
  it('renders a badge for each condition with type and status text', () => {
    const conditions: Condition[] = [
      { type: 'Ready', status: 'True' },
      { type: 'DiskPressure', status: 'False' },
    ]
    render(<ConditionBadges conditions={conditions} />)

    expect(screen.getByText('Ready: True')).toBeVisible()
    expect(screen.getByText('DiskPressure: False')).toBeVisible()
  })

  it('uses the condition message or reason as the badge title', () => {
    const conditions: Condition[] = [
      { type: 'Ready', status: 'False', reason: 'NodeNotReady', message: 'node is unreachable' },
    ]
    render(<ConditionBadges conditions={conditions} />)

    expect(screen.getByText('Ready: False')).toHaveAttribute('title', 'node is unreachable')
  })

  it('applies the provided className to the wrapping container', () => {
    const { container } = render(
      <ConditionBadges conditions={[{ type: 'Ready', status: 'True' }]} className="custom-wrap" />
    )
    expect(container.firstElementChild).toHaveClass('custom-wrap')
  })
})

describe('getConditionStyle', () => {
  it('marks Ready=True as green', () => {
    expect(getConditionStyle({ type: 'Ready', status: 'True' })).toContain('bg-green-500/20')
  })

  it('marks Ready=False as red', () => {
    expect(getConditionStyle({ type: 'Ready', status: 'False' })).toContain('bg-red-500/20')
  })

  it('marks a pressure condition True as orange', () => {
    expect(getConditionStyle({ type: 'MemoryPressure', status: 'True' })).toContain('bg-orange-500/20')
  })

  it('marks a pressure condition Unknown as yellow', () => {
    expect(getConditionStyle({ type: 'DiskPressure', status: 'Unknown' })).toContain('bg-yellow-500/20')
  })

  it('marks a pressure condition False and any other condition as muted', () => {
    expect(getConditionStyle({ type: 'DiskPressure', status: 'False' })).toContain('bg-secondary')
    expect(getConditionStyle({ type: 'CustomCondition', status: 'True' })).toContain('bg-secondary')
  })
})

describe('hasConditionIssues', () => {
  it('returns false when all conditions are healthy', () => {
    expect(hasConditionIssues([
      { type: 'Ready', status: 'True' },
      { type: 'DiskPressure', status: 'False' },
    ])).toBe(false)
  })

  it('returns true when Ready is not True', () => {
    expect(hasConditionIssues([{ type: 'Ready', status: 'False' }])).toBe(true)
  })

  it('returns true when a pressure condition is True or Unknown', () => {
    expect(hasConditionIssues([{ type: 'MemoryPressure', status: 'True' }])).toBe(true)
    expect(hasConditionIssues([{ type: 'PIDPressure', status: 'Unknown' }])).toBe(true)
  })
})

describe('getConditionIssuesSummary', () => {
  it('summarizes issue conditions with their message', () => {
    const summary = getConditionIssuesSummary([
      { type: 'Ready', status: 'False', message: 'kubelet not posting status' },
    ])
    expect(summary).toBe('Ready: False - kubelet not posting status')
  })

  it('joins multiple issues with a comma', () => {
    const summary = getConditionIssuesSummary([
      { type: 'Ready', status: 'False' },
      { type: 'DiskPressure', status: 'True' },
    ])
    expect(summary).toBe('Ready: False, DiskPressure: True')
  })

  it('falls back to "Unknown issues" when there are no matching conditions', () => {
    expect(getConditionIssuesSummary([{ type: 'Ready', status: 'True' }])).toBe('Unknown issues')
  })
})
