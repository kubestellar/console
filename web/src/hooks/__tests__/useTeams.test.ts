// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockGetDemoMode = vi.hoisted(() => vi.fn(() => false))

vi.mock('../useDemoMode', () => ({
  getDemoMode: mockGetDemoMode,
}))

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('../../lib/api', () => ({
  api: mockApi,
}))

import { useTeams, useTeamDetail } from '../useTeams'

describe('useTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDemoMode.mockReturnValue(false)
  })

  describe('demo mode', () => {
    beforeEach(() => {
      mockGetDemoMode.mockReturnValue(true)
    })

    it('returns demo teams when in demo mode', async () => {
      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.teams.length).toBeGreaterThan(0)
      expect(result.current.error).toBeNull()
      expect(mockApi.get).not.toHaveBeenCalled()
    })

    it('createTeam adds a team locally in demo mode', async () => {
      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const initialCount = result.current.teams.length
      let created: unknown
      await act(async () => {
        created = await result.current.createTeam({ name: 'New Team', description: 'desc' })
      })

      expect(created).not.toBeNull()
      expect(result.current.teams.length).toBe(initialCount + 1)
      expect(result.current.teams[result.current.teams.length - 1].name).toBe('New Team')
    })

    it('deleteTeam removes a team locally in demo mode', async () => {
      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const firstTeamId = result.current.teams[0].id
      const initialCount = result.current.teams.length

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.deleteTeam(firstTeamId)
      })

      expect(success).toBe(true)
      expect(result.current.teams.length).toBe(initialCount - 1)
      expect(result.current.teams.find(t => t.id === firstTeamId)).toBeUndefined()
    })
  })

  describe('API mode', () => {
    it('fetches teams from API on mount', async () => {
      const mockTeams = [
        { id: '1', name: 'Team A', memberCount: 2, createdBy: 'u1', createdAt: '', updatedAt: '' },
      ]
      mockApi.get.mockResolvedValueOnce({ data: mockTeams })

      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(mockApi.get).toHaveBeenCalledWith('/api/teams')
      expect(result.current.teams).toEqual(mockTeams)
      expect(result.current.error).toBeNull()
    })

    it('sets error on API failure', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.error).toBe('Network error')
      expect(result.current.teams).toEqual([])
    })

    it('handles non-array API response gracefully', async () => {
      mockApi.get.mockResolvedValueOnce({ data: null })

      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.teams).toEqual([])
    })

    it('createTeam calls API and appends result', async () => {
      mockApi.get.mockResolvedValueOnce({ data: [] })
      const newTeam = { id: '99', name: 'Created', memberCount: 1, createdBy: 'u1', createdAt: '', updatedAt: '' }
      mockApi.post.mockResolvedValueOnce({ data: newTeam })

      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      let created: unknown
      await act(async () => {
        created = await result.current.createTeam({ name: 'Created' })
      })

      expect(mockApi.post).toHaveBeenCalledWith('/api/teams', { name: 'Created' })
      expect(created).toEqual(newTeam)
      expect(result.current.teams).toContainEqual(newTeam)
    })

    it('createTeam returns null on failure', async () => {
      mockApi.get.mockResolvedValueOnce({ data: [] })
      mockApi.post.mockRejectedValueOnce(new Error('fail'))

      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      let created: unknown
      await act(async () => {
        created = await result.current.createTeam({ name: 'Fail' })
      })

      expect(created).toBeNull()
    })

    it('deleteTeam calls API and removes from state', async () => {
      const teams = [{ id: '1', name: 'A', memberCount: 1, createdBy: 'u1', createdAt: '', updatedAt: '' }]
      mockApi.get.mockResolvedValueOnce({ data: teams })
      mockApi.delete.mockResolvedValueOnce({})

      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.deleteTeam('1')
      })

      expect(mockApi.delete).toHaveBeenCalledWith('/api/teams/1')
      expect(success).toBe(true)
      expect(result.current.teams).toEqual([])
    })

    it('deleteTeam returns false on failure', async () => {
      mockApi.get.mockResolvedValueOnce({ data: [{ id: '1', name: 'A', memberCount: 1 }] })
      mockApi.delete.mockRejectedValueOnce(new Error('fail'))

      const { result } = renderHook(() => useTeams())
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.deleteTeam('1')
      })

      expect(success).toBe(false)
    })
  })
})

describe('useTeamDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDemoMode.mockReturnValue(false)
  })

  it('returns null when teamId is null', async () => {
    const { result } = renderHook(() => useTeamDetail(null))
    // Should not be loading
    expect(result.current.team).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  describe('demo mode', () => {
    beforeEach(() => {
      mockGetDemoMode.mockReturnValue(true)
    })

    it('returns matching demo team by ID', async () => {
      const { result } = renderHook(() => useTeamDetail('demo-team-1'))
      await waitFor(() => expect(result.current.team).not.toBeNull())

      expect(result.current.team!.name).toBe('Platform Team')
      expect(result.current.team!.members.length).toBeGreaterThan(0)
    })

    it('returns null for unknown team ID in demo mode', async () => {
      const { result } = renderHook(() => useTeamDetail('nonexistent'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.team).toBeNull()
    })

    it('addMember adds to team in demo mode', async () => {
      const { result } = renderHook(() => useTeamDetail('demo-team-1'))
      await waitFor(() => expect(result.current.team).not.toBeNull())

      const initialCount = result.current.team!.memberCount
      await act(async () => {
        await result.current.addMember('new-user', 'member')
      })

      expect(result.current.team!.memberCount).toBe(initialCount + 1)
      expect(result.current.team!.members.find(m => m.userId === 'new-user')).toBeTruthy()
    })

    it('removeMember removes from team in demo mode', async () => {
      const { result } = renderHook(() => useTeamDetail('demo-team-1'))
      await waitFor(() => expect(result.current.team).not.toBeNull())

      const initialCount = result.current.team!.memberCount
      await act(async () => {
        await result.current.removeMember('1')
      })

      expect(result.current.team!.memberCount).toBe(initialCount - 1)
      expect(result.current.team!.members.find(m => m.userId === '1')).toBeUndefined()
    })

    it('updateTeam patches team fields in demo mode', async () => {
      const { result } = renderHook(() => useTeamDetail('demo-team-1'))
      await waitFor(() => expect(result.current.team).not.toBeNull())

      await act(async () => {
        await result.current.updateTeam({ name: 'Renamed Team' })
      })

      expect(result.current.team!.name).toBe('Renamed Team')
    })
  })

  describe('API mode', () => {
    it('fetches team detail from API', async () => {
      const detail = {
        id: 't1', name: 'API Team', memberCount: 2, createdBy: 'u1',
        createdAt: '', updatedAt: '', members: [{ userId: 'u1', githubLogin: 'user1', role: 'admin' }],
      }
      mockApi.get.mockResolvedValueOnce({ data: detail })

      const { result } = renderHook(() => useTeamDetail('t1'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(mockApi.get).toHaveBeenCalledWith('/api/teams/t1')
      expect(result.current.team).toEqual(detail)
    })

    it('sets error on API failure', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('Not found'))

      const { result } = renderHook(() => useTeamDetail('t1'))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.error).toBe('Not found')
      expect(result.current.team).toBeNull()
    })

    it('addMember calls API and refetches', async () => {
      const detail = { id: 't1', name: 'T', memberCount: 1, members: [], createdBy: '', createdAt: '', updatedAt: '' }
      mockApi.get.mockResolvedValueOnce({ data: detail })

      const { result } = renderHook(() => useTeamDetail('t1'))
      await waitFor(() => expect(result.current.team).not.toBeNull())

      const updatedDetail = { ...detail, memberCount: 2, members: [{ userId: 'u2', githubLogin: 'u2', role: 'member' }] }
      mockApi.post.mockResolvedValueOnce({})
      mockApi.get.mockResolvedValueOnce({ data: updatedDetail })

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.addMember('u2', 'member')
      })

      expect(success).toBe(true)
      expect(mockApi.post).toHaveBeenCalledWith('/api/teams/t1/members', { userId: 'u2', role: 'member' })
    })

    it('removeMember calls API and refetches', async () => {
      const detail = { id: 't1', name: 'T', memberCount: 2, members: [{ userId: 'u1' }, { userId: 'u2' }], createdBy: '', createdAt: '', updatedAt: '' }
      mockApi.get.mockResolvedValueOnce({ data: detail })

      const { result } = renderHook(() => useTeamDetail('t1'))
      await waitFor(() => expect(result.current.team).not.toBeNull())

      mockApi.delete.mockResolvedValueOnce({})
      mockApi.get.mockResolvedValueOnce({ data: { ...detail, memberCount: 1, members: [{ userId: 'u1' }] } })

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.removeMember('u2')
      })

      expect(success).toBe(true)
      expect(mockApi.delete).toHaveBeenCalledWith('/api/teams/t1/members/u2')
    })

    it('updateTeam calls API with PUT', async () => {
      const detail = { id: 't1', name: 'Old', memberCount: 1, members: [], createdBy: '', createdAt: '', updatedAt: '' }
      mockApi.get.mockResolvedValueOnce({ data: detail })

      const { result } = renderHook(() => useTeamDetail('t1'))
      await waitFor(() => expect(result.current.team).not.toBeNull())

      mockApi.put.mockResolvedValueOnce({})
      mockApi.get.mockResolvedValueOnce({ data: { ...detail, name: 'New' } })

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.updateTeam({ name: 'New' })
      })

      expect(success).toBe(true)
      expect(mockApi.put).toHaveBeenCalledWith('/api/teams/t1', { name: 'New' })
    })

    it('addMember returns false on failure', async () => {
      const detail = { id: 't1', name: 'T', memberCount: 1, members: [], createdBy: '', createdAt: '', updatedAt: '' }
      mockApi.get.mockResolvedValueOnce({ data: detail })

      const { result } = renderHook(() => useTeamDetail('t1'))
      await waitFor(() => expect(result.current.team).not.toBeNull())

      mockApi.post.mockRejectedValueOnce(new Error('fail'))

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.addMember('u2', 'member')
      })

      expect(success).toBe(false)
    })

    it('updateTeam returns false on failure', async () => {
      const detail = { id: 't1', name: 'T', memberCount: 1, members: [], createdBy: '', createdAt: '', updatedAt: '' }
      mockApi.get.mockResolvedValueOnce({ data: detail })

      const { result } = renderHook(() => useTeamDetail('t1'))
      await waitFor(() => expect(result.current.team).not.toBeNull())

      mockApi.put.mockRejectedValueOnce(new Error('fail'))

      let success: boolean | undefined
      await act(async () => {
        success = await result.current.updateTeam({ name: 'X' })
      })

      expect(success).toBe(false)
    })
  })
})
