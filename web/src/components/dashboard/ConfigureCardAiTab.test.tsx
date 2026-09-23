import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TFunction } from 'i18next'
import { ConfigureCardAiTab } from './ConfigureCardAiTab'

const translations: Record<string, string> = {
  'dashboard.configure.describePreferences': 'Describe your preferences',
  'dashboard.configure.aiPlaceholder': 'e.g. show only failing pods',
  'dashboard.configure.processing': 'Processing...',
  'dashboard.configure.applyConfiguration': 'Apply configuration',
  'dashboard.configure.appliedChanges': 'Applied changes',
}

const t = ((key: string) => translations[key] ?? key) as TFunction

describe('ConfigureCardAiTab Component', () => {
  it('disables the submit button when the prompt is empty', () => {
    render(
      <ConfigureCardAiTab
        nlPrompt=""
        isProcessing={false}
        aiChanges={[]}
        aiError={null}
        t={t}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Apply configuration' })).toBeDisabled()
  })

  it('enables the submit button once a prompt is entered', () => {
    render(
      <ConfigureCardAiTab
        nlPrompt="show only failing pods"
        isProcessing={false}
        aiChanges={[]}
        aiError={null}
        t={t}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Apply configuration' })).toBeEnabled()
  })

  it('calls onPromptChange when the textarea changes', () => {
    const onPromptChange = vi.fn()
    render(
      <ConfigureCardAiTab
        nlPrompt=""
        isProcessing={false}
        aiChanges={[]}
        aiError={null}
        t={t}
        onPromptChange={onPromptChange}
        onSubmit={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('e.g. show only failing pods'), { target: { value: 'new prompt' } })
    expect(onPromptChange).toHaveBeenCalledWith('new prompt')
  })

  it('shows a processing state and disables the textarea while processing', () => {
    render(
      <ConfigureCardAiTab
        nlPrompt="in progress"
        isProcessing
        aiChanges={[]}
        aiError={null}
        t={t}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('Processing...')).toBeVisible()
    expect(screen.getByPlaceholderText('e.g. show only failing pods')).toBeDisabled()
  })

  it('renders an error message when aiError is set', () => {
    render(
      <ConfigureCardAiTab
        nlPrompt=""
        isProcessing={false}
        aiChanges={[]}
        aiError="Something went wrong"
        t={t}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('Something went wrong')).toBeVisible()
  })

  it('renders the list of applied changes', () => {
    render(
      <ConfigureCardAiTab
        nlPrompt=""
        isProcessing={false}
        aiChanges={['Filtered by status', 'Renamed card title']}
        aiError={null}
        t={t}
        onPromptChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('Applied changes')).toBeVisible()
    expect(screen.getByText('Filtered by status')).toBeVisible()
    expect(screen.getByText('Renamed card title')).toBeVisible()
  })

  it('calls onSubmit when the submit button is clicked', () => {
    const onSubmit = vi.fn()
    render(
      <ConfigureCardAiTab
        nlPrompt="show only failing pods"
        isProcessing={false}
        aiChanges={[]}
        aiError={null}
        t={t}
        onPromptChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apply configuration' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
