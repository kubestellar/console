import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { getDemoMode } from './useDemoMode'
import type { Team, TeamWithMembers, TeamMemberInfo, CreateTeamRequest, UpdateTeamRequest, TeamRole } from '../types/teams'

const DEMO_TEAMS: TeamWithMembers[] = [
  {
    id: 'demo-team-1',
    name: 'Platform Team',
    description: 'Responsible for cluster infrastructure and platform services',
    createdBy: '1',
    memberCount: 5,
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    members: [
      { userId: '1', githubLogin: 'admin-user', avatarUrl: '', role: 'admin', email: 'admin@example.com' },
      { userId: '2', githubLogin: 'developer-jane', avatarUrl: '', role: 'member', email: 'jane@example.com' },
      { userId: '4', githubLogin: 'ops-engineer', avatarUrl: '', role: 'member' },
      { userId: '5', githubLogin: 'sre-alice', avatarUrl: '', role: 'admin' },
      { userId: '6', githubLogin: 'devops-bob', avatarUrl: '', role: 'member' },
    ],
  },
  {
    id: 'demo-team-2',
    name: 'Security Team',
    description: 'Security compliance and audit response',
    createdBy: '1',
    memberCount: 3,
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    members: [
      { userId: '1', githubLogin: 'admin-user', avatarUrl: '', role: 'admin' },
      { userId: '3', githubLogin: 'viewer-bob', avatarUrl: '', role: 'member' },
      { userId: '7', githubLogin: 'sec-charlie', avatarUrl: '', role: 'member' },
    ],
  },
  {
    id: 'demo-team-3',
    name: 'Developer Experience',
    description: 'CI/CD pipelines and developer tooling',
    createdBy: '2',
    memberCount: 4,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    members: [
      { userId: '2', githubLogin: 'developer-jane', avatarUrl: '', role: 'admin' },
      { userId: '4', githubLogin: 'ops-engineer', avatarUrl: '', role: 'member' },
      { userId: '3', githubLogin: 'viewer-bob', avatarUrl: '', role: 'member' },
      { userId: '8', githubLogin: 'qa-tester', avatarUrl: '', role: 'member' },
    ],
  },
]

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTeams = useCallback(async () => {
    if (getDemoMode()) {
      setTeams(DEMO_TEAMS.map(t => {
        const { members, ...team } = t
        return { ...team, memberCount: members.length }
      }))
      setIsLoading(false)
      setIsRefreshing(false)
      setError(null)
      return
    }

    setIsRefreshing(true)
    setTeams(prev => { if (prev.length === 0) setIsLoading(true); return prev })
    setError(null)
    try {
      const { data } = await api.get<Team[]>('/api/teams')
      setTeams(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load teams')
      setTeams([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchTeams() }, [fetchTeams])

  const createTeam = async (req: CreateTeamRequest): Promise<Team | null> => {
    if (getDemoMode()) {
      const newTeam: Team = {
        id: `demo-${Date.now()}`,
        name: req.name,
        description: req.description,
        createdBy: '1',
        memberCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setTeams(prev => [...prev, newTeam])
      return newTeam
    }
    try {
      const { data } = await api.post<Team>('/api/teams', req)
      setTeams(prev => [...prev, data])
      return data
    } catch {
      return null
    }
  }

  const deleteTeam = async (id: string) => {
    if (getDemoMode()) {
      setTeams(prev => prev.filter(t => t.id !== id))
      return true
    }
    try {
      await api.delete(`/api/teams/${id}`)
      setTeams(prev => prev.filter(t => t.id !== id))
      return true
    } catch {
      return false
    }
  }

  return { teams, isLoading, isRefreshing, error, refetch: fetchTeams, createTeam, deleteTeam }
}

export function useTeamDetail(teamId: string | null) {
  const [team, setTeam] = useState<TeamWithMembers | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    if (!teamId) { setTeam(null); return }
    if (getDemoMode()) {
      const found = DEMO_TEAMS.find(t => t.id === teamId) || null
      setTeam(found)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await api.get<TeamWithMembers>(`/api/teams/${teamId}`)
      setTeam(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load team')
      setTeam(null)
    } finally {
      setIsLoading(false)
    }
  }, [teamId])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const addMember = async (userId: string, role: TeamRole) => {
    if (getDemoMode()) {
      setTeam(prev => prev ? {
        ...prev,
        memberCount: prev.memberCount + 1,
        members: [...prev.members, { userId, githubLogin: userId, role, email: undefined }],
      } : prev)
      return true
    }
    try {
      await api.post(`/api/teams/${teamId}/members`, { userId, role })
      await fetchDetail()
      return true
    } catch {
      return false
    }
  }

  const removeMember = async (userId: string) => {
    if (getDemoMode()) {
      setTeam(prev => prev ? {
        ...prev,
        memberCount: prev.memberCount - 1,
        members: prev.members.filter(m => m.userId !== userId),
      } : prev)
      return true
    }
    try {
      await api.delete(`/api/teams/${teamId}/members/${userId}`)
      await fetchDetail()
      return true
    } catch {
      return false
    }
  }

  const updateTeam = async (req: UpdateTeamRequest) => {
    if (getDemoMode()) {
      setTeam(prev => prev ? { ...prev, ...req, updatedAt: new Date().toISOString() } : prev)
      return true
    }
    try {
      await api.put(`/api/teams/${teamId}`, req)
      await fetchDetail()
      return true
    } catch {
      return false
    }
  }

  return { team, isLoading, error, refetch: fetchDetail, addMember, removeMember, updateTeam }
}
