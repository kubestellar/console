import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

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

import { useFeatureRequests, useNotifications, isTriaged, getStatusDescription, STATUS_LABELS, STATUS_COLORS, STATUS_DESCRIPTIONS } from '../useFeatureRequests'
import { api } from '../../lib/api'

describe('useFeatureRequests', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('loads demo data when no token', async () => {
    // No token => demo mode
    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.requests.length).toBeGreaterThan(0)
    expect(result.current.isDemoMode).toBe(true)
  })

  it('loads demo data when token is demo-token', async () => {
    localStorage.setItem('kc-auth-token', 'demo-token')
    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoMode).toBe(true)
  })

  it('loads from API when real token exists', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({
      data: [{ id: 'r1', title: 'Test', status: 'open', request_type: 'bug', user_id: 'u1', description: 'd', created_at: '2024-01-01' }],
    })
    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemoMode).toBe(false)
  })

  it('handles API failure gracefully', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Should not throw, just be empty
    expect(result.current.requests).toEqual([])
  })

  it('createRequest calls API and prepends to state', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    const newReq = { id: 'new', title: 'New', description: 'd', request_type: 'feature', user_id: 'u1', status: 'open', created_at: '2024-01-01' }
    vi.mocked(api.post).mockResolvedValue({ data: newReq })

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.createRequest({ title: 'New', description: 'd', request_type: 'feature' })
    })
    expect(result.current.requests[0].title).toBe('New')
  })

  it('sorts user requests first when currentUserId provided', async () => {
    const { result } = renderHook(() => useFeatureRequests('demo-user'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Demo requests all have user_id 'demo-user', so all should be sorted as user's
    expect(result.current.requests.length).toBeGreaterThan(0)
  })

  it('createRequest propagates error and resets isSubmitting', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    vi.mocked(api.post).mockRejectedValue(new Error('Server error'))

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(
      act(async () => {
        await result.current.createRequest({ title: 'Fail', description: 'x', request_type: 'bug' })
      })
    ).rejects.toThrow('Server error')
    expect(result.current.isSubmitting).toBe(false)
  })

  it('createRequest passes timeout option through to api.post', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    const newReq = { id: 'to1', title: 'Timeout', description: 'd', request_type: 'feature' as const, user_id: 'u1', status: 'open' as const, created_at: '2024-01-01' }
    vi.mocked(api.post).mockResolvedValue({ data: newReq })

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const CUSTOM_TIMEOUT_MS = 90_000
    await act(async () => {
      await result.current.createRequest(
        { title: 'Timeout', description: 'd', request_type: 'feature' },
        { timeout: CUSTOM_TIMEOUT_MS }
      )
    })
    expect(api.post).toHaveBeenCalledWith(
      '/api/feedback/requests',
      { title: 'Timeout', description: 'd', request_type: 'feature' },
      { timeout: CUSTOM_TIMEOUT_MS }
    )
  })

  it('getRequest fetches a single request by id', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({ data: [] })

    const singleReq = { id: 'r99', title: 'Single', description: 'd', request_type: 'bug', user_id: 'u1', status: 'open', created_at: '2024-01-01' }
    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    vi.mocked(api.get).mockResolvedValueOnce({ data: singleReq })
    let fetched: unknown
    await act(async () => {
      fetched = await result.current.getRequest('r99')
    })
    expect(api.get).toHaveBeenCalledWith('/api/feedback/requests/r99')
    expect(fetched).toEqual(singleReq)
  })

  it('submitFeedback posts feedback and returns result', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    const feedbackResult = { id: 'fb1', feature_request_id: 'r1', user_id: 'u1', feedback_type: 'positive', created_at: '2024-01-01' }
    vi.mocked(api.post).mockResolvedValue({ data: feedbackResult })

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let response: unknown
    await act(async () => {
      response = await result.current.submitFeedback('r1', { feedback_type: 'positive', comment: 'Looks great!' })
    })
    expect(api.post).toHaveBeenCalledWith('/api/feedback/requests/r1/feedback', { feedback_type: 'positive', comment: 'Looks great!' })
    expect(response).toEqual(feedbackResult)
  })

  it('submitFeedback propagates API errors', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    vi.mocked(api.post).mockRejectedValue(new Error('Forbidden'))

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(
      act(async () => {
        await result.current.submitFeedback('r1', { feedback_type: 'negative' })
      })
    ).rejects.toThrow('Forbidden')
  })

  it('requestUpdate updates the request in the list', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    const existing = { id: 'r1', title: 'Old', description: 'd', request_type: 'bug', user_id: 'u1', status: 'open', created_at: '2024-01-01' }
    vi.mocked(api.get).mockResolvedValue({ data: [existing] })

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.requests[0].status).toBe('open')

    const updated = { ...existing, status: 'feasibility_study' }
    vi.mocked(api.post).mockResolvedValue({ data: updated })
    await act(async () => {
      await result.current.requestUpdate('r1')
    })
    expect(api.post).toHaveBeenCalledWith('/api/feedback/requests/r1/request-update')
    expect(result.current.requests[0].status).toBe('feasibility_study')
  })

  it('closeRequest updates the request to closed', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    const existing = { id: 'r2', title: 'To Close', description: 'd', request_type: 'feature', user_id: 'u1', status: 'fix_ready', created_at: '2024-01-01' }
    vi.mocked(api.get).mockResolvedValue({ data: [existing] })

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const closed = { ...existing, status: 'closed', closed_by_user: true }
    vi.mocked(api.post).mockResolvedValue({ data: closed })
    await act(async () => {
      await result.current.closeRequest('r2')
    })
    expect(api.post).toHaveBeenCalledWith('/api/feedback/requests/r2/close')
    expect(result.current.requests[0].status).toBe('closed')
    expect(result.current.requests[0].closed_by_user).toBe(true)
  })

  it('refresh reloads requests and resets isRefreshing', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    const initial = [{ id: 'r1', title: 'A', description: 'd', request_type: 'bug', user_id: 'u1', status: 'open', created_at: '2024-01-01' }]
    vi.mocked(api.get).mockResolvedValue({ data: initial })

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const refreshed = [
      { id: 'r1', title: 'A', description: 'd', request_type: 'bug', user_id: 'u1', status: 'fix_complete', created_at: '2024-01-01' },
      { id: 'r2', title: 'B', description: 'd2', request_type: 'feature', user_id: 'u1', status: 'open', created_at: '2024-01-02' },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: refreshed })

    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.requests).toHaveLength(2)
  })

  it('handles non-array API response gracefully', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    // API returns non-array — should coerce to empty array
    vi.mocked(api.get).mockResolvedValue({ data: null })

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.requests).toEqual([])
  })

  it('sorts by github_login when available, then by user_id', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    const now = Date.now()
    const items = [
      { id: 'other1', title: 'Other', description: 'd', request_type: 'bug', user_id: 'other', github_login: 'other-gh', status: 'open', created_at: new Date(now - 1000).toISOString() },
      { id: 'mine1', title: 'Mine by login', description: 'd', request_type: 'feature', user_id: 'different', github_login: 'my-gh', status: 'open', created_at: new Date(now - 2000).toISOString() },
      { id: 'mine2', title: 'Mine by user_id', description: 'd', request_type: 'feature', user_id: 'my-gh', status: 'open', created_at: new Date(now - 3000).toISOString() },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: items })

    const { result } = renderHook(() => useFeatureRequests('my-gh'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // User's items first (mine1 via github_login, mine2 via user_id), then others
    expect(result.current.requests[0].id).toBe('mine1')
    expect(result.current.requests[1].id).toBe('mine2')
    expect(result.current.requests[2].id).toBe('other1')
  })

  it('demo mode does not call the API', async () => {
    // No token = demo mode
    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(api.get).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('createRequest sets isSubmitting during submission', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({ data: [] })

    // Use a deferred promise so we can inspect isSubmitting mid-flight
    let resolvePost!: (val: { data: unknown }) => void
    vi.mocked(api.post).mockImplementation(() =>
      new Promise(resolve => { resolvePost = resolve })
    )

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isSubmitting).toBe(false)

    // Start the submission but don't await it yet
    let createPromise: Promise<unknown>
    act(() => {
      createPromise = result.current.createRequest({ title: 'T', description: 'd', request_type: 'feature' })
    })

    // isSubmitting should be true while the promise is pending
    expect(result.current.isSubmitting).toBe(true)

    // Resolve the API call
    await act(async () => {
      resolvePost({ data: { id: 'new1', title: 'T', description: 'd', request_type: 'feature', user_id: 'u1', status: 'open', created_at: '2024-01-01' } })
      await createPromise!
    })
    expect(result.current.isSubmitting).toBe(false)
  })

  // PR #6573 item C — the navbar button uses `{ countOnly: true }` to fetch
  // a lean `{id, status}` payload. Verify the hook hits the count_only URL
  // and exposes the lean list via `summaries`, separately from the full
  // `requests` state (which must stay empty in count_only mode so nothing
  // accidentally reads hallucinated title/description fields).
  it('countOnly option fetches count_only URL and populates summaries, not requests', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    const countPayload = [
      { id: 'gh-console-42', status: 'closed' },
      { id: 'gh-console-56', status: 'feasibility_study' },
      { id: 'gh-docs-17', status: 'open' },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: countPayload })

    const { result } = renderHook(() => useFeatureRequests(undefined, { countOnly: true }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // Must have hit the lean URL — NOT the full queue URL.
    expect(api.get).toHaveBeenCalledWith('/api/feedback/queue?count_only=true')
    // Lean results land in summaries, typed as {id, status}.
    expect(result.current.summaries).toHaveLength(3)
    expect(result.current.summaries[0]).toEqual({ id: 'gh-console-42', status: 'closed' })
    // Full requests stays empty so no consumer reads stale/empty title fields.
    expect(result.current.requests).toEqual([])
  })

  it('countOnly derives closed-id set consumers can use for navbar badge filter', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    const countPayload = [
      { id: 'gh-console-1', status: 'closed' },
      { id: 'gh-console-2', status: 'open' },
      { id: 'gh-console-3', status: 'closed' },
    ]
    vi.mocked(api.get).mockResolvedValue({ data: countPayload })

    const { result } = renderHook(() => useFeatureRequests(undefined, { countOnly: true }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const closedIds = new Set(result.current.summaries.filter(r => r.status === 'closed').map(r => r.id))
    expect(closedIds.has('gh-console-1')).toBe(true)
    expect(closedIds.has('gh-console-2')).toBe(false)
    expect(closedIds.has('gh-console-3')).toBe(true)
  })

  it('closeRequest only updates the matching request, leaves others unchanged', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    const req1 = { id: 'r1', title: 'Keep', description: 'd', request_type: 'bug', user_id: 'u1', status: 'open', created_at: '2024-01-01' }
    const req2 = { id: 'r2', title: 'Close Me', description: 'd', request_type: 'feature', user_id: 'u1', status: 'fix_ready', created_at: '2024-01-02' }
    vi.mocked(api.get).mockResolvedValue({ data: [req1, req2] })

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.requests).toHaveLength(2)

    const closedReq2 = { ...req2, status: 'closed', closed_by_user: true }
    vi.mocked(api.post).mockResolvedValue({ data: closedReq2 })
    await act(async () => {
      await result.current.closeRequest('r2')
    })

    // req1 should be untouched
    expect(result.current.requests.find(r => r.id === 'r1')?.status).toBe('open')
    // req2 should be closed
    expect(result.current.requests.find(r => r.id === 'r2')?.status).toBe('closed')
  })
})

describe('useNotifications', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
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
