// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamDetail } from '../TeamDetail'
import type { TeamWithMembers, TeamRole } from '../../../types/teams'

const mockT = vi.fn((key: string) => key)
const mockUser = { id: 'user1', email: 'test@example.com' }

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

vi.mock('../TeamMemberManager', () => ({
  TeamMemberManager: ({ members, currentUserId }: { members: unknown[]; currentUserId: string }) => (
    <div data-testid="team-member-manager">
      TeamMemberManager: {members.length} members, currentUserId: {currentUserId}
    </div>
  ),
}))

vi.mock('../TeamAccessGrants', () => ({
  TeamAccessGrants: ({ teamName, grants }: { teamName: string; grants: unknown[] }) => (
    <div data-testid="team-access-grants">
      TeamAccessGrants: {teamName}, {grants.length} grants
    </div>
  ),
}))

describe('TeamDetail', () => {
  const mockOnBack = vi.fn()
  const mockOnUpdateTeam = vi.fn()
  const mockOnDeleteTeam = vi.fn()
  const mockOnAddMember = vi.fn()
  const mockOnRemoveMember = vi.fn()
  const mockOnChangeRole = vi.fn()

  const mockTeam: TeamWithMembers = {
    id: 'team1',
    name: 'Test Team',
    description: 'Test description',
    memberCount: 2,
    members: [
      { userId: 'user1', role: 'admin' as TeamRole, githubLogin: 'admin-user', email: 'admin@example.com' },
      { userId: 'user2', role: 'member' as TeamRole, githubLogin: 'member-user', email: 'member@example.com' },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockT.mockImplementation((key: string) => key)
  })

  it('renders team name and description', () => {
    render(
      <TeamDetail
        team={mockTeam}
        onBack={mockOnBack}
        onUpdateTeam={mockOnUpdateTeam}
        onDeleteTeam={mockOnDeleteTeam}
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    expect(screen.getByText('Test Team')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
  })

  it('renders without description when not provided', () => {
    const teamWithoutDesc = { ...mockTeam, description: undefined }
    render(
      <TeamDetail
        team={teamWithoutDesc}
        onBack={mockOnBack}
        onUpdateTeam={mockOnUpdateTeam}
        onDeleteTeam={mockOnDeleteTeam}
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    expect(screen.getByText('Test Team')).toBeInTheDocument()
    expect(screen.queryByText('Test description')).not.toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    render(
      <TeamDetail
        team={mockTeam}
        onBack={mockOnBack}
        onUpdateTeam={mockOnUpdateTeam}
        onDeleteTeam={mockOnDeleteTeam}
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const backButton = screen.getByRole('button', { name: '' })
    fireEvent.click(backButton)

    expect(mockOnBack).toHaveBeenCalled()
  })

  it('shows delete button when current user is admin', () => {
    render(
      <TeamDetail
        team={mockTeam}
        onBack={mockOnBack}
        onUpdateTeam={mockOnUpdateTeam}
        onDeleteTeam={mockOnDeleteTeam}
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    expect(screen.getByText('teams.deleteTeam')).toBeInTheDocument()
  })

  it('hides delete button when current user is not admin', () => {
    const teamWithNoAdminUser = {
      ...mockTeam,
      members: [
        { userId: 'user2', role: 'member' as TeamRole, githubLogin: 'member-user', email: 'member@example.com' },
      ],
    }

    render(
      <TeamDetail
        team={teamWithNoAdminUser}
        onBack={mockOnBack}
        onUpdateTeam={mockOnUpdateTeam}
        onDeleteTeam={mockOnDeleteTeam}
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    expect(screen.queryByText('teams.deleteTeam')).not.toBeInTheDocument()
  })

  it('opens delete confirmation dialog when delete button is clicked', () => {
    render(
      <TeamDetail
        team={mockTeam}
        onBack={mockOnBack}
        onUpdateTeam={mockOnUpdateTeam}
        onDeleteTeam={mockOnDeleteTeam}
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const deleteButton = screen.getByText('teams.deleteTeam')
    fireEvent.click(deleteButton)

    expect(screen.getByText('teams.deleteTeamTitle')).toBeInTheDocument()
    expect(screen.getByText('teams.deleteTeamMessage')).toBeInTheDocument()
  })

  it('calls onDeleteTeam when delete is confirmed', () => {
    render(
      <TeamDetail
        team={mockTeam}
        onBack={mockOnBack}
        onUpdateTeam={mockOnUpdateTeam}
        onDeleteTeam={mockOnDeleteTeam}
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    fireEvent.click(screen.getByText('teams.deleteTeam'))
    fireEvent.click(screen.getAllByText('teams.deleteTeam')[1])

    expect(mockOnDeleteTeam).toHaveBeenCalled()
  })

  it('renders TeamMemberManager with correct props', () => {
    render(
      <TeamDetail
        team={mockTeam}
        onBack={mockOnBack}
        onUpdateTeam={mockOnUpdateTeam}
        onDeleteTeam={mockOnDeleteTeam}
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const memberManager = screen.getByTestId('team-member-manager')
    expect(memberManager).toBeInTheDocument()
    expect(memberManager.textContent).toContain('2 members')
    expect(memberManager.textContent).toContain('currentUserId: user1')
  })

  it('renders TeamAccessGrants with correct props', () => {
    render(
      <TeamDetail
        team={mockTeam}
        onBack={mockOnBack}
        onUpdateTeam={mockOnUpdateTeam}
        onDeleteTeam={mockOnDeleteTeam}
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const accessGrants = screen.getByTestId('team-access-grants')
    expect(accessGrants).toBeInTheDocument()
    expect(accessGrants.textContent).toContain('Test Team')
  })
})
