import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const useTeamsMock = vi.hoisted(() => ({
  teams: [{ id: 'team-1', name: 'Alpha Team', description: 'First team', memberCount: 3, createdBy: '1', createdAt: '', updatedAt: '' }],
  isLoading: false,
  isRefreshing: false,
  error: null,
  refetch: vi.fn(),
  createTeam: vi.fn().mockResolvedValue(null),
  deleteTeam: vi.fn().mockResolvedValue(true),
}))

const useTeamDetailMock = vi.hoisted(() => ({
  team: null as null | { id: string; name: string; description: string; members: [] },
  isLoading: false,
  error: null,
  addMember: vi.fn(),
  removeMember: vi.fn(),
}))

vi.mock('@/hooks/useTeams', () => ({
  useTeams: () => useTeamsMock,
  useTeamDetail: () => useTeamDetailMock,
}))

vi.mock('@/components/teams/TeamList', () => ({
  TeamList: ({ teams, isLoading, onSelectTeam }: {
    teams: Array<{ id: string; name: string }>
    isLoading: boolean
    onSelectTeam: (id: string) => void
  }) => (
    <div data-testid="team-list">
      {isLoading ? (
        <span>Loading...</span>
      ) : (
        teams.map(t => (
          <button key={t.id} onClick={() => onSelectTeam(t.id)}>
            {t.name}
          </button>
        ))
      )}
    </div>
  ),
}))

vi.mock('@/components/teams/TeamDetail', () => ({
  TeamDetail: ({ team, onBack }: { team: { name: string }; onBack: () => void }) => (
    <div data-testid="team-detail">
      <span>{team.name}</span>
      <button onClick={onBack}>Back</button>
    </div>
  ),
}))

import { TeamManagementPage } from './TeamManagement'

describe('TeamManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTeamDetailMock.team = null
  })

  it('renders the TeamList by default', () => {
    render(<TeamManagementPage />)
    expect(screen.getByTestId('team-list')).toBeInTheDocument()
    expect(screen.queryByTestId('team-detail')).not.toBeInTheDocument()
  })

  it('shows team names in the list', () => {
    render(<TeamManagementPage />)
    expect(screen.getByText('Alpha Team')).toBeInTheDocument()
  })

  it('switches to TeamDetail when a team is selected', async () => {
    // Simulate a team being available in useTeamDetail when a team is selected
    useTeamDetailMock.team = { id: 'team-1', name: 'Alpha Team', description: 'First team', members: [] }

    render(<TeamManagementPage />)
    await act(async () => {
      fireEvent.click(screen.getByText('Alpha Team'))
    })
    expect(screen.getByTestId('team-detail')).toBeInTheDocument()
    expect(screen.queryByTestId('team-list')).not.toBeInTheDocument()
  })

  it('returns to TeamList when onBack is called from TeamDetail', async () => {
    useTeamDetailMock.team = { id: 'team-1', name: 'Alpha Team', description: 'First team', members: [] }

    render(<TeamManagementPage />)
    await act(async () => {
      fireEvent.click(screen.getByText('Alpha Team'))
    })
    expect(screen.getByTestId('team-detail')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByText('Back'))
    })
    expect(screen.getByTestId('team-list')).toBeInTheDocument()
    expect(screen.queryByTestId('team-detail')).not.toBeInTheDocument()
  })

  it('wraps content in the styled container', () => {
    const { container } = render(<TeamManagementPage />)
    expect(container.querySelector('.min-h-full.p-6')).toBeInTheDocument()
  })
})
