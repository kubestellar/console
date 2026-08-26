import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DynamicCard } from '../DynamicCard'
import type { DynamicCardDefinition } from '../../../lib/dynamic-cards/types'
import './DynamicCard.test.setup'

const mockGetDynamicCard = vi.fn()
vi.mock('../../../lib/dynamic-cards/dynamicCardRegistry', () => ({
  getDynamicCard: (...args) => mockGetDynamicCard(...args),
}))

describe('DynamicCard', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    mockUseCardData.mockReturnValue(makeUseCardDataReturn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows missing-config error when config is undefined', () => {
    // @ts-expect-error intentional
    render(<DynamicCard config={undefined} />)
    expect(screen.getByText('dynamicCard.missingConfig')).toBeInTheDocument()
  })

  it('shows missing-config error when dynamicCardId is empty string', () => {
    render(<DynamicCard config={{ dynamicCardId: '' }} />)
    expect(screen.getByText('dynamicCard.missingConfig')).toBeInTheDocument()
  })

  it('shows not-found error when getDynamicCard returns undefined', () => {
    mockGetDynamicCard.mockReturnValue(undefined)
    render(<DynamicCard config={{ dynamicCardId: 'ghost-card' }} />)
    expect(screen.getByText('dynamicCard.notFound')).toBeInTheDocument()
  })

  it('renders Tier1CardRuntime inside error boundary for tier1 definition', () => {
    mockGetDynamicCard.mockReturnValue(makeT1Definition())
    mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'Alpha' }]))
    render(<DynamicCard config={{ dynamicCardId: 'card-t1' }} />)
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument()
  })

  it('shows invalid-definition error when tier1 card has no cardDefinition', () => {
    mockGetDynamicCard.mockReturnValue(makeT1Definition({ cardDefinition: undefined }))
    render(<DynamicCard config={{ dynamicCardId: 'card-t1' }} />)
    expect(screen.getByText('dynamicCard.invalidDefinition')).toBeInTheDocument()
  })

  it('shows invalid-definition error when tier2 card has no sourceCode', () => {
    mockGetDynamicCard.mockReturnValue(makeT2Definition({ sourceCode: undefined }))
    render(<DynamicCard config={{ dynamicCardId: 'card-t2' }} />)
    expect(screen.getByText('dynamicCard.invalidDefinition')).toBeInTheDocument()
  })

  it('passes safeConfig to Tier2CardRuntime', async () => {
    mockGetDynamicCard.mockReturnValue(makeT2Definition())
    const mockCleanup = vi.fn()
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: () => <div>T2 rendered</div>,
      cleanup: mockCleanup,
      error: false,
    })
    await act(async () => {
      render(<DynamicCard config={{ dynamicCardId: 'card-t2', extra: true }} />)
    })
    await waitFor(() => expect(screen.getByText('T2 rendered')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Tier1CardRuntime
// ---------------------------------------------------------------------------

describe('Tier1CardRuntime', () => {
