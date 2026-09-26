import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CardFactoryTemplates, T1_SAMPLE_DATA_JSON } from './CardFactoryTemplates'

const saveDynamicCard = vi.fn()
const registerDynamicCardType = vi.fn()

vi.mock('../../lib/dynamic-cards', () => ({
  saveDynamicCard: (...args: unknown[]) => saveDynamicCard(...args),
}))

vi.mock('../cards/cardRegistry', () => ({
  registerDynamicCardType: (...args: unknown[]) => registerDynamicCardType(...args),
}))

vi.mock('../../lib/ai/prompts', () => ({
  CARD_INLINE_ASSIST_PROMPT: 'prompt',
}))

vi.mock('../../lib/ai/sampleData', () => ({
  generateSampleData: () => [],
}))

vi.mock('./LivePreviewPanel', () => ({
  LivePreviewPanel: ({ title }: { title: string }) => <div data-testid="live-preview">{title}</div>,
}))

vi.mock('./InlineAIAssist', () => ({
  InlineAIAssist: () => <div data-testid="inline-ai-assist" />,
}))

vi.mock('./cardFactoryPreviews', () => ({
  TemplateDropdown: () => <div data-testid="template-dropdown" />,
}))

vi.mock('./FieldSuggestChips', () => ({
  FieldSuggestChips: () => <div data-testid="field-suggest-chips" />,
}))

describe('CardFactoryTemplates Component', () => {
  it('exports CardFactoryTemplates component', () => {
    expect(CardFactoryTemplates).toBeDefined()
    expect(typeof CardFactoryTemplates).toBe('function')
  })

  it('disables the create button until a title is entered', () => {
    render(<CardFactoryTemplates onSaveMessage={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'dashboard.cardFactory.createCard' })).toBeDisabled()
  })

  it('enables the create button once a title is entered', () => {
    render(<CardFactoryTemplates onSaveMessage={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('dashboard.cardFactory.titlePlaceholder'), {
      target: { value: 'My Card' },
    })

    expect(screen.getByRole('button', { name: 'dashboard.cardFactory.createCard' })).toBeEnabled()
  })

  it('adds a new blank column when "add column" is clicked', () => {
    render(<CardFactoryTemplates onSaveMessage={vi.fn()} />)

    const fieldInputsBefore = screen.getAllByPlaceholderText('dashboard.cardFactory.fieldPlaceholder')
    fireEvent.click(screen.getByRole('button', { name: /dashboard.cardFactory.addColumn/ }))
    const fieldInputsAfter = screen.getAllByPlaceholderText('dashboard.cardFactory.fieldPlaceholder')

    expect(fieldInputsAfter.length).toBe(fieldInputsBefore.length + 1)
  })

  it('labels each icon-only remove-column button for screen readers', () => {
    render(<CardFactoryTemplates onSaveMessage={vi.fn()} />)

    const fieldInputsBefore = screen.getAllByPlaceholderText('dashboard.cardFactory.fieldPlaceholder')
    const removeButtons = screen.getAllByRole('button', { name: /dashboard.cardFactory.removeColumn/ })
    expect(removeButtons.length).toBe(fieldInputsBefore.length)

    fireEvent.click(removeButtons[0])
    const fieldInputsAfter = screen.getAllByPlaceholderText('dashboard.cardFactory.fieldPlaceholder')
    expect(fieldInputsAfter.length).toBe(fieldInputsBefore.length - 1)
  })

  it('shows an error message and does not save when the data JSON is invalid', () => {
    const onSaveMessage = vi.fn()
    const { container } = render(<CardFactoryTemplates onSaveMessage={onSaveMessage} />)

    fireEvent.change(screen.getByPlaceholderText('dashboard.cardFactory.titlePlaceholder'), {
      target: { value: 'My Card' },
    })
    const dataTextArea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(dataTextArea.value).toBe(T1_SAMPLE_DATA_JSON)
    fireEvent.change(dataTextArea, { target: { value: 'not json' } })
    fireEvent.click(screen.getByRole('button', { name: 'dashboard.cardFactory.createCard' }))

    expect(onSaveMessage).toHaveBeenCalledWith('Invalid JSON data.')
    expect(saveDynamicCard).not.toHaveBeenCalled()
  })

  it('saves the card and calls onCardCreated when valid', () => {
    const onCardCreated = vi.fn()
    const onSaveMessage = vi.fn()
    render(<CardFactoryTemplates onCardCreated={onCardCreated} onSaveMessage={onSaveMessage} />)

    fireEvent.change(screen.getByPlaceholderText('dashboard.cardFactory.titlePlaceholder'), {
      target: { value: 'My Card' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'dashboard.cardFactory.createCard' }))

    expect(saveDynamicCard).toHaveBeenCalledTimes(1)
    expect(registerDynamicCardType).toHaveBeenCalledTimes(1)
    expect(onSaveMessage).toHaveBeenCalledWith('Card "My Card" created!')
    expect(onCardCreated).toHaveBeenCalledTimes(1)
  })
})
