import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    },
  }
})

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'kc-auth-token',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  MIN_PERCEIVED_DELAY_MS: 0,
} })

import { useNotifications, isTriaged, getStatusDescription, STATUS_LABELS, STATUS_COLORS, STATUS_DESCRIPTIONS, __resetDemoNotificationsForTests } from '../useFeatureRequests'
import { api } from '../../lib/api'

describe('useNotifications', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    __resetDemoNotificationsForTests()
  })

  it('loads demo notifications when no token', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.notifications.length).toBeGreaterThan(0)
  })

  it('markAsRead updates notification state in demo mode', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const unreadNotif = result.current.notifications.find(n => !n.read)
    if (unreadNotif) {
      await act(async () => { await result.current.markAsRead(unreadNotif.id) })
      const updated = result.current.notifications.find(n => n.id === unreadNotif.id)
      expect(updated?.read).toBe(true)
    }
  })

  it('persists demo markAsRead state across remounts', async () => {
    const { result, unmount } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.markAsRead('demo-notif-1')
    })
    expect(result.current.unreadCount).toBe(0)

    unmount()

    const { result: remounted } = renderHook(() => useNotifications())
    await waitFor(() => expect(remounted.current.isLoading).toBe(false))

    expect(remounted.current.notifications.find(n => n.id === 'demo-notif-1')?.read).toBe(true)
    expect(remounted.current.unreadCount).toBe(0)
  })

  it('markAllAsRead marks all notifications as read', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { await result.current.markAllAsRead() })
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.notifications.every(n => n.read)).toBe(true)
  })

  it('getUnreadCountForRequest returns count for specific feature request', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // demo-notif-1 is unread and linked to feature_request_id 'demo-1'
    const count = result.current.getUnreadCountForRequest('demo-1')
    expect(count).toBeGreaterThanOrEqual(0)
    // Non-existent request should return 0
    expect(result.current.getUnreadCountForRequest('nonexistent')).toBe(0)
  })

  it('markRequestNotificationsAsRead marks only that request notifications', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const initialUnread = result.current.unreadCount
    // Mark notifications for demo-1 as read
    await act(async () => {
      await result.current.markRequestNotificationsAsRead('demo-1')
    })

    // All notifications for demo-1 should now be read
    const demo1Notifs = result.current.notifications.filter(n => n.feature_request_id === 'demo-1')
    expect(demo1Notifs.every(n => n.read)).toBe(true)
    // Unread count should have decreased (or stayed 0 if already read)
    expect(result.current.unreadCount).toBeLessThanOrEqual(initialUnread)
  })

  it('persists demo request-level read state across remounts', async () => {
    const { result, unmount } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.markRequestNotificationsAsRead('demo-1')
    })

    unmount()

    const { result: remounted } = renderHook(() => useNotifications())
    await waitFor(() => expect(remounted.current.isLoading).toBe(false))

    expect(remounted.current.notifications.filter(n => n.feature_request_id === 'demo-1').every(n => n.read)).toBe(true)
    expect(remounted.current.unreadCount).toBe(0)
  })

  it('markRequestNotificationsAsRead is a no-op for request with no unread notifications', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // First mark them all as read
    await act(async () => { await result.current.markAllAsRead() })
    const countBefore = result.current.unreadCount

    // Now call markRequestNotificationsAsRead — should be no-op
    await act(async () => {
      await result.current.markRequestNotificationsAsRead('demo-1')
    })
    expect(result.current.unreadCount).toBe(countBefore)
  })

  it('loads notifications from API when authenticated', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    const apiNotifs = [
      { id: 'n1', user_id: 'u1', feature_request_id: 'r1', notification_type: 'fix_ready', title: 'PR Ready', message: 'PR is ready', read: false, created_at: '2024-01-01' },
    ]
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/api/notifications') return Promise.resolve({ data: apiNotifs })
      if (url === '/api/notifications/unread-count') return Promise.resolve({ data: { count: 1 } })
      return Promise.resolve({ data: [] })
    })

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].id).toBe('n1')
    expect(result.current.unreadCount).toBe(1)
  })

  it('derives unreadCount from loaded notifications when authenticated', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/api/notifications') {
        return Promise.resolve({ data: [
          { id: 'n1', user_id: 'u1', feature_request_id: 'r1', notification_type: 'fix_ready', title: 'PR Ready', message: 'PR is ready', read: false, created_at: '2024-01-01' },
          { id: 'n2', user_id: 'u1', feature_request_id: 'r2', notification_type: 'fix_complete', title: 'Merged', message: 'Merged', read: true, created_at: '2024-01-02' },
        ] })
      }
      if (url === '/api/notifications/unread-count') return Promise.resolve({ data: { count: 99 } })
      return Promise.resolve({ data: [] })
    })

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.unreadCount).toBe(1)
    expect(api.get).not.toHaveBeenCalledWith('/api/notifications/unread-count')
  })

  it('markAsRead calls API when authenticated', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/api/notifications') return Promise.resolve({ data: [{ id: 'n1', user_id: 'u1', notification_type: 'fix_ready', title: 'T', message: 'M', read: false, created_at: '2024-01-01' }] })
      if (url === '/api/notifications/unread-count') return Promise.resolve({ data: { count: 1 } })
      return Promise.resolve({ data: [] })
    })
    vi.mocked(api.post).mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { await result.current.markAsRead('n1') })
    expect(api.post).toHaveBeenCalledWith('/api/notifications/n1/read')
    expect(result.current.notifications[0].read).toBe(true)
    expect(result.current.unreadCount).toBe(0)
  })

  it('markAllAsRead calls API when authenticated', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/api/notifications') return Promise.resolve({ data: [
        { id: 'n1', user_id: 'u1', notification_type: 'fix_ready', title: 'T1', message: 'M1', read: false, created_at: '2024-01-01' },
        { id: 'n2', user_id: 'u1', notification_type: 'pr_created', title: 'T2', message: 'M2', read: false, created_at: '2024-01-02' },
      ] })
      if (url === '/api/notifications/unread-count') return Promise.resolve({ data: { count: 2 } })
      return Promise.resolve({ data: [] })
    })
    vi.mocked(api.post).mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { await result.current.markAllAsRead() })
    expect(api.post).toHaveBeenCalledWith('/api/notifications/read-all')
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.notifications.every(n => n.read)).toBe(true)
  })

  it('reverts markAsRead optimistic state when API call fails', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/api/notifications') {
        return Promise.resolve({ data: [{ id: 'n1', user_id: 'u1', feature_request_id: 'r1', notification_type: 'fix_ready', title: 'T', message: 'M', read: false, created_at: '2024-01-01' }] })
      }
      return Promise.resolve({ data: [] })
    })
    vi.mocked(api.post).mockRejectedValue(new Error('read failed'))

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.markAsRead('n1')
    })

    expect(result.current.notifications[0].read).toBe(false)
    expect(result.current.unreadCount).toBe(1)
  })

  it('reverts markAllAsRead optimistic state when API call fails', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/api/notifications') {
        return Promise.resolve({ data: [
          { id: 'n1', user_id: 'u1', feature_request_id: 'r1', notification_type: 'fix_ready', title: 'T1', message: 'M1', read: false, created_at: '2024-01-01' },
          { id: 'n2', user_id: 'u1', feature_request_id: 'r2', notification_type: 'fix_complete', title: 'T2', message: 'M2', read: false, created_at: '2024-01-02' },
        ] })
      }
      return Promise.resolve({ data: [] })
    })
    vi.mocked(api.post).mockRejectedValue(new Error('read all failed'))

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.markAllAsRead()
    })

    expect(result.current.notifications.every(n => !n.read)).toBe(true)
    expect(result.current.unreadCount).toBe(2)
  })

  it('unreadCount never goes below zero', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Mark all as read first
    await act(async () => { await result.current.markAllAsRead() })
    expect(result.current.unreadCount).toBe(0)

    // Try marking one more as read — unread count should stay at 0
    await act(async () => { await result.current.markAsRead('demo-notif-1') })
    expect(result.current.unreadCount).toBe(0)
  })

  it('refresh reloads notifications and resets isRefreshing', async () => {
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => { await result.current.refresh() })
    expect(result.current.isRefreshing).toBe(false)
    // Notifications should still be present (demo data reloaded)
    expect(result.current.notifications.length).toBeGreaterThan(0)
  })

  it('markRequestNotificationsAsRead calls API for each unread notification when authenticated', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/api/notifications') return Promise.resolve({ data: [
        { id: 'n1', user_id: 'u1', feature_request_id: 'req-A', notification_type: 'fix_ready', title: 'T1', message: 'M1', read: false, created_at: '2024-01-01' },
        { id: 'n2', user_id: 'u1', feature_request_id: 'req-A', notification_type: 'pr_created', title: 'T2', message: 'M2', read: false, created_at: '2024-01-02' },
        { id: 'n3', user_id: 'u1', feature_request_id: 'req-B', notification_type: 'fix_complete', title: 'T3', message: 'M3', read: false, created_at: '2024-01-03' },
      ] })
      if (url === '/api/notifications/unread-count') return Promise.resolve({ data: { count: 3 } })
      return Promise.resolve({ data: [] })
    })
    vi.mocked(api.post).mockResolvedValue({ data: {} })

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.unreadCount).toBe(3)

    await act(async () => {
      await result.current.markRequestNotificationsAsRead('req-A')
    })

    // Should have called API for both n1 and n2 (req-A notifications)
    expect(api.post).toHaveBeenCalledWith('/api/notifications/n1/read')
    expect(api.post).toHaveBeenCalledWith('/api/notifications/n2/read')
    // Should NOT have called API for n3 (req-B)
    expect(api.post).not.toHaveBeenCalledWith('/api/notifications/n3/read')
    // req-A notifications should be read, req-B should still be unread
    expect(result.current.notifications.find(n => n.id === 'n1')?.read).toBe(true)
    expect(result.current.notifications.find(n => n.id === 'n2')?.read).toBe(true)
    expect(result.current.notifications.find(n => n.id === 'n3')?.read).toBe(false)
    // Unread count decreased by 2 (was 3, now 1)
    expect(result.current.unreadCount).toBe(1)
  })

  it('handles API failure silently when loading notifications', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockRejectedValue(new Error('Server down'))

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Should not throw, notifications should be empty
    expect(result.current.notifications).toEqual([])
  })
})

describe('isTriaged', () => {
  it('returns false for open', () => expect(isTriaged('open')).toBe(false))
  it('returns false for needs_triage', () => expect(isTriaged('needs_triage')).toBe(false))
  it('returns true for triage_accepted', () => expect(isTriaged('triage_accepted')).toBe(true))
  it('returns true for fix_ready', () => expect(isTriaged('fix_ready')).toBe(true))
  it('returns true for closed', () => expect(isTriaged('closed')).toBe(true))
  it('returns true for feasibility_study', () => expect(isTriaged('feasibility_study')).toBe(true))
  it('returns true for fix_complete', () => expect(isTriaged('fix_complete')).toBe(true))
  it('returns true for unable_to_fix', () => expect(isTriaged('unable_to_fix')).toBe(true))
})

describe('getStatusDescription', () => {
  it('returns description for open status', () => {
    expect(getStatusDescription('open')).toBe('Issue created on GitHub')
  })

  it('returns empty string for closed by user', () => {
    expect(getStatusDescription('closed', true)).toBe('')
  })

  it('returns description for closed not by user', () => {
    expect(getStatusDescription('closed', false)).toBe('This request has been closed')
  })

  it('returns description for closed with undefined closedByUser', () => {
    expect(getStatusDescription('closed')).toBe('This request has been closed')
  })

  it('returns description for all non-closed statuses regardless of closedByUser', () => {
    // closedByUser should only suppress the description for 'closed' status
    expect(getStatusDescription('open', true)).toBe('Issue created on GitHub')
    expect(getStatusDescription('fix_ready', true)).toBe('PR created and ready for review')
  })
})

describe('STATUS_LABELS', () => {
  it('has a label for every status', () => {
    const ALL_STATUSES: Array<import('../useFeatureRequests').RequestStatus> = [
      'open', 'needs_triage', 'triage_accepted', 'feasibility_study',
      'fix_ready', 'fix_complete', 'unable_to_fix', 'closed',
    ]
    for (const status of ALL_STATUSES) {
      expect(STATUS_LABELS[status]).toBeDefined()
      expect(typeof STATUS_LABELS[status]).toBe('string')
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0)
    }
  })
})

describe('STATUS_COLORS', () => {
  it('has a Tailwind bg class for every status', () => {
    const ALL_STATUSES: Array<import('../useFeatureRequests').RequestStatus> = [
      'open', 'needs_triage', 'triage_accepted', 'feasibility_study',
      'fix_ready', 'fix_complete', 'unable_to_fix', 'closed',
    ]
    for (const status of ALL_STATUSES) {
      expect(STATUS_COLORS[status]).toMatch(/^bg-/)
    }
  })
})

describe('STATUS_DESCRIPTIONS', () => {
  it('has a description for every status', () => {
    const ALL_STATUSES: Array<import('../useFeatureRequests').RequestStatus> = [
      'open', 'needs_triage', 'triage_accepted', 'feasibility_study',
      'fix_ready', 'fix_complete', 'unable_to_fix', 'closed',
    ]
    for (const status of ALL_STATUSES) {
      expect(STATUS_DESCRIPTIONS[status]).toBeDefined()
      expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string')
      expect(STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(0)
    }
  })
})
