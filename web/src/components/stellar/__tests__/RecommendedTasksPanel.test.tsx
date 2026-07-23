import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecommendedTasksPanel } from '../RecommendedTasksPanel'
import type { RecommendedTasksPanelProps } from '../RecommendedTasksPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel(overrides: Partial<RecommendedTasksPanelProps> = {}) {
  const defaults: RecommendedTasksPanelProps = {
    recommendations: [],
    onSchedule: vi.fn(),
    onDismiss: vi.fn(),
  }
  return render(<RecommendedTasksPanel {...defaults} {...overrides} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RecommendedTasksPanel', () => {
  it('renders the panel title', () => {
    renderPanel()
    expect(screen.getByText('stellar.recommendedTasks.title')).toBeTruthy()
  })

  it('shows empty state when no recommendations are provided', () => {
    renderPanel({ recommendations: [] })
    expect(screen.getByText('stellar.recommendedTasks.noTasksAvailable')).toBeTruthy()
  })

  it('renders recommendation cards when recommendations are provided', () => {
    const recommendations = [
      {
        id: 'rec-1',
        category: 'security' as const,
        icon: 'Shield',
        titleKey: 'stellar.recommendedTasks.task.enableRBAC',
        blurbKey: 'stellar.recommendedTasks.task.enableRBACBlurb',
        priority: 2,
        estimatedMinutes: 30,
      },
      {
        id: 'rec-2',
        category: 'observability' as const,
        icon: 'BarChart3',
        titleKey: 'stellar.recommendedTasks.task.setupMetrics',
        blurbKey: 'stellar.recommendedTasks.task.setupMetricsBlurb',
        priority: 3,
        estimatedMinutes: 45,
      },
    ]
    renderPanel({ recommendations })
    expect(screen.getByText('stellar.recommendedTasks.task.enableRBAC')).toBeTruthy()
    expect(screen.getByText('stellar.recommendedTasks.task.setupMetrics')).toBeTruthy()
  })

  it('groups recommendations by priority', () => {
    const recommendations = [
      {
        id: 'rec-1',
        category: 'security' as const,
        icon: 'Shield',
        titleKey: 'stellar.recommendedTasks.task.highPriority',
        blurbKey: 'stellar.recommendedTasks.task.highPriorityBlurb',
        priority: 1,
        estimatedMinutes: 30,
      },
      {
        id: 'rec-2',
        category: 'best-practices' as const,
        icon: 'FileText',
        titleKey: 'stellar.recommendedTasks.task.lowPriority',
        blurbKey: 'stellar.recommendedTasks.task.lowPriorityBlurb',
        priority: 5,
        estimatedMinutes: 45,
      },
    ]
    renderPanel({ recommendations })
    expect(screen.getByText('stellar.recommendedTasks.priority.critical')).toBeTruthy()
    expect(screen.getByText('stellar.recommendedTasks.priority.low')).toBeTruthy()
  })

  it('calls onSchedule when a recommendation is scheduled', () => {
    const onSchedule = vi.fn()
    const recommendations = [
      {
        id: 'rec-1',
        category: 'security' as const,
        icon: 'Shield',
        titleKey: 'stellar.recommendedTasks.task.enableRBAC',
        blurbKey: 'stellar.recommendedTasks.task.enableRBACBlurb',
        priority: 2,
        estimatedMinutes: 30,
      },
    ]
    renderPanel({ recommendations, onSchedule })
    const scheduleButton = screen.getByText('stellar.recommendedTasks.schedule.doNow')
    fireEvent.click(scheduleButton)
    expect(onSchedule).toHaveBeenCalledWith('rec-1', expect.any(Number))
  })

  it('calls onDismiss when a recommendation is dismissed', () => {
    const onDismiss = vi.fn()
    const recommendations = [
      {
        id: 'rec-1',
        category: 'security' as const,
        icon: 'Shield',
        titleKey: 'stellar.recommendedTasks.task.enableRBAC',
        blurbKey: 'stellar.recommendedTasks.task.enableRBACBlurb',
        priority: 2,
        estimatedMinutes: 30,
      },
    ]
    renderPanel({ recommendations, onDismiss })
    const dismissButton = screen.getByLabelText('stellar.recommendedTasks.dismiss')
    fireEvent.click(dismissButton)
    expect(onDismiss).toHaveBeenCalledWith('rec-1')
  })

  it('shows estimated time for each recommendation', () => {
    const recommendations = [
      {
        id: 'rec-1',
        category: 'security' as const,
        icon: 'Shield',
        titleKey: 'stellar.recommendedTasks.task.enableRBAC',
        blurbKey: 'stellar.recommendedTasks.task.enableRBACBlurb',
        priority: 2,
        estimatedMinutes: 30,
      },
    ]
    renderPanel({ recommendations })
    expect(screen.getByText('stellar.recommendedTasks.estimatedTime')).toBeTruthy()
  })

  it('displays category badges for recommendations', () => {
    const recommendations = [
      {
        id: 'rec-1',
        category: 'security' as const,
        icon: 'Shield',
        titleKey: 'stellar.recommendedTasks.task.enableRBAC',
        blurbKey: 'stellar.recommendedTasks.task.enableRBACBlurb',
        priority: 2,
        estimatedMinutes: 30,
      },
    ]
    renderPanel({ recommendations })
    expect(screen.getByText('stellar.recommendedTasks.category.security')).toBeTruthy()
  })

  it('expands recommendation details when clicked', () => {
    const recommendations = [
      {
        id: 'rec-1',
        category: 'security' as const,
        icon: 'Shield',
        titleKey: 'stellar.recommendedTasks.task.enableRBAC',
        blurbKey: 'stellar.recommendedTasks.task.enableRBACBlurb',
        priority: 2,
        estimatedMinutes: 30,
      },
    ]
    renderPanel({ recommendations })
    const card = screen.getByText('stellar.recommendedTasks.task.enableRBAC')
    fireEvent.click(card)
    expect(screen.getByText('stellar.recommendedTasks.task.enableRBACBlurb')).toBeTruthy()
  })

  it('shows schedule options when scheduling a task', () => {
    const recommendations = [
      {
        id: 'rec-1',
        category: 'security' as const,
        icon: 'Shield',
        titleKey: 'stellar.recommendedTasks.task.enableRBAC',
        blurbKey: 'stellar.recommendedTasks.task.enableRBACBlurb',
        priority: 2,
        estimatedMinutes: 30,
      },
    ]
    renderPanel({ recommendations })
    const scheduleButton = screen.getByText('stellar.recommendedTasks.schedule.doNow')
    fireEvent.click(scheduleButton)
    expect(screen.getByText('stellar.recommendedTasks.schedule.inOneHour')).toBeTruthy()
    expect(screen.getByText('stellar.recommendedTasks.schedule.tomorrow')).toBeTruthy()
  })
})
