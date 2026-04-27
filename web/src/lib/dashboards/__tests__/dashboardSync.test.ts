import { describe, it, expect, vi, beforeEach} from 'vitest'

// Mock the api module
const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('../../api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    put: (...args: unknown[]) => mockApiPut(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}))

vi.mock('../../constants', () => ({
  STORAGE_KEY_TOKEN: 'auth-token',
}))

// Import after mocks
import { dashboardSync } from '../dashboardSync'
import type { BackendDashboard, BackendCard } from '../dashboardSync'

describe('DashboardSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    dashboardSync.clearCache()
  })

  describe('isAuthenticated', () => {
    it('returns false when no token in localStorage', () => {
      expect(dashboardSync.isAuthenticated()).toBe(false)
    })

    it('returns true when token exists in localStorage', () => {
      localStorage.setItem('auth-token', 'some-jwt-token')
      expect(dashboardSync.isAuthenticated()).toBe(true)
    })
  })

  describe('getOrCreateDashboard', () => {
    it('returns null when not authenticated', async () => {
      const result = await dashboardSync.getOrCreateDashboard('test-dashboard')
      expect(result).toBeNull()
    })

    it('fetches dashboard by name when authenticated', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'test-dashboard',
        is_default: false,
        created_at: '2026-01-01',
      }
      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })

      const result = await dashboardSync.getOrCreateDashboard('test-dashboard')
      expect(result).toEqual(mockDashboard)
    })

    it('creates dashboard when not found', async () => {
      localStorage.setItem('auth-token', 'token')
      const newDashboard: BackendDashboard = {
        id: 'dash-new',
        user_id: 'user-1',
        name: 'test-dashboard',
        is_default: false,
        created_at: '2026-01-01',
      }
      mockApiGet.mockResolvedValueOnce({ data: [] })
      mockApiPost.mockResolvedValueOnce({ data: newDashboard })

      const result = await dashboardSync.getOrCreateDashboard('test-dashboard')
      expect(result).toEqual(newDashboard)
      expect(mockApiPost).toHaveBeenCalledWith('/api/dashboards', {
        name: 'test-dashboard',
        is_default: false,
      })
    })

    it('caches dashboard after first fetch', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'test-dashboard',
        is_default: false,
        created_at: '2026-01-01',
      }
      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })

      await dashboardSync.getOrCreateDashboard('test-dashboard')
      const cached = await dashboardSync.getOrCreateDashboard('test-dashboard')

      expect(cached).toEqual(mockDashboard)
      // Only one API call (second used cache)
      expect(mockApiGet).toHaveBeenCalledTimes(1)
    })

    it('returns null on API error', async () => {
      localStorage.setItem('auth-token', 'token')
      mockApiGet.mockRejectedValueOnce(new Error('Network error'))

      const result = await dashboardSync.getOrCreateDashboard('test-dashboard')
      expect(result).toBeNull()
    })
  })

  describe('fetchCards', () => {
    it('returns null when not authenticated', async () => {
      const result = await dashboardSync.fetchCards('test-key')
      expect(result).toBeNull()
    })

    it('returns parsed frontend cards', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'test-key',
        is_default: false,
        created_at: '2026-01-01',
      }
      const mockCards: BackendCard[] = [
        {
          id: 'card-1',
          dashboard_id: 'dash-1',
          card_type: 'cluster_health',
          config: '{"showGraph":true}',
          position: '{"w":4,"h":2}',
          created_at: '2026-01-01',
        },
      ]

      mockApiGet
        .mockResolvedValueOnce({ data: [mockDashboard] }) // getOrCreateDashboard
        .mockResolvedValueOnce({ data: { dashboard: mockDashboard, cards: mockCards } }) // fetchCards

      const result = await dashboardSync.fetchCards('test-key')
      expect(result).toHaveLength(1)
      expect(result![0].id).toBe('card-1')
      expect(result![0].card_type).toBe('cluster_health')
      expect(result![0].config).toEqual({ showGraph: true })
      expect(result![0].position).toEqual({ w: 4, h: 2 })
    })

    it('handles invalid config JSON gracefully', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'test-key',
        is_default: false,
        created_at: '2026-01-01',
      }
      const mockCards: BackendCard[] = [
        {
          id: 'card-1',
          dashboard_id: 'dash-1',
          card_type: 'cluster_health',
          config: '{invalid json',
          position: '{invalid json',
          created_at: '2026-01-01',
        },
      ]

      mockApiGet
        .mockResolvedValueOnce({ data: [mockDashboard] })
        .mockResolvedValueOnce({ data: { dashboard: mockDashboard, cards: mockCards } })

      const result = await dashboardSync.fetchCards('test-key')
      expect(result).toHaveLength(1)
      // Should fall back to defaults
      expect(result![0].config).toEqual({})
      expect(result![0].position).toEqual({ w: 4, h: 2 })
    })

    it('returns null on API error', async () => {
      localStorage.setItem('auth-token', 'token')
      mockApiGet.mockRejectedValueOnce(new Error('Fetch error'))

      const result = await dashboardSync.fetchCards('test-key')
      expect(result).toBeNull()
    })
  })

  describe('saveCards', () => {
    it('does nothing when not authenticated', () => {
      dashboardSync.saveCards('test-key', [])
      // Should not call API
      expect(mockApiGet).not.toHaveBeenCalled()
    })
  })

  describe('fullSync', () => {
    it('returns empty array when fetch returns empty (#7254)', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'test-key',
        is_default: false,
        created_at: '2026-01-01',
      }

      mockApiGet
        .mockResolvedValueOnce({ data: [mockDashboard] })
        .mockResolvedValueOnce({ data: { dashboard: mockDashboard, cards: [] } })

      const result = await dashboardSync.fullSync('test-key')
      // #7254 — Empty array means the backend dashboard has zero cards.
      // fullSync now returns [] (not null) and clears localStorage to match.
      expect(result).toEqual([])
    })

    it('updates localStorage with backend data', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'test-key',
        is_default: false,
        created_at: '2026-01-01',
      }
      const mockCards: BackendCard[] = [
        {
          id: 'card-1',
          dashboard_id: 'dash-1',
          card_type: 'pod_issues',
          config: '{}',
          position: '{"w":6,"h":3}',
          created_at: '2026-01-01',
        },
      ]

      mockApiGet
        .mockResolvedValueOnce({ data: [mockDashboard] })
        .mockResolvedValueOnce({ data: { dashboard: mockDashboard, cards: mockCards } })

      const result = await dashboardSync.fullSync('test-key')
      expect(result).toHaveLength(1)
      expect(localStorage.getItem('test-key')).toBeTruthy()
      const stored = JSON.parse(localStorage.getItem('test-key')!)
      expect(stored[0].card_type).toBe('pod_issues')
    })
  })

  describe('clearCache', () => {
    it('clears internal caches', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'test',
        is_default: false,
        created_at: '2026-01-01',
      }
      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })
      await dashboardSync.getOrCreateDashboard('test')

      // Clear cache
      dashboardSync.clearCache()

      // Next call should fetch from API again (not use cache)
      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })
      await dashboardSync.getOrCreateDashboard('test')
      expect(mockApiGet).toHaveBeenCalledTimes(2)
    })
  })

  describe('saveCards with debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('triggers sync after debounce delay when authenticated', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'save-test',
        is_default: false,
        created_at: '2026-01-01',
      }

      // Pre-cache the dashboard
      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })
      await dashboardSync.getOrCreateDashboard('save-test')

      // Set up mocks for syncCardsToBackend
      mockApiGet.mockResolvedValueOnce({
        data: { dashboard: mockDashboard, cards: [] },
      })

      const cards = [
        { id: 'card-1', card_type: 'cluster_health', config: {}, position: { w: 4, h: 2 } },
      ]

      dashboardSync.saveCards('save-test', cards)

      // Before debounce fires, no API call for sync
      expect(mockApiGet).toHaveBeenCalledTimes(1) // only the getOrCreate call

      // Advance past debounce delay (1000ms)
      await vi.advanceTimersByTimeAsync(1100)

      // Now sync should have been called
      expect(mockApiGet).toHaveBeenCalledTimes(2) // getOrCreate + fetchCards in sync
    })
  })

  describe('syncCardsToBackend', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('creates new cards that are not in backend', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'sync-create',
        is_default: false,
        created_at: '2026-01-01',
      }

      // Pre-cache
      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })
      await dashboardSync.getOrCreateDashboard('sync-create')

      // syncCardsToBackend fetches current cards from backend (empty)
      mockApiGet.mockResolvedValueOnce({
        data: { dashboard: mockDashboard, cards: [] },
      })
      // Post for creating new card
      mockApiPost.mockResolvedValueOnce({ data: {} })

      const cards = [
        { id: 'new-uuid-card', card_type: 'gpu_usage', config: { showGraph: true }, position: { w: 6, h: 3 } },
      ]

      dashboardSync.saveCards('sync-create', cards)
      await vi.advanceTimersByTimeAsync(1100)

      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/dashboards/dash-1/cards',
        expect.objectContaining({ card_type: 'gpu_usage' })
      )
    })

    it('updates existing cards', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'sync-update',
        is_default: false,
        created_at: '2026-01-01',
      }

      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })
      await dashboardSync.getOrCreateDashboard('sync-update')

      const existingCard: BackendCard = {
        id: 'card-1',
        dashboard_id: 'dash-1',
        card_type: 'cluster_health',
        config: '{}',
        position: '{"w":4,"h":2}',
        created_at: '2026-01-01',
      }

      // syncCardsToBackend fetches current cards
      mockApiGet.mockResolvedValueOnce({
        data: { dashboard: mockDashboard, cards: [existingCard] },
      })
      mockApiPut.mockResolvedValueOnce({ data: {} })

      const cards = [
        { id: 'card-1', card_type: 'cluster_health', config: { updated: true }, position: { w: 8, h: 4 } },
      ]

      dashboardSync.saveCards('sync-update', cards)
      await vi.advanceTimersByTimeAsync(1100)

      expect(mockApiPut).toHaveBeenCalledWith(
        '/api/cards/card-1',
        expect.objectContaining({ card_type: 'cluster_health', config: { updated: true } })
      )
    })

    it('deletes cards that are in backend but not in frontend', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'sync-delete',
        is_default: false,
        created_at: '2026-01-01',
      }

      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })
      await dashboardSync.getOrCreateDashboard('sync-delete')

      const backendCard: BackendCard = {
        id: 'card-to-delete',
        dashboard_id: 'dash-1',
        card_type: 'old_card',
        config: '{}',
        position: '{"w":4,"h":2}',
        created_at: '2026-01-01',
      }

      mockApiGet.mockResolvedValueOnce({
        data: { dashboard: mockDashboard, cards: [backendCard] },
      })
      mockApiDelete.mockResolvedValueOnce({})

      // Frontend has no cards — backend card should be deleted
      dashboardSync.saveCards('sync-delete', [])
      await vi.advanceTimersByTimeAsync(1100)

      expect(mockApiDelete).toHaveBeenCalledWith('/api/cards/card-to-delete')
    })

    it('skips creating cards with default- prefix', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'sync-skip-default',
        is_default: false,
        created_at: '2026-01-01',
      }

      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })
      await dashboardSync.getOrCreateDashboard('sync-skip-default')

      mockApiGet.mockResolvedValueOnce({
        data: { dashboard: mockDashboard, cards: [] },
      })

      const cards = [
        { id: 'default-card-1', card_type: 'cluster_health', config: {}, position: { w: 4, h: 2 } },
      ]

      dashboardSync.saveCards('sync-skip-default', cards)
      await vi.advanceTimersByTimeAsync(1100)

      // Should NOT call post for default-prefixed cards
      expect(mockApiPost).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/dashboards/'),
        expect.anything()
      )
    })

    it('skips sync when already in progress', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'sync-concurrent',
        is_default: false,
        created_at: '2026-01-01',
      }

      mockApiGet.mockResolvedValueOnce({ data: [mockDashboard] })
      await dashboardSync.getOrCreateDashboard('sync-concurrent')

      // Make the first sync hang by never resolving
      let resolveFirst: (v: unknown) => void
      const hangingPromise = new Promise(r => { resolveFirst = r })
      mockApiGet.mockReturnValueOnce(hangingPromise)

      dashboardSync.saveCards('sync-concurrent', [])
      // Trigger first debounce
      await vi.advanceTimersByTimeAsync(1100)

      // Now fire a second saveCards — debounce triggers sync again
      dashboardSync.saveCards('sync-concurrent', [])
      await vi.advanceTimersByTimeAsync(1100)

      // Only one API call should be pending (the second was skipped)
      // Cleanup hanging promise
      resolveFirst!({ data: { dashboard: mockDashboard, cards: [] } })
    })
  })

  describe('fullSync edge cases', () => {
    it('returns null and does not touch localStorage when fetch fails', async () => {
      localStorage.setItem('auth-token', 'token')
      localStorage.setItem('test-key-fail', '["old-data"]')
      mockApiGet.mockRejectedValueOnce(new Error('Network fail'))

      const result = await dashboardSync.fullSync('test-key-fail')
      expect(result).toBeNull()
      // localStorage should be untouched
      expect(localStorage.getItem('test-key-fail')).toBe('["old-data"]')
    })

    it('clears localStorage when backend returns empty cards (#7254)', async () => {
      localStorage.setItem('auth-token', 'token')
      localStorage.setItem('test-key-empty', '[{"old":"card"}]')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'test-key-empty',
        is_default: false,
        created_at: '2026-01-01',
      }

      mockApiGet
        .mockResolvedValueOnce({ data: [mockDashboard] })
        .mockResolvedValueOnce({ data: { dashboard: mockDashboard, cards: [] } })

      const result = await dashboardSync.fullSync('test-key-empty')
      expect(result).toEqual([])
      expect(localStorage.getItem('test-key-empty')).toBe('[]')
    })
  })

  describe('fetchCards edge cases', () => {
    it('handles cards with null/undefined config and position', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'null-config-key',
        is_default: false,
        created_at: '2026-01-01',
      }
      const mockCards: BackendCard[] = [
        {
          id: 'card-1',
          dashboard_id: 'dash-1',
          card_type: 'test_card',
          config: undefined as unknown as string,
          position: undefined as unknown as string,
          created_at: '2026-01-01',
        },
      ]

      mockApiGet
        .mockResolvedValueOnce({ data: [mockDashboard] })
        .mockResolvedValueOnce({ data: { dashboard: mockDashboard, cards: mockCards } })

      const result = await dashboardSync.fetchCards('null-config-key')
      expect(result).toHaveLength(1)
      expect(result![0].config).toEqual({})
      expect(result![0].position).toEqual({ w: 4, h: 2 })
    })

    it('handles position with partial fields', async () => {
      localStorage.setItem('auth-token', 'token')
      const mockDashboard: BackendDashboard = {
        id: 'dash-1',
        user_id: 'user-1',
        name: 'partial-pos',
        is_default: false,
        created_at: '2026-01-01',
      }
      const mockCards: BackendCard[] = [
        {
          id: 'card-1',
          dashboard_id: 'dash-1',
          card_type: 'test_card',
          config: '{"key":"val"}',
          position: '{"x":0}',
          created_at: '2026-01-01',
        },
      ]

      mockApiGet
        .mockResolvedValueOnce({ data: [mockDashboard] })
        .mockResolvedValueOnce({ data: { dashboard: mockDashboard, cards: mockCards } })

      const result = await dashboardSync.fetchCards('partial-pos')
      expect(result).toHaveLength(1)
      // w and h should fall back to defaults (4, 2)
      expect(result![0].position).toEqual({ w: 4, h: 2 })
      expect(result![0].config).toEqual({ key: 'val' })
    })
  })
})
