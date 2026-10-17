import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SecretDataTab } from '../SecretDataTab.parts'

const dataEntries: [string, string][] = [
  ['username', 'admin'],
  ['password', 'super-secret'],
]

function renderTab(overrides: Partial<React.ComponentProps<typeof SecretDataTab>> = {}) {
  const onToggleReveal = vi.fn()
  const onCopy = vi.fn()
  const onToggleShowAll = vi.fn()
  const props: React.ComponentProps<typeof SecretDataTab> = {
    dataEntries,
    displayedData: dataEntries,
    revealedKeys: new Set<string>(),
    copiedField: null,
    showAllData: false,
    onToggleReveal,
    onCopy,
    onToggleShowAll,
    ...overrides,
  }
  render(<SecretDataTab {...props} />)
  return { onToggleReveal, onCopy, onToggleShowAll }
}

describe('SecretDataTab', () => {
  it('masks secret values by default', () => {
    renderTab()
    expect(screen.getByText('username')).toBeInTheDocument()
    expect(screen.getByText('password')).toBeInTheDocument()
    expect(screen.queryByText('admin')).not.toBeInTheDocument()
    expect(screen.queryByText('super-secret')).not.toBeInTheDocument()
    expect(screen.getAllByText('••••••••••••••••')).toHaveLength(2)
  })

  it('reveals a value only for keys present in revealedKeys', () => {
    renderTab({ revealedKeys: new Set(['username']) })
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.queryByText('super-secret')).not.toBeInTheDocument()
  })

  it('invokes onToggleReveal with the clicked key', () => {
    const { onToggleReveal } = renderTab()
    const rows = screen.getAllByRole('button')
    // First row's reveal (eye) button precedes its copy button.
    fireEvent.click(rows[0])
    expect(onToggleReveal).toHaveBeenCalledWith('username')
  })

  it('invokes onCopy with a field-prefixed key and the raw value', () => {
    const { onCopy } = renderTab()
    const rows = screen.getAllByRole('button')
    // Second button in the first row is the copy control.
    fireEvent.click(rows[1])
    expect(onCopy).toHaveBeenCalledWith('data-username', 'admin')
  })

  it('shows an empty state when there is no data', () => {
    renderTab({ dataEntries: [], displayedData: [] })
    expect(screen.getByText('No data in this Secret')).toBeInTheDocument()
  })

  it('only renders the show-more toggle when there are more than 5 entries', () => {
    renderTab()
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument()

    const many: [string, string][] = Array.from({ length: 6 }, (_, i) => [`key${i}`, `value${i}`])
    renderTab({ dataEntries: many, displayedData: many.slice(0, 5) })
    expect(screen.getByText('Show all 6 keys')).toBeInTheDocument()
  })

  it('toggles show-all label and calls onToggleShowAll', () => {
    const many: [string, string][] = Array.from({ length: 6 }, (_, i) => [`key${i}`, `value${i}`])
    const { onToggleShowAll } = renderTab({ dataEntries: many, displayedData: many, showAllData: true })
    const showLess = screen.getByText('Show less')
    fireEvent.click(showLess)
    expect(onToggleShowAll).toHaveBeenCalledTimes(1)
  })
})
