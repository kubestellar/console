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
    it('returns null when fetch returns empty', async () => {
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
      expect(result).toBeNull()
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
})
