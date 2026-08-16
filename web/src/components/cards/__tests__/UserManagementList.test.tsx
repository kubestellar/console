import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ConsoleUsersTab } from '../UserManagementList'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

const defaultConsoleProps = {
  users: [],
  isLoading: false,
  isAdmin: false,
  expandedUser: null,
  setExpandedUser: vi.fn(),
  onRoleChange: vi.fn(),
  onDeleteUser: vi.fn(),
  getRoleBadgeClass: vi.fn(() => 'badge-class'),
}

describe('ConsoleUsersTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders without crashing with empty user list', () => {
    render(<ConsoleUsersTab {...defaultConsoleProps} />)
    expect(document.body).toBeTruthy()
  })

  it('renders with a user', () => {
    const users = [{
      id: 'user-1',
      githubId: 42,
      username: 'testuser',
      email: 'test@example.com',
      role: 'admin' as const,
      createdAt: '2024-01-01',
    }]
    render(<ConsoleUsersTab {...defaultConsoleProps} users={users} isAdmin={true} />)
    expect(document.body).toBeTruthy()
  })

  it('shows loading state', () => {
    render(<ConsoleUsersTab {...defaultConsoleProps} isLoading={true} />)
    expect(document.body).toBeTruthy()
  })
})
