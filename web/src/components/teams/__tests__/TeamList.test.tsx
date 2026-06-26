// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamList } from '../TeamList'
import type { Team } from '../../../types/teams'

const mockT = vi.fn((key: string) => key)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}))

describe('TeamList', () => {
  const mockOnCreateTeam = vi.fn()
  const mockOnSelectTeam = vi.fn()

  const mockTeams: Team[] = [
    { id: 'team1', name: 'Team Alpha', description: 'First team', memberCount: 5 },
    { id: 'team2', name: 'Team Beta', description: 'Second team', memberCount: 3 },
    { id: 'team3', name: 'Team Gamma', description: '', memberCount: 1 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockT.mockImplementation((key: string) => key)
  })

  it('renders loading skeleton when isLoading is true', () => {
    render(<TeamList teams={[]} isLoading={true} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    const skeletons = screen.getAllByRole('generic').filter(el => el.className.includes('animate-pulse'))
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders teams list when teams are provided', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    expect(screen.getByText('Team Alpha')).toBeInTheDocument()
    expect(screen.getByText('Team Beta')).toBeInTheDocument()
    expect(screen.getByText('Team Gamma')).toBeInTheDocument()
    expect(screen.getByText('First team')).toBeInTheDocument()
    expect(screen.getByText('Second team')).toBeInTheDocument()
  })

  it('renders empty state when no teams exist', () => {
    render(<TeamList teams={[]} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    expect(screen.getByText('teams.noTeams')).toBeInTheDocument()
  })

  it('displays correct member count for each team', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    expect(screen.getByText('5 members')).toBeInTheDocument()
    expect(screen.getByText('3 members')).toBeInTheDocument()
    expect(screen.getByText('1 member')).toBeInTheDocument()
  })

  it('renders team without description correctly', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    expect(screen.getByText('Team Gamma')).toBeInTheDocument()
    expect(screen.queryByText('')).toBeInTheDocument()
  })

  it('calls onSelectTeam when a team is clicked', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    const teamButton = screen.getByText('Team Alpha').closest('button')
    if (teamButton) {
      fireEvent.click(teamButton)
    }

    expect(mockOnSelectTeam).toHaveBeenCalledWith('team1')
  })

  it('opens create team modal when create button is clicked', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    const createButton = screen.getByText('teams.createTeam')
    fireEvent.click(createButton)

    expect(screen.getAllByText('teams.createTeam')).toHaveLength(2)
    expect(screen.getByText('teams.teamName')).toBeInTheDocument()
    expect(screen.getByText('teams.description')).toBeInTheDocument()
  })

  it('closes create team modal when cancel is clicked', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    fireEvent.click(screen.getByText('teams.createTeam'))
    fireEvent.click(screen.getByText('common.cancel'))

    expect(screen.queryByText('teams.teamName')).not.toBeInTheDocument()
  })

  it('calls onCreateTeam with trimmed values when form is submitted', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    fireEvent.click(screen.getByText('teams.createTeam'))

    const nameInput = screen.getByPlaceholderText('teams.teamNamePlaceholder')
    const descInput = screen.getByPlaceholderText('teams.descriptionPlaceholder')

    fireEvent.change(nameInput, { target: { value: '  New Team  ' } })
    fireEvent.change(descInput, { target: { value: '  New Description  ' } })

    const submitButton = screen.getAllByText('teams.createTeam')[1]
    fireEvent.click(submitButton)

    expect(mockOnCreateTeam).toHaveBeenCalledWith('New Team', 'New Description')
  })

  it('clears form after successful creation', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    fireEvent.click(screen.getByText('teams.createTeam'))

    const nameInput = screen.getByPlaceholderText('teams.teamNamePlaceholder')
    const descInput = screen.getByPlaceholderText('teams.descriptionPlaceholder')

    fireEvent.change(nameInput, { target: { value: 'Test Team' } })
    fireEvent.change(descInput, { target: { value: 'Test Desc' } })

    const submitButton = screen.getAllByText('teams.createTeam')[1]
    fireEvent.click(submitButton)

    fireEvent.click(screen.getByText('teams.createTeam'))

    const newNameInput = screen.getByPlaceholderText('teams.teamNamePlaceholder')
    const newDescInput = screen.getByPlaceholderText('teams.descriptionPlaceholder')

    expect((newNameInput as HTMLInputElement).value).toBe('')
    expect((newDescInput as HTMLTextAreaElement).value).toBe('')
  })

  it('disables create button when name is empty', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    fireEvent.click(screen.getByText('teams.createTeam'))

    const submitButton = screen.getAllByText('teams.createTeam')[1]
    expect(submitButton).toBeDisabled()
  })

  it('enables create button when name is provided', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    fireEvent.click(screen.getByText('teams.createTeam'))

    const nameInput = screen.getByPlaceholderText('teams.teamNamePlaceholder')
    fireEvent.change(nameInput, { target: { value: 'New Team' } })

    const submitButton = screen.getAllByText('teams.createTeam')[1]
    expect(submitButton).not.toBeDisabled()
  })

  it('does not submit when name is only whitespace', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    fireEvent.click(screen.getByText('teams.createTeam'))

    const nameInput = screen.getByPlaceholderText('teams.teamNamePlaceholder')
    fireEvent.change(nameInput, { target: { value: '   ' } })

    const submitButton = screen.getAllByText('teams.createTeam')[1]
    expect(submitButton).toBeDisabled()
  })

  it('displays correct team count', () => {
    render(<TeamList teams={mockTeams} isLoading={false} onCreateTeam={mockOnCreateTeam} onSelectTeam={mockOnSelectTeam} />)

    expect(screen.getByText('3 teams.teams')).toBeInTheDocument()
  })
})
