import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MissionActionPanel } from './MissionActionPanel'
import type { MissionSuggestion } from '../../hooks/useMissionSuggestions'

vi.mock('../../hooks/useSnoozedMissions', () => ({
  formatTimeRemaining: (n: number) => `${n}s`,
}))

const suggestion: MissionSuggestion = {
  id: 'suggestion-1',
  type: 'restart',
  title: 'Test Suggestion',
  description: 'A test suggestion description',
  priority: 'high',
  action: { type: 'ai', target: 'fix it', label: 'Investigate' },
  context: { details: ['detail one', 'detail two', 'detail three', 'detail four'] },
  detectedAt: Date.now(),
}

const baseProps = {
  suggestion,
  isExpanded: true,
  isProcessing: false,
  snoozeRemaining: null,
  onAction: vi.fn(),
  onRepair: vi.fn(),
  onSnooze: vi.fn(),
  onDismiss: vi.fn(),
}

describe('MissionActionPanel Component', () => {
  it('renders nothing when not expanded', () => {
    const { container } = render(<MissionActionPanel {...baseProps} isExpanded={false} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the suggestion description when expanded', () => {
    render(<MissionActionPanel {...baseProps} />)

    expect(screen.getByText('A test suggestion description')).toBeVisible()
  })

  it('shows only the first three details and a "more" count', () => {
    render(<MissionActionPanel {...baseProps} />)

    expect(screen.getByText('detail one')).toBeVisible()
    expect(screen.getByText('detail three')).toBeVisible()
    expect(screen.queryByText('detail four')).not.toBeInTheDocument()
    expect(screen.getByText('dashboard.missions.moreDetails')).toBeVisible()
  })

  it('shows the remaining snooze time when provided', () => {
    render(<MissionActionPanel {...baseProps} snoozeRemaining={30} />)

    expect(screen.getByText('dashboard.missions.snoozedFor')).toBeVisible()
  })

  it('calls onAction when the primary action button is clicked', () => {
    const onAction = vi.fn()
    render(<MissionActionPanel {...baseProps} onAction={onAction} />)

    fireEvent.click(screen.getByRole('menuitem', { name: /Investigate/ }))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('calls onRepair when the repair button is clicked', () => {
    const onRepair = vi.fn()
    render(<MissionActionPanel {...baseProps} onRepair={onRepair} />)

    fireEvent.click(screen.getByRole('menuitem', { name: /dashboard.missions.repair/ }))

    expect(onRepair).toHaveBeenCalledTimes(1)
  })

  it('disables action buttons while processing', () => {
    render(<MissionActionPanel {...baseProps} isProcessing />)

    expect(screen.getByRole('menuitem', { name: /Investigate/ })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: /dashboard.missions.repair/ })).toBeDisabled()
  })
})
