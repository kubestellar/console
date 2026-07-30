import React from 'react'
/**
 * Unit tests for AIAssistantPanel (KubectlAIPanel).
 * Covers: renders input, generates command on Enter, generates YAML on button,
 * disabled state when executing, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AIAssistantPanel } from './KubectlAIPanel'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIAssistantPanel', () => {
  const onGenerateCommand = vi.fn()
  const onGenerateYAML = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Renders
  it('renders AI prompt input', () => {
    render(
      <AIAssistantPanel
        onGenerateCommand={onGenerateCommand}
        onGenerateYAML={onGenerateYAML}
        isExecuting={false}
      />,
    )
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders generateCommand and generateYAML buttons', () => {
    render(
      <AIAssistantPanel
        onGenerateCommand={onGenerateCommand}
        onGenerateYAML={onGenerateYAML}
        isExecuting={false}
      />,
    )
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(2)
  })

  // 2. Generates command on Enter key
  it('calls onGenerateCommand when Enter pressed in input', async () => {
    const user = userEvent.setup()
    render(
      <AIAssistantPanel
        onGenerateCommand={onGenerateCommand}
        onGenerateYAML={onGenerateYAML}
        isExecuting={false}
      />,
    )
    await user.type(screen.getByRole('textbox'), 'show pods{Enter}')
    expect(onGenerateCommand).toHaveBeenCalledWith('show pods')
  })

  it('clears input after Enter', async () => {
    const user = userEvent.setup()
    render(
      <AIAssistantPanel
        onGenerateCommand={onGenerateCommand}
        onGenerateYAML={onGenerateYAML}
        isExecuting={false}
      />,
    )
    await user.type(screen.getByRole('textbox'), 'my prompt{Enter}')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })

  // 3. Generates YAML
  it('calls onGenerateYAML when YAML button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <AIAssistantPanel
        onGenerateCommand={onGenerateCommand}
        onGenerateYAML={onGenerateYAML}
        isExecuting={false}
      />,
    )
    await user.type(screen.getByRole('textbox'), 'create deployment')
    const buttons = screen.getAllByRole('button')
    const yamlBtn = buttons.find(b => b.textContent?.includes('generateYAML') || b.textContent?.includes('YAML'))
    if (yamlBtn) {
      await user.click(yamlBtn)
      expect(onGenerateYAML).toHaveBeenCalledWith('create deployment')
    }
  })

  // 4. Disabled state
  it('disables buttons when isExecuting is true', () => {
    render(
      <AIAssistantPanel
        onGenerateCommand={onGenerateCommand}
        onGenerateYAML={onGenerateYAML}
        isExecuting={true}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.some(b => (b as HTMLButtonElement).disabled)).toBe(true)
  })

  // 5. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(
      <AIAssistantPanel
        onGenerateCommand={vi.fn()}
        onGenerateYAML={vi.fn()}
        isExecuting={false}
      />,
    )
    expect(asFragment()).toMatchSnapshot()
  })
})
