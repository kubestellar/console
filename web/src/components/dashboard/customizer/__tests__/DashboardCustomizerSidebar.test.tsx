/**
 * Tests for DashboardCustomizerSidebar component.
 *
 * Covers:
 * - Renders all navigation items from CUSTOMIZER_NAV
 * - Highlights active section
 * - Calls onSectionChange when an item is clicked
 * - Shows divider before items that have dividerBefore
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardCustomizerSidebar } from '../DashboardCustomizerSidebar'
import { CUSTOMIZER_NAV } from '../customizerNav'

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: (string | undefined | false | null)[]) => (args || []).filter(Boolean).join(' '),
}))

describe('DashboardCustomizerSidebar', () => {
  it('renders all navigation items', () => {
    render(
      <DashboardCustomizerSidebar activeSection="cards" onSectionChange={vi.fn()} />
    )

    for (const item of CUSTOMIZER_NAV) {
      expect(screen.getByText(item.label)).toBeTruthy()
    }
  })

  it('renders each item as a button', () => {
    render(
      <DashboardCustomizerSidebar activeSection="cards" onSectionChange={vi.fn()} />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(CUSTOMIZER_NAV.length)
  })

  it('calls onSectionChange when an item is clicked', () => {
    const onSectionChange = vi.fn()
    render(
      <DashboardCustomizerSidebar activeSection="cards" onSectionChange={onSectionChange} />
    )

    fireEvent.click(screen.getByText('Manage Dashboards'))
    expect(onSectionChange).toHaveBeenCalledWith('dashboards')
  })

  it('calls onSectionChange with correct section for each item', () => {
    const onSectionChange = vi.fn()
    render(
      <DashboardCustomizerSidebar activeSection="cards" onSectionChange={onSectionChange} />
    )

    for (const item of CUSTOMIZER_NAV) {
      fireEvent.click(screen.getByText(item.label))
      expect(onSectionChange).toHaveBeenCalledWith(item.id)
    }
  })

  it('applies active styling to the active section', () => {
    const { container } = render(
      <DashboardCustomizerSidebar activeSection="collections" onSectionChange={vi.fn()} />
    )

    // The active button should have the purple styling class
    const buttons = container.querySelectorAll('button')
    const activeButton = Array.from(buttons).find(b => b.textContent?.includes('Add Card Collections'))
    expect(activeButton?.className).toContain('purple')
  })

  it('renders dividers before items with dividerBefore', () => {
    const { container } = render(
      <DashboardCustomizerSidebar activeSection="cards" onSectionChange={vi.fn()} />
    )

    const hasDividerItems = CUSTOMIZER_NAV.filter(item => item.dividerBefore)
    expect(hasDividerItems.length).toBeGreaterThan(0)

    // Check that divider elements exist in the DOM
    const dividers = container.querySelectorAll('.border-t')
    expect(dividers.length).toBeGreaterThanOrEqual(hasDividerItems.length)
  })
})
