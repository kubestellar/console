import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecommendedTasksPanel } from '../RecommendedTasksPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel(
  createTask: (...args: unknown[]) => Promise<unknown> = vi.fn(() => Promise.resolve()),
) {
  return render(<RecommendedTasksPanel createTask={createTask} />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RecommendedTasksPanel', () => {
  it('renders the panel title', () => {
    renderPanel()
    // t('stellar.recommendedTasks.stellarSuggests') returns the key in test env
    expect(screen.getByText('stellar.recommendedTasks.stellarSuggests')).toBeTruthy()
  })

  it('renders recommendation cards from the built-in list', () => {
    renderPanel()
    // The component renders RECOMMENDATIONS (8 items) from its hardcoded constant.
    // At least the first item's title key should appear.
    expect(screen.getByText('stellar.recommendedTasks.items.auditRbac.title')).toBeTruthy()
  })

  it('shows category label for security recommendations', () => {
    renderPanel()
    // t('stellar.recommendedTasks.categories.security') returns the key
    expect(screen.getAllByText('stellar.recommendedTasks.categories.security').length).toBeGreaterThan(0)
  })

  it('expands a recommendation when its title is clicked', () => {
    renderPanel()
    const title = screen.getByText('stellar.recommendedTasks.items.auditRbac.title')
    fireEvent.click(title)
    // After expanding, the blurb text should appear
    expect(screen.getByText('stellar.recommendedTasks.items.auditRbac.blurb')).toBeTruthy()
  })

  it('shows schedule buttons when a recommendation is expanded', () => {
    renderPanel()
    fireEvent.click(screen.getByText('stellar.recommendedTasks.items.auditRbac.title'))
    // t('stellar.recommendedTasks.schedule.doNow') returns the key
    expect(screen.getByText('stellar.recommendedTasks.schedule.doNow')).toBeTruthy()
    expect(screen.getByText('stellar.recommendedTasks.schedule.inOneHour')).toBeTruthy()
    expect(screen.getByText('stellar.recommendedTasks.schedule.tomorrow')).toBeTruthy()
  })

  it('calls createTask when a schedule button is clicked', async () => {
    const createTask = vi.fn(() => Promise.resolve())
    renderPanel(createTask)
    fireEvent.click(screen.getByText('stellar.recommendedTasks.items.auditRbac.title'))
    fireEvent.click(screen.getByText('stellar.recommendedTasks.schedule.doNow'))
    expect(createTask).toHaveBeenCalledTimes(1)
  })

  it('collapses and re-expands the panel when the header is clicked', () => {
    renderPanel()
    const header = screen.getByText('stellar.recommendedTasks.stellarSuggests')
    // Initially expanded — recommendations visible
    expect(screen.getByText('stellar.recommendedTasks.items.auditRbac.title')).toBeTruthy()
    // Collapse
    fireEvent.click(header)
    expect(screen.queryByText('stellar.recommendedTasks.items.auditRbac.title')).not.toBeInTheDocument()
    // Re-expand
    fireEvent.click(header)
    expect(screen.getByText('stellar.recommendedTasks.items.auditRbac.title')).toBeTruthy()
  })

  it('shows the count of remaining recommendations in the badge', () => {
    renderPanel()
    // The badge shows total RECOMMENDATIONS.length (8) initially
    expect(screen.getByText('8')).toBeTruthy()
  })
})
