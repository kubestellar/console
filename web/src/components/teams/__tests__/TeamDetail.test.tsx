import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamDetail } from '../TeamDetail'
import type { TeamWithMembers } from '../../../types/teams'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'teams.deleteTeam': 'Delete Team',
        'teams.confirmDelete': 'Are you sure you want to delete this team?',
        'teams.members': 'Members',
        'teams.accessGrants': 'Access Grants',
        'common.back': 'Back',
        'common.cancel': 'Cancel',
        'common.confirm': 'Confirm',
        'common.delete': 'Delete',
      }
      return translations[key] ?? key
    },
  }),
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'current-user-id', name: 'Test User' },
  }),
}))

vi.mock('../../../lib/modals', () => ({
  ConfirmDialog: ({ isOpen, onConfirm, onCancel, title }: {
    isOpen: boolean; onConfirm: () => void; onCancel: () => void; title: string
  }) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm} data-testid="confirm-btn">Confirm</button>
        <button onClick={onCancel} data-testid="cancel-btn">Cancel</button>
      </div>
    ) : null,
}))

vi.mock('../TeamMemberManager', () => ({
  TeamMemberManager: () => <div data-testid="member-manager">MemberManager</div>,
}))

vi.mock('../TeamAccessGrants', () => ({
  TeamAccessGrants: () => <div data-testid="access-grants">AccessGrants</div>,
}))

const makeTeamWithMembers = (overrides: Partial<TeamWithMembers> = {}): TeamWithMembers => ({
  id: 'team-1',
  name: 'Test Team',
  description: 'A team for testing',
  createdBy: 'creator-id',
  memberCount: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  members: [
    { userId: 'current-user-id', githubLogin: 'testuser', role: 'admin' },
    { userId: 'other-user', githubLogin: 'otheruser', role: 'member' },
  ],
  ...overrides,
})

describe('TeamDetail', () => {
  const defaultProps = {
    team: makeTeamWithMembers(),
    onBack: vi.fn(),
    onUpdateTeam: vi.fn(),
    onDeleteTeam: vi.fn(),
    onAddMember: vi.fn().mockResolvedValue(true),
    onRemoveMember: vi.fn().mockResolvedValue(true),
    onChangeRole: vi.fn(),
  }

  it('renders team name', () => {
    render(<TeamDetail {...defaultProps} />)
    expect(screen.getByText('Test Team')).toBeDefined()
  })

  it('renders member manager component', () => {
    render(<TeamDetail {...defaultProps} />)
    expect(screen.getByTestId('member-manager')).toBeDefined()
  })

  it('shows delete button for admin user', () => {
    render(<TeamDetail {...defaultProps} />)
    // Admin should see the delete action
    const deleteBtn = screen.queryByText('Delete Team')
    expect(deleteBtn).not.toBeNull()
  })

  it('hides delete button for non-admin user', () => {
    const team = makeTeamWithMembers({
      members: [
        { userId: 'current-user-id', githubLogin: 'testuser', role: 'member' },
        { userId: 'other-user', githubLogin: 'otheruser', role: 'admin' },
      ],
    })
    render(<TeamDetail {...defaultProps} team={team} />)
    const deleteBtn = screen.queryByText('Delete Team')
    expect(deleteBtn).toBeNull()
  })

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn()
    render(<TeamDetail {...defaultProps} onBack={onBack} />)
    // Find a button that navigates back (ArrowLeft icon button)
    const backButton = screen.getByText('Back')
    fireEvent.click(backButton)
    expect(onBack).toHaveBeenCalled()
  })

  it('shows confirmation dialog before delete', () => {
    render(<TeamDetail {...defaultProps} />)
    const deleteBtn = screen.getByText('Delete Team')
    fireEvent.click(deleteBtn)
    expect(screen.getByTestId('confirm-dialog')).toBeDefined()
  })

  it('calls onDeleteTeam when delete is confirmed', () => {
    const onDeleteTeam = vi.fn()
    render(<TeamDetail {...defaultProps} onDeleteTeam={onDeleteTeam} />)
    const deleteBtn = screen.getByText('Delete Team')
    fireEvent.click(deleteBtn)
    fireEvent.click(screen.getByTestId('confirm-btn'))
    expect(onDeleteTeam).toHaveBeenCalled()
  })
})
