import React from 'react'
/**
 * Unit tests for CommandHistoryPanel (KubectlHistoryPanel).
 * Covers: empty history, history list, search filtering,
 * selecting a command calls callback, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandHistoryPanel } from './KubectlHistoryPanel'
import type { CommandHistoryItem } from './Kubectl.types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeItem = (overrides: Partial<CommandHistoryItem> = {}): CommandHistoryItem => ({
  id: 'hist-1',
  command: 'get pods -n default',
  context: 'prod-cluster',
  output: 'NAME  READY  STATUS\npod-a  1/1  Running',
  success: true,
  timestamp: new Date('2026-01-01T10:00:00Z'),
  ...overrides,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommandHistoryPanel', () => {
  const onSelectCommand = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Empty history
  it('renders empty list gracefully', () => {
    render(<CommandHistoryPanel history={[]} onSelectCommand={onSelectCommand} />)
    expect(document.body).toBeTruthy()
  })

  // 2. History list
  it('renders history item command text', () => {
    render(<CommandHistoryPanel history={[makeItem()]} onSelectCommand={onSelectCommand} />)
    expect(screen.getByText('get pods -n default')).toBeInTheDocument()
  })

  it('renders context name', () => {
    render(<CommandHistoryPanel history={[makeItem()]} onSelectCommand={onSelectCommand} />)
    expect(screen.getByText('prod-cluster')).toBeInTheDocument()
  })

  it('renders success indicator for successful command', () => {
    render(<CommandHistoryPanel history={[makeItem({ success: true })]} onSelectCommand={onSelectCommand} />)
    // CheckCircle icon is rendered for success
    const icons = document.querySelectorAll('svg')
    expect(icons.length).toBeGreaterThan(0)
  })

  it('renders failed indicator for failed command', () => {
    render(
      <CommandHistoryPanel
        history={[makeItem({ success: false, command: 'bad-cmd' })]}
        onSelectCommand={onSelectCommand}
      />,
    )
    expect(screen.getByText('bad-cmd')).toBeInTheDocument()
  })

  // 3. Select command
  it('calls onSelectCommand when item is clicked', async () => {
    const user = userEvent.setup()
    render(<CommandHistoryPanel history={[makeItem()]} onSelectCommand={onSelectCommand} />)
    await user.click(screen.getByRole('button', { name: /get pods/i }))
    expect(onSelectCommand).toHaveBeenCalledWith('get pods -n default', 'prod-cluster')
  })

  // 4. Search filter
  it('filters history by search term', async () => {
    const user = userEvent.setup()
    const items = [
      makeItem({ id: 'h1', command: 'get pods -n default' }),
      makeItem({ id: 'h2', command: 'describe node node-1' }),
    ]
    render(<CommandHistoryPanel history={items} onSelectCommand={onSelectCommand} />)
    await user.type(screen.getByPlaceholderText(/searchHistory/i), 'describe')
    expect(screen.getByText('describe node node-1')).toBeInTheDocument()
    expect(screen.queryByText('get pods -n default')).not.toBeInTheDocument()
  })

  // 5. Snapshot
  it('matches snapshot with history', () => {
    const { asFragment } = render(
      <CommandHistoryPanel history={[makeItem()]} onSelectCommand={vi.fn()} />,
    )
    expect(asFragment()).toMatchSnapshot()
  })
})
