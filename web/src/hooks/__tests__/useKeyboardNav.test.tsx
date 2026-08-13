import React from 'react'
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useKeyboardNav, useTabKeyboardNav } from '../useKeyboardNav'

// Test harness string constants for i18n
const TEST_STRINGS = {
  trigger: 'Trigger',
  first: 'First',
  second: 'Second',
  third: 'Third',
  overview: 'Overview',
  details: 'Details',
  history: 'History',
  overviewPanel: 'Overview panel',
  detailsPanel: 'Details panel',
  historyPanel: 'History panel',
} as const

function DropdownHarness({ onSelect }: { onSelect: (value: string) => void }) {
  const nav = useKeyboardNav({ selector: '[role="option"]:not([disabled])', orientation: 'vertical' })

  return (
    <div>
      <button type="button">{TEST_STRINGS.trigger}</button>
      <div ref={nav.containerRef} role="listbox" onKeyDown={nav.handleKeyDown}>
        <button role="option" type="button" onClick={() => onSelect('first')}>{TEST_STRINGS.first}</button>
        <button role="option" type="button" onClick={() => onSelect('second')}>{TEST_STRINGS.second}</button>
        <button role="option" type="button" onClick={() => onSelect('third')}>{TEST_STRINGS.third}</button>
      </div>
    </div>
  )
}

function TabsHarness() {
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'history'>('overview')
  const { tabListProps, getTabProps, getTabPanelProps } = useTabKeyboardNav({
    tabs: ['overview', 'details', 'history'] as const,
    activeTab,
    onChange: setActiveTab,
  })

  return (
    <div>
      <div {...tabListProps}>
        <button {...getTabProps('overview')}>{TEST_STRINGS.overview}</button>
        <button {...getTabProps('details')}>{TEST_STRINGS.details}</button>
        <button {...getTabProps('history')}>{TEST_STRINGS.history}</button>
      </div>
      {activeTab === 'overview' && <div {...getTabPanelProps('overview')}>{TEST_STRINGS.overviewPanel}</div>}
      {activeTab === 'details' && <div {...getTabPanelProps('details')}>{TEST_STRINGS.detailsPanel}</div>}
      {activeTab === 'history' && <div {...getTabPanelProps('history')}>{TEST_STRINGS.historyPanel}</div>}
    </div>
  )
}

describe('useKeyboardNav', () => {
  it('supports Home, End, and Enter on dropdown options', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<DropdownHarness onSelect={onSelect} />)

    const first = screen.getByRole('option', { name: 'First' })
    first.focus()

    await user.keyboard('{End}')
    expect(screen.getByRole('option', { name: 'Third' })).toHaveFocus()

    await user.keyboard('{Home}')
    expect(screen.getByRole('option', { name: 'First' })).toHaveFocus()

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('second')
  })
})

describe('useTabKeyboardNav', () => {
  it('supports arrow key navigation between tabs', async () => {
    const user = userEvent.setup()

    render(<TabsHarness />)

    const overviewTab = screen.getByRole('tab', { name: 'Overview' })
    overviewTab.focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'History' })).toHaveFocus()
    expect(screen.getByText('History panel')).toBeInTheDocument()
  })
})
