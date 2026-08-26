import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { DynamicCard, Tier1CardRuntime } from '../DynamicCard'
import type { DynamicCardDefinition_T1 } from '../../../lib/dynamic-cards/types'
import { BASE_T1_DEF, makeT1Definition, makeT2Definition, makeUseCardDataReturn, mockCompileCardCode, mockCreateCardComponent, mockGetDynamicCard, mockUseCardData } from './dynamic-card/testUtils'

describe('DynamicCard rendering', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockUseCardData.mockReturnValue(makeUseCardDataReturn())
  })

  it('shows missing config error when config is undefined', () => {
    // @ts-expect-error intentional
    render(<DynamicCard config={undefined} />)
    expect(screen.getByText('dynamicCard.missingConfig')).toBeInTheDocument()
  })

  it('shows not found error when card registry misses definition', () => {
    mockGetDynamicCard.mockReturnValue(undefined)
    render(<DynamicCard config={{ dynamicCardId: 'ghost-card' }} />)
    expect(screen.getByText('dynamicCard.notFound')).toBeInTheDocument()
  })

  it('renders tier1 card inside error boundary', () => {
    mockGetDynamicCard.mockReturnValue(makeT1Definition())
    mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'Alpha' }]))
    render(<DynamicCard config={{ dynamicCardId: 'card-t1' }} />)
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument()
  })

  it('passes config to tier2 runtime', async () => {
    mockGetDynamicCard.mockReturnValue(makeT2Definition())
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({ component: () => <div>T2 rendered</div>, cleanup: vi.fn(), error: false })
    await act(async () => { render(<DynamicCard config={{ dynamicCardId: 'card-t2', extra: true }} />) })
    await waitFor(() => expect(screen.getByText('T2 rendered')).toBeInTheDocument())
  })
})

describe('Tier1CardRuntime rendering', () => {
  const definition = makeT1Definition()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardData.mockReturnValue(makeUseCardDataReturn())
  })

  it('shows invalid config when cardDefinition is null', () => {
    // @ts-expect-error intentional
    render(<Tier1CardRuntime definition={definition} cardDefinition={null} />)
    expect(screen.getByText('dynamicCard.invalidCardConfig')).toBeInTheDocument()
  })

  it('renders list rows and header labels', () => {
    mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'Alpha' }, { name: 'Beta' }]))
    render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('shows empty messages for empty items', () => {
    mockUseCardData.mockReturnValue(makeUseCardDataReturn([]))
    const { rerender } = render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
    expect(screen.getByText('Nothing here.')).toBeInTheDocument()
    const def: DynamicCardDefinition_T1 = { ...BASE_T1_DEF, emptyMessage: undefined }
    rerender(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
    expect(screen.getByText('dynamicCard.noDataAvailable')).toBeInTheDocument()
  })

  it('renders stats and stats-and-list layouts', () => {
    const statsDef: DynamicCardDefinition_T1 = { ...BASE_T1_DEF, layout: 'stats', stats: [{ label: 'Total', value: 'count:', color: 'text-green-400' }] }
    mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'X' }, { name: 'Y' }]))
    const { rerender } = render(<Tier1CardRuntime definition={definition} cardDefinition={statsDef} />)
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    const bothDef: DynamicCardDefinition_T1 = { ...BASE_T1_DEF, layout: 'stats-and-list', stats: [{ label: 'Count', value: 'count:' }] }
    rerender(<Tier1CardRuntime definition={definition} cardDefinition={bothDef} />)
    expect(screen.getByText('Count')).toBeInTheDocument()
    expect(screen.getByText('X')).toBeInTheDocument()
  })

  it('renders badges and aligned compact grid', () => {
    const def: DynamicCardDefinition_T1 = { ...BASE_T1_DEF, columns: [{ field: 'name', label: 'Name' }, { field: 'status', label: 'Status', format: 'badge', badgeColors: { Healthy: 'bg-green-500/20 text-green-300' } }], staticData: [{ name: 'Alpha', status: 'Healthy' }] }
    mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'Alpha', status: 'Healthy' }]))
    render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
    expect(screen.getByText('Healthy').className).toContain('bg-green-500/20')
    expect(screen.getByTestId('dynamic-card-list-grid')).toHaveStyle({ gridTemplateColumns: 'minmax(0, 1fr) fit-content(8rem)' })
  })
})
