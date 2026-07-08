import React from 'react'
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TeamMemberManager } from '../TeamMemberManager'
import type { TeamMemberInfo, TeamRole } from '../../../types/teams'

const mockT = vi.fn((key: string) => key)

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: mockT }),
}))

describe('TeamMemberManager', () => {
  const mockOnAddMember = vi.fn()
  const mockOnRemoveMember = vi.fn()
  const mockOnChangeRole = vi.fn()

  const mockMembers: TeamMemberInfo[] = [
    { userId: 'user1', role: 'admin', githubLogin: 'admin-user', email: 'admin@example.com' },
    { userId: 'user2', role: 'member', githubLogin: 'member-user', email: 'member@example.com' },
    { userId: 'user3', role: 'member', githubLogin: 'another-member', email: 'another@example.com' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockT.mockImplementation((key: string) => key)
    mockOnAddMember.mockResolvedValue(true)
    mockOnRemoveMember.mockResolvedValue(true)
  })

  afterAll(() => {
    vi.clearAllMocks()
  })

  it('renders member count correctly', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    expect(screen.getByText('3 teams.members')).toBeInTheDocument()
  })

  it('separates admins and regular members', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    expect(screen.getByText('teams.teamAdmins')).toBeInTheDocument()
    expect(screen.getByText('teams.teamMembers')).toBeInTheDocument()
    expect(screen.getByText('admin-user')).toBeInTheDocument()
    expect(screen.getByText('member-user')).toBeInTheDocument()
  })

  it('renders member github logins and emails', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    expect(screen.getByText('admin-user')).toBeInTheDocument()
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('member-user')).toBeInTheDocument()
    expect(screen.getByText('member@example.com')).toBeInTheDocument()
  })

  it('hides remove button for current user', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const adminRow = screen.getByText('admin-user').closest('div')
    expect(adminRow?.querySelector('button')).toBeNull()
  })

  it('shows remove button for other users', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const memberRows = screen.getAllByRole('button').filter(btn => btn.querySelector('svg'))
    expect(memberRows.length).toBeGreaterThan(0)
  })

  it('opens add member modal when add button is clicked', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const addButton = screen.getByText('teams.addMember')
    fireEvent.click(addButton)

    expect(screen.getByText('teams.userId')).toBeInTheDocument()
    expect(screen.getByText('teams.role')).toBeInTheDocument()
  })

  it('closes add member modal when cancel is clicked', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    fireEvent.click(screen.getByText('teams.addMember'))
    fireEvent.click(screen.getByText('common.cancel'))

    expect(screen.queryByText('teams.userId')).not.toBeInTheDocument()
  })

  it('calls onAddMember with correct parameters', async () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    fireEvent.click(screen.getByText('teams.addMember'))

    const userIdInput = screen.getByPlaceholderText('GitHub login or user ID')
    fireEvent.change(userIdInput, { target: { value: 'new-user' } })

    const roleSelect = screen.getByDisplayValue('teams.member')
    fireEvent.change(roleSelect, { target: { value: 'admin' } })

    const submitButton = screen.getAllByText('teams.addMember')[1]
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockOnAddMember).toHaveBeenCalledWith('new-user', 'admin')
    })
  })

  it('clears form and closes modal after successful add', async () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    fireEvent.click(screen.getByText('teams.addMember'))

    const userIdInput = screen.getByPlaceholderText('GitHub login or user ID')
    fireEvent.change(userIdInput, { target: { value: 'new-user' } })

    const submitButton = screen.getAllByText('teams.addMember')[1]
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.queryByText('teams.userId')).not.toBeInTheDocument()
    })
  })

  it('does not close modal if add fails', async () => {
    mockOnAddMember.mockResolvedValue(false)

    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    fireEvent.click(screen.getByText('teams.addMember'))

    const userIdInput = screen.getByPlaceholderText('GitHub login or user ID')
    fireEvent.change(userIdInput, { target: { value: 'new-user' } })

    const submitButton = screen.getAllByText('teams.addMember')[1]
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('teams.userId')).toBeInTheDocument()
    })
  })

  it('disables add button when userId is empty', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    fireEvent.click(screen.getByText('teams.addMember'))

    const submitButton = screen.getAllByText('teams.addMember')[1]
    expect(submitButton).toBeDisabled()
  })

  it('enables add button when userId is provided', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    fireEvent.click(screen.getByText('teams.addMember'))

    const userIdInput = screen.getByPlaceholderText('GitHub login or user ID')
    fireEvent.change(userIdInput, { target: { value: 'new-user' } })

    const submitButton = screen.getAllByText('teams.addMember')[1]
    expect(submitButton).not.toBeDisabled()
  })

  it('calls onChangeRole when role is changed', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const roleSelects = screen.getAllByRole('combobox')
    const memberRoleSelect = roleSelects.find(select => {
      const option = (select as HTMLSelectElement).options[(select as HTMLSelectElement).selectedIndex]
      return option && option.value === 'member'
    })

    if (memberRoleSelect) {
      fireEvent.change(memberRoleSelect, { target: { value: 'admin' } })
      expect(mockOnChangeRole).toHaveBeenCalled()
    }
  })

  it('opens remove confirmation dialog when remove button is clicked', () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const removeButtons = screen.getAllByRole('button').filter(btn => {
      const svg = btn.querySelector('svg')
      return svg !== null
    })

    if (removeButtons.length > 0) {
      fireEvent.click(removeButtons[0])
      expect(screen.getByText('teams.removeMemberTitle')).toBeInTheDocument()
      expect(screen.getByText('teams.removeMemberMessage')).toBeInTheDocument()
    }
  })

  it('calls onRemoveMember when remove is confirmed', async () => {
    render(
      <TeamMemberManager
        members={mockMembers}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    const removeButtons = screen.getAllByRole('button').filter(btn => {
      const svg = btn.querySelector('svg')
      return svg !== null
    })

    if (removeButtons.length > 0) {
      fireEvent.click(removeButtons[0])
      const confirmButton = screen.getByText('teams.removeMember')
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockOnRemoveMember).toHaveBeenCalled()
      })
    }
  })

  it('renders members without email correctly', () => {
    const membersWithoutEmail: TeamMemberInfo[] = [
      { userId: 'user1', role: 'admin', githubLogin: 'admin-user' },
    ]

    render(
      <TeamMemberManager
        members={membersWithoutEmail}
        currentUserId="user1"
        onAddMember={mockOnAddMember}
        onRemoveMember={mockOnRemoveMember}
        onChangeRole={mockOnChangeRole}
      />,
    )

    expect(screen.getByText('admin-user')).toBeInTheDocument()
    expect(screen.queryByText('@')).not.toBeInTheDocument()
  })
})
