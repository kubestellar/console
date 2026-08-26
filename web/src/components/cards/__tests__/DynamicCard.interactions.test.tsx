import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tier1CardRuntime, Tier2CardRuntime } from '../DynamicCard'
import type { DynamicCardDefinition_T1 } from '../../../lib/dynamic-cards/types'
import { BASE_T1_DEF, makeT1Definition, makeT2Definition, makeUseCardDataReturn, mockCompileCardCode, mockCreateCardComponent, mockUseCardData } from './dynamic-card/testUtils'

describe('DynamicCard interactions', () => {
  const definition = makeT1Definition()

  beforeEach(() => {
    vi.restoreAllMocks()
    mockUseCardData.mockReturnValue(makeUseCardDataReturn())
  })

  it('renders search input and updates search', async () => {
    const setSearch = vi.fn()
    mockUseCardData.mockReturnValue({ ...makeUseCardDataReturn([]), filters: { search: '', setSearch } })
    render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
    await userEvent.type(screen.getByRole('textbox'), 'abc')
    expect(setSearch).toHaveBeenCalled()
  })

  it('hides search input for stats-only layout', () => {
    const def: DynamicCardDefinition_T1 = { ...BASE_T1_DEF, layout: 'stats', stats: [] }
    render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('renders pagination only when needed', () => {
    const { rerender } = render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    mockUseCardData.mockReturnValue({ ...makeUseCardDataReturn([{ name: 'A' }]), needsPagination: true, totalPages: 3, currentPage: 1 })
    rerender(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
    expect(screen.getByTestId('pagination')).toBeInTheDocument()
  })

  it('calls cleanup on tier2 unmount', async () => {
    const cleanup = vi.fn()
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({ component: () => <div>OK</div>, cleanup, error: false })
    let unmount!: () => void
    await act(async () => { ({ unmount } = render(<Tier2CardRuntime definition={makeT2Definition()} />)) })
    await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument())
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('passes config into compiled tier2 component', async () => {
    const ReceivedConfig = vi.fn(({ config }: { config: Record<string, unknown> }) => <div data-testid="cfg">{JSON.stringify(config)}</div>)
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({ component: ReceivedConfig, cleanup: vi.fn(), error: false })
    await act(async () => { render(<Tier2CardRuntime definition={makeT2Definition()} config={{ mode: 'dark', limit: 5 }} />) })
    await waitFor(() => expect(screen.getByTestId('cfg').textContent).toContain('"mode":"dark"'))
  })
})
