/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useKeyboardNav, useTabKeyboardNav } from '../useKeyboardNav'

function DropdownHarness({ onSelect }: { onSelect: (value: string) => void }) {
  const nav = useKeyboardNav({ selector: '[role="option"]:not([disabled])', orientation: 'vertical' })

  return (
    <div>
      <button type="button">Trigger</button>
      <div ref={nav.containerRef} role="listbox" onKeyDown={nav.handleKeyDown}>
        <button role="option" type="button" onClick={() => onSelect('first')}>First</button>
        <button role="option" type="button" onClick={() => onSelect('second')}>Second</button>
        <button role="option" type="button" onClick={() => onSelect('third')}>Third</button>
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
        <button {...getTabProps('overview')}>Overview</button>
        <button {...getTabProps('details')}>Details</button>
        <button {...getTabProps('history')}>History</button>
      </div>
      {activeTab === 'overview' && <div {...getTabPanelProps('overview')}>Overview panel</div>}
      {activeTab === 'details' && <div {...getTabPanelProps('details')}>Details panel</div>}
      {activeTab === 'history' && <div {...getTabPanelProps('history')}>History panel</div>}
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
