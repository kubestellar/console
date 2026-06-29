import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamList } from '../TeamList'
import type { Team } from '../../../types/teams'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'teams.teams': 'teams',
        'teams.createTeam': 'Create Team',
        'teams.noTeams': 'No teams yet',
        'teams.teamName': 'Team Name',
        'teams.teamNamePlaceholder': 'Enter team name',
        'teams.description': 'Description',
        'teams.descriptionPlaceholder': 'Enter description',
        'common.cancel': 'Cancel',
      }
      return translations[key] ?? key
    },
  }),
}))

vi.mock('../../../lib/modals', () => ({
  BaseModal: Object.assign(
    ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
      isOpen ? <div data-testid="modal">{children}</div> : null,
    {
      Header: ({ title, onClose }: { title: string; onClose: () => void }) => (
        <div data-testid="modal-header">
          {title}
          <button onClick={onClose} data-testid="modal-close">×</button>
        </div>
      ),
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }
  ),
}))

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
  id: 'team-1',
  name: 'Alpha Team',
  description: 'First team',
  createdBy: 'user-1',
  memberCount: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('TeamList', () => {
  it('renders loading skeleton when isLoading=true', () => {
    const { container } = render(
      <TeamList teams={[]} isLoading={true} onCreateTeam={vi.fn()} onSelectTeam={vi.fn()} />
    )
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBe(3)
  })

  it('renders empty state when no teams exist', () => {
    render(
      <TeamList teams={[]} isLoading={false} onCreateTeam={vi.fn()} onSelectTeam={vi.fn()} />
    )
    expect(screen.getByText('No teams yet')).toBeDefined()
  })

  it('renders team list with names and member counts', () => {
    const teams = [
      makeTeam({ id: '1', name: 'Team A', memberCount: 2 }),
      makeTeam({ id: '2', name: 'Team B', memberCount: 1 }),
    ]
    render(
      <TeamList teams={teams} isLoading={false} onCreateTeam={vi.fn()} onSelectTeam={vi.fn()} />
    )
    expect(screen.getByText('Team A')).toBeDefined()
    expect(screen.getByText('Team B')).toBeDefined()
    expect(screen.getByText('2 members')).toBeDefined()
    expect(screen.getByText('1 member')).toBeDefined()
  })

  it('calls onSelectTeam when a team is clicked', () => {
    const onSelectTeam = vi.fn()
    const teams = [makeTeam({ id: 'team-abc', name: 'Click Me' })]
    render(
      <TeamList teams={teams} isLoading={false} onCreateTeam={vi.fn()} onSelectTeam={onSelectTeam} />
    )
    fireEvent.click(screen.getByText('Click Me'))
    expect(onSelectTeam).toHaveBeenCalledWith('team-abc')
  })

  it('opens create modal on button click', () => {
    render(
      <TeamList teams={[]} isLoading={false} onCreateTeam={vi.fn()} onSelectTeam={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Create Team'))
    expect(screen.getByTestId('modal')).toBeDefined()
  })

  it('does not call onCreateTeam with empty name', () => {
    const onCreateTeam = vi.fn()
    render(
      <TeamList teams={[]} isLoading={false} onCreateTeam={onCreateTeam} onSelectTeam={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Create Team'))
    // The create button in modal should be disabled when name is empty
    const createButtons = screen.getAllByText('Create Team')
    const modalCreateBtn = createButtons[createButtons.length - 1]
    fireEvent.click(modalCreateBtn)
    expect(onCreateTeam).not.toHaveBeenCalled()
  })

  it('calls onCreateTeam with trimmed name and description', () => {
    const onCreateTeam = vi.fn()
    render(
      <TeamList teams={[]} isLoading={false} onCreateTeam={onCreateTeam} onSelectTeam={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Create Team'))

    const nameInput = screen.getByPlaceholderText('Enter team name')
    const descInput = screen.getByPlaceholderText('Enter description')

    fireEvent.change(nameInput, { target: { value: '  My Team  ' } })
    fireEvent.change(descInput, { target: { value: '  A description  ' } })

    const createButtons = screen.getAllByText('Create Team')
    const modalCreateBtn = createButtons[createButtons.length - 1]
    fireEvent.click(modalCreateBtn)

    expect(onCreateTeam).toHaveBeenCalledWith('My Team', 'A description')
  })

  it('closes modal on cancel', () => {
    render(
      <TeamList teams={[]} isLoading={false} onCreateTeam={vi.fn()} onSelectTeam={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Create Team'))
    expect(screen.getByTestId('modal')).toBeDefined()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByTestId('modal')).toBeNull()
  })
})
