import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CardFactoryCode } from './CardFactoryCode'

const compileCardCode = vi.fn()
const createCardComponent = vi.fn()
const saveDynamicCard = vi.fn()
const registerDynamicCardType = vi.fn()

vi.mock('../../lib/dynamic-cards', () => ({
  saveDynamicCard: (...args: unknown[]) => saveDynamicCard(...args),
  compileCardCode: (...args: unknown[]) => compileCardCode(...args),
  createCardComponent: (...args: unknown[]) => createCardComponent(...args),
}))

vi.mock('../cards/cardRegistry', () => ({
  registerDynamicCardType: (...args: unknown[]) => registerDynamicCardType(...args),
}))

vi.mock('../../lib/ai/prompts', () => ({
  CODE_INLINE_ASSIST_PROMPT: 'prompt',
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

describe('CardFactoryCode Component', () => {
  it('exports CardFactoryCode component', () => {
    expect(CardFactoryCode).toBeDefined()
    expect(typeof CardFactoryCode).toBe('function')
  })

  it('disables the create button until a title is entered', () => {
    render(<CardFactoryCode onSaveMessage={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'dashboard.cardFactory.createCard' })).toBeDisabled()
  })

  it('enables the create button once a title is entered', () => {
    render(<CardFactoryCode onSaveMessage={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('dashboard.cardFactory.titlePlaceholder'), {
      target: { value: 'My Card' },
    })

    expect(screen.getByRole('button', { name: 'dashboard.cardFactory.createCard' })).toBeEnabled()
  })

  it('shows a compiling status while validating the code', async () => {
    let resolveCompile: (value: { code: string }) => void = () => {}
    compileCardCode.mockReturnValue(new Promise(resolve => { resolveCompile = resolve }))
    createCardComponent.mockResolvedValue({})

    render(<CardFactoryCode onSaveMessage={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'dashboard.cardFactory.validate' }))

    expect(screen.getByText('dashboard.cardFactory.compiling')).toBeVisible()

    resolveCompile({ code: 'compiled' })
    await screen.findByText('dashboard.cardFactory.compilationSuccess')
  })

  it('shows a compile error when compilation fails', async () => {
    compileCardCode.mockResolvedValue({ error: 'Syntax error on line 4' })

    render(<CardFactoryCode onSaveMessage={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'dashboard.cardFactory.validate' }))

    expect(await screen.findByText('Syntax error on line 4')).toBeVisible()
  })

  it('shows compilation success after a valid compile', async () => {
    compileCardCode.mockResolvedValue({ code: 'compiled' })
    createCardComponent.mockResolvedValue({})

    render(<CardFactoryCode onSaveMessage={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'dashboard.cardFactory.validate' }))

    expect(await screen.findByText('dashboard.cardFactory.compilationSuccess')).toBeVisible()
  })

  it('saves the card and calls onCardCreated when the create button is clicked', async () => {
    compileCardCode.mockResolvedValue({ code: 'compiled' })
    const onCardCreated = vi.fn()
    const onSaveMessage = vi.fn()

    render(<CardFactoryCode onCardCreated={onCardCreated} onSaveMessage={onSaveMessage} />)

    fireEvent.change(screen.getByPlaceholderText('dashboard.cardFactory.titlePlaceholder'), {
      target: { value: 'My Card' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'dashboard.cardFactory.createCard' }))

    await waitFor(() => expect(onSaveMessage).toHaveBeenCalledWith('Card "My Card" created!'))
    expect(saveDynamicCard).toHaveBeenCalledTimes(1)
    expect(registerDynamicCardType).toHaveBeenCalledTimes(1)
    expect(onCardCreated).toHaveBeenCalledTimes(1)
  })
})
