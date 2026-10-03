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

import { useFeatureRequests } from '../useFeatureRequests'
import { api } from '../../lib/api'

describe('useFeatureRequests', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('createRequest rewrites oversized attachment errors with a clear message', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    vi.mocked(api.post).mockRejectedValue(new Error('{"error":"Request Entity Too Large"}'))

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(
      act(async () => {
        await result.current.createRequest({ title: 'Too big', description: 'Attachment payload is too large', request_type: 'bug' })
      })
    ).rejects.toThrow('Attachments are too large to submit. Keep each video at or below 10 MB and retry with fewer or smaller files.')
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
    vi.mocked(api.patch).mockResolvedValue({ data: closed })
    await act(async () => {
      await result.current.closeRequest('r2')
    })
    expect(api.patch).toHaveBeenCalledWith('/api/feedback/r2/close', {})
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

  it('demo mode still settles to demo data when auth resolution is async', async () => {
    // No token = demo mode. The hook may perform one early read request before
    // async demo detection resolves, but it must never invoke mutating APIs and
    // must still settle to demo data.
    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.requests.length).toBeGreaterThan(0))
    expect(api.post).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('createRequest sets isSubmitting during submission', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    vi.mocked(api.get).mockResolvedValue({ data: [] })

    // Use a deferred promise so we can inspect isSubmitting mid-flight.
    // Issue 9246: `createRequest` awaits a dynamic `import('../lib/clientCtx')`
    // before calling `api.post`, so the mock (and therefore `resolvePost`) is
    // not assigned synchronously. We must wait for `api.post` to have been
    // invoked before asserting in-flight state and resolving it.
    let resolvePost: ((val: { data: unknown }) => void) | undefined
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

    // Wait for the dynamic-import chain to reach `api.post` so `resolvePost`
    // is assigned and the hook has committed `isSubmitting = true`.
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    await waitFor(() => expect(result.current.isSubmitting).toBe(true))

    // Resolve the API call
    await act(async () => {
      resolvePost!({ data: { id: 'new1', title: 'T', description: 'd', request_type: 'feature', user_id: 'u1', status: 'open', created_at: '2024-01-01' } })
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
    vi.mocked(api.patch).mockResolvedValue({ data: closedReq2 })
    await act(async () => {
      await result.current.closeRequest('r2')
    })

    // req1 should be untouched
    expect(result.current.requests.find(r => r.id === 'r1')?.status).toBe('open')
    // req2 should be closed
    expect(result.current.requests.find(r => r.id === 'r2')?.status).toBe('closed')
  })

  it('reopenRequest posts follow-up details and updates the matching request', async () => {
    localStorage.setItem('kc-auth-token', 'real-jwt-token')
    const existing = { id: 'r3', title: 'Needs another pass', description: 'd', request_type: 'bug', user_id: 'u1', status: 'fix_complete', created_at: '2024-01-01' }
    vi.mocked(api.get).mockResolvedValue({ data: [existing] })

    const { result } = renderHook(() => useFeatureRequests())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const reopened = { ...existing, status: 'triage_accepted', latest_comment: 'Still broken on my cluster.' }
    vi.mocked(api.post).mockResolvedValue({ data: reopened })
    await act(async () => {
      await result.current.reopenRequest('r3', { comment: 'Still broken on my cluster.' })
    })

    expect(api.post).toHaveBeenCalledWith(
      '/api/feedback/r3/reopen',
      { comment: 'Still broken on my cluster.' }
    )
    expect(result.current.requests.find(r => r.id === 'r3')?.status).toBe('triage_accepted')
  })
})

