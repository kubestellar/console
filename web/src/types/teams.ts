export type TeamRole = 'admin' | 'member'

export interface Team {
  id: string
  name: string
  description?: string
  createdBy: string
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface TeamMembership {
  id: string
  teamId: string
  userId: string
  role: TeamRole
  createdAt: string
}

export interface TeamMemberInfo {
  userId: string
  githubLogin: string
  avatarUrl?: string
  role: TeamRole
  email?: string
}

export interface TeamWithMembers extends Team {
  members: TeamMemberInfo[]
}

export interface CreateTeamRequest {
  name: string
  description?: string
  memberIds?: string[]
}

export interface UpdateTeamRequest {
  name?: string
  description?: string
}

export interface AddTeamMemberRequest {
  userId: string
  role: TeamRole
}
