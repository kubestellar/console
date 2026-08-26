import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { DynamicCard, Tier1CardRuntime, Tier2CardRuntime } from '../DynamicCard'
import { BASE_T1_DEF, makeT1Definition, makeT2Definition, makeUseCardDataReturn, mockCompileCardCode, mockCreateCardComponent, mockGetDynamicCard, mockUseCardData } from './dynamic-card/testUtils'

describe('DynamicCard error handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockUseCardData.mockReturnValue(makeUseCardDataReturn())
    vi.spyOn(localStorage, 'getItem').mockReturnValue('test-token')
  })

  it('shows invalid definition errors', () => {
    mockGetDynamicCard.mockReturnValue(makeT1Definition({ cardDefinition: undefined }))
    render(<DynamicCard config={{ dynamicCardId: 'card-t1' }} />)
    expect(screen.getByText('dynamicCard.invalidDefinition')).toBeInTheDocument()
  })

  it('shows missing endpoint for api tier1 cards', () => {
    render(<Tier1CardRuntime definition={makeT1Definition()} cardDefinition={{ ...BASE_T1_DEF, dataSource: 'api', apiEndpoint: undefined }} />)
    expect(screen.getByText('dynamicCard.missingEndpoint')).toBeInTheDocument()
  })

  it('shows skeleton and fetch failures for api cards', async () => {
    let resolveFetch!: (value: Response) => void
    global.fetch = vi.fn(() => new Promise<Response>(r => { resolveFetch = r })) as unknown as typeof fetch
    const def = { ...BASE_T1_DEF, dataSource: 'api' as const, apiEndpoint: '/api/things' }
    render(<Tier1CardRuntime definition={makeT1Definition()} cardDefinition={def} />)
    expect(screen.getByTestId('skeleton-text')).toBeInTheDocument()
    await act(async () => { resolveFetch(new Response(JSON.stringify([]), { status: 200 })) })

    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 500 })) as unknown as typeof fetch
    await act(async () => { render(<Tier1CardRuntime definition={makeT1Definition()} cardDefinition={def} />) })
    await waitFor(() => expect(screen.getByText('dynamicCard.fetchFailed')).toBeInTheDocument())
  })

  it('blocks unsafe endpoints and supports same-origin absolute urls', async () => {
    const sameOriginEndpoint = `${window.location.origin}/api/things`
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ name: 'Allowed' }]), { status: 200 })) as unknown as typeof fetch
    await act(async () => { render(<Tier1CardRuntime definition={makeT1Definition()} cardDefinition={{ ...BASE_T1_DEF, dataSource: 'api', apiEndpoint: sameOriginEndpoint }} />) })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    global.fetch = vi.fn() as unknown as typeof fetch
    await act(async () => { render(<Tier1CardRuntime definition={makeT1Definition()} cardDefinition={{ ...BASE_T1_DEF, dataSource: 'api', apiEndpoint: 'https://evil.com/steal', emptyMessage: 'Blocked endpoint' }} />) })
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled())
    expect(screen.getByText('Blocked endpoint')).toBeInTheDocument()
  })

  it('shows tier2 compile and runtime errors', async () => {
    mockCompileCardCode.mockResolvedValue({ code: null, error: 'Syntax error on line 3' })
    await act(async () => { render(<Tier2CardRuntime definition={makeT2Definition()} />) })
    await waitFor(() => expect(screen.getByText('Syntax error on line 3')).toBeInTheDocument())

    mockCompileCardCode.mockRejectedValue(new Error('Totally unexpected'))
    await act(async () => { render(<Tier2CardRuntime definition={makeT2Definition()} />) })
    await waitFor(() => expect(screen.getByText(/Unexpected error: Totally unexpected/i)).toBeInTheDocument())

    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({ component: null, cleanup: undefined, error: 'Module export missing' })
    await act(async () => { render(<Tier2CardRuntime definition={makeT2Definition()} />) })
    await waitFor(() => expect(screen.getByText('Module export missing')).toBeInTheDocument())
  })
})
