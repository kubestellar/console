import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach, act, waitFor } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tier1CardRuntime } from '../DynamicCard'
import type { DynamicCardDefinition_T1 } from '../../../lib/dynamic-cards/types'
import {
  mockUseCardData,
  BASE_T1_DEF,
  makeT1Definition,
  makeUseCardDataReturn,
} from './DynamicCard.test.shared'

// ---------------------------------------------------------------------------
// Tier1CardRuntime — validation, rendering, search, stats, badges, pagination,
//                    and API data fetching
// ---------------------------------------------------------------------------

describe('Tier1CardRuntime', () => {
  const definition = makeT1Definition()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardData.mockReturnValue(makeUseCardDataReturn())
  })

  describe('validation errors', () => {
    it('shows invalid-config when cardDefinition is null', () => {
      // @ts-expect-error intentional
      render(<Tier1CardRuntime definition={definition} cardDefinition={null} />)
      expect(screen.getByText('dynamicCard.invalidCardConfig')).toBeInTheDocument()
    })

    it('shows missing-endpoint error when dataSource=api and apiEndpoint is absent', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: undefined,
      }
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('dynamicCard.missingEndpoint')).toBeInTheDocument()
    })
  })

  describe('static data rendering', () => {
    it('renders list rows from static data via useCardData', () => {
      mockUseCardData.mockReturnValue(
        makeUseCardDataReturn([{ name: 'Alpha' }, { name: 'Beta' }])
      )
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.getByText('Beta')).toBeInTheDocument()
    })

    it('renders column header labels', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'x' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    it('shows emptyMessage when items array is empty', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByText('Nothing here.')).toBeInTheDocument()
    })

    it('shows fallback empty text when emptyMessage is not set', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([]))
      const def = { ...BASE_T1_DEF, emptyMessage: undefined }
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('dynamicCard.noDataAvailable')).toBeInTheDocument()
    })
  })

  describe('search filter', () => {
    it('renders search input for list layout', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('calls filters.setSearch when user types', async () => {
      const setSearch = vi.fn()
      mockUseCardData.mockReturnValue({
        ...makeUseCardDataReturn([]),
        filters: { search: '', setSearch },
      })
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      await userEvent.type(screen.getByRole('textbox'), 'abc')
      expect(setSearch).toHaveBeenCalled()
    })

    it('does NOT render search input for stats-only layout', () => {
      const def: DynamicCardDefinition_T1 = { ...BASE_T1_DEF, layout: 'stats', stats: [] }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('stats layout', () => {
    it('renders stat blocks for stats layout', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        layout: 'stats',
        stats: [{ label: 'Total', value: 'count:', color: 'text-green-400' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'X' }, { name: 'Y' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('Total')).toBeInTheDocument()
      // count: resolves to data.length — but data here comes from static, so 2
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('resolves field: value from first data row', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        layout: 'stats',
        stats: [{ label: 'Version', value: 'field:version' }],
        staticData: [{ name: 'A', version: 'v1.2' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'A', version: 'v1.2' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('v1.2')).toBeInTheDocument()
    })

    it('renders both stats and list for stats-and-list layout', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        layout: 'stats-and-list',
        stats: [{ label: 'Count', value: 'count:' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'X' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByText('Count')).toBeInTheDocument()
      expect(screen.getByText('X')).toBeInTheDocument()
    })
  })

  describe('badge column format', () => {
    it('renders badge span with correct color class', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        columns: [
          {
            field: 'status',
            label: 'Status',
            format: 'badge',
            badgeColors: { Healthy: 'bg-green-500/20 text-green-300' },
          },
        ],
        staticData: [{ status: 'Healthy' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ status: 'Healthy' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      const badge = screen.getByText('Healthy')
      expect(badge.className).toContain('bg-green-500/20')
    })

    it('uses a shared grid with compact badge columns so rows stay aligned after resize', () => {
      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        columns: [
          { field: 'name', label: 'Name' },
          {
            field: 'status',
            label: 'Status',
            format: 'badge',
            badgeColors: { Healthy: 'bg-green-500/20 text-green-300' },
          },
        ],
        staticData: [{ name: 'Alpha', status: 'Healthy' }],
      }
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'Alpha', status: 'Healthy' }]))

      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)

      const listGrid = screen.getByTestId('dynamic-card-list-grid')
      expect(listGrid).toHaveStyle({ gridTemplateColumns: 'minmax(0, 1fr) fit-content(8rem)' })
      expect(screen.getAllByTestId('dynamic-card-data-row')).toHaveLength(2)
      expect(screen.getByText('Healthy').className).not.toContain('shrink-0')
    })
  })

  describe('pagination', () => {
    it('renders Pagination when needsPagination=true', () => {
      mockUseCardData.mockReturnValue({
        ...makeUseCardDataReturn([{ name: 'A' }]),
        needsPagination: true,
        totalPages: 3,
        currentPage: 1,
      })
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })

    it('does NOT render Pagination when needsPagination=false', () => {
      mockUseCardData.mockReturnValue(makeUseCardDataReturn([{ name: 'A' }]))
      render(<Tier1CardRuntime definition={definition} cardDefinition={BASE_T1_DEF} />)
      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    })
  })

  describe('API data fetching', () => {
    beforeEach(() => {
      vi.spyOn(localStorage, 'getItem').mockReturnValue('test-token')
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('shows skeleton while fetching', async () => {
      let resolveFetch!: (v: Response) => void
      global.fetch = vi.fn(
        () => new Promise<Response>((r) => { resolveFetch = r })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      expect(screen.getByTestId('skeleton-text')).toBeInTheDocument()
      await waitFor(() => expect(global.fetch).toHaveBeenCalled())

      // Cleanup
      await act(async () => {
        resolveFetch(new Response(JSON.stringify([]), { status: 200 }))
      })
    })

    it('shows error state on non-ok HTTP response', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('', { status: 500 })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      await waitFor(() =>
        expect(screen.getByText('dynamicCard.fetchFailed')).toBeInTheDocument()
      )
    })

    it('shows error message from fetch rejection', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network down')) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      await waitFor(() =>
        expect(screen.getByText('Network down')).toBeInTheDocument()
      )
    })

    it('sends Authorization header when token exists', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ name: 'X' }]), { status: 200 })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/things',
          expect.objectContaining({
            headers: { Authorization: '******' },
          })
        )
      })
    })

    it('sends no Authorization header when token is absent', async () => {
      vi.spyOn(localStorage, 'getItem').mockReturnValue(null)
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), { status: 200 })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/things',
        expect.objectContaining({ headers: {} })
      )
    })

    it('normalises non-array JSON response via items key', async () => {
      const payload = { items: [{ name: 'FromItems' }] }
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 })
      ) as unknown as typeof fetch
      mockUseCardData.mockImplementation((data: unknown[]) =>
        makeUseCardDataReturn(data as Record<string, unknown>[])
      )

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: '/api/things',
      }
      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })
      await waitFor(() => {
        const callArgs = mockUseCardData.mock.calls.at(-1)?.[0]
        expect(callArgs).toEqual([{ name: 'FromItems' }])
      })
    })

    it('allows same-origin absolute apiEndpoint URLs', async () => {
      const sameOriginEndpoint = `${window.location.origin}/api/things`
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ name: 'Allowed' }]), { status: 200 })
      ) as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint: sameOriginEndpoint,
      }

      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          sameOriginEndpoint,
          expect.objectContaining({
            headers: { Authorization: '******' },
          }),
        )
      })
    })

    it.each([
      ['external https URL', 'https://evil.com/steal'],
      ['protocol-relative URL', '//evil.com/steal'],
      ['javascript URL', 'javascript:alert(1)'],
      ['data URL', 'data:text/plain,steal'],
    ])('blocks %s from being fetched', async (_label, apiEndpoint) => {
      global.fetch = vi.fn() as unknown as typeof fetch

      const def: DynamicCardDefinition_T1 = {
        ...BASE_T1_DEF,
        dataSource: 'api',
        apiEndpoint,
        emptyMessage: 'Blocked endpoint',
      }

      await act(async () => {
        render(<Tier1CardRuntime definition={definition} cardDefinition={def} />)
      })

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled()
      })
      expect(screen.getByText('Blocked endpoint')).toBeInTheDocument()
    })
  })
})
