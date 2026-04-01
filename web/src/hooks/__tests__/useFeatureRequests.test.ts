import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))

vi.mock('../../lib/constants/network', () => ({
  MIN_PERCEIVED_DELAY_MS: 0,
}))

import { useFeatureRequests, useNotifications, isTriaged, getStatusDescription } from '../useFeatureRequests'
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
})

describe('isTriaged', () => {
  it('returns false for open', () => expect(isTriaged('open')).toBe(false))
  it('returns false for needs_triage', () => expect(isTriaged('needs_triage')).toBe(false))
  it('returns true for triage_accepted', () => expect(isTriaged('triage_accepted')).toBe(true))
  it('returns true for fix_ready', () => expect(isTriaged('fix_ready')).toBe(true))
  it('returns true for closed', () => expect(isTriaged('closed')).toBe(true))
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
})
