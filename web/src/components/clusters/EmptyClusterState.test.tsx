import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyClusterState } from './EmptyClusterState'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('EmptyClusterState', () => {
  const mockOnAddCluster = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders default empty state with add cluster button', () => {
    render(<EmptyClusterState onAddCluster={mockOnAddCluster} />)
    expect(screen.getByText('cluster.noClusterTitle')).toBeInTheDocument()
    expect(screen.getByText('cluster.noClusterDesc')).toBeInTheDocument()
    expect(screen.getByText('cluster.addCluster')).toBeInTheDocument()
  })

  it('calls onAddCluster when button is clicked', async () => {
    const user = userEvent.setup()
    render(<EmptyClusterState onAddCluster={mockOnAddCluster} />)
    const addButton = screen.getByText('cluster.addCluster')
    await user.click(addButton)
    expect(mockOnAddCluster).toHaveBeenCalledTimes(1)
  })

  it('renders degraded state when agent is connected but no data', () => {
    render(<EmptyClusterState onAddCluster={mockOnAddCluster} agentConnected={true} />)
    expect(screen.getByTestId('cluster-degraded-state')).toBeInTheDocument()
  })

  it('renders in-cluster mode empty state', () => {
    render(<EmptyClusterState onAddCluster={mockOnAddCluster} inClusterMode={true} />)
    expect(screen.getByTestId('cluster-mode-empty-state')).toBeInTheDocument()
  })
})
