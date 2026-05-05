import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PayloadCard } from '../PayloadCard'
import { PayloadGrid } from '../PayloadGrid'
import { ClusterReadinessCard } from '../ClusterReadinessCard'
import { FixerDefinitionPanel } from '../FixerDefinitionPanel'
import type { PayloadProject } from '../types'

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock useTranslation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (str: string) => str,
  }),
}))

const mockProject: PayloadProject = {
  name: 'falco',
  displayName: 'Falco',
  reason: 'Runtime security',
  category: 'Security',
  priority: 'required',
  dependencies: ['prometheus'],
  maturity: 'graduated',
}

describe('PayloadCard', () => {
  it('renders project details correctly', () => {
    render(
      <PayloadCard
        project={mockProject}
        onRemove={vi.fn()}
        onUpdatePriority={vi.fn()}
      />
    )
    
    expect(screen.getByText('Falco')).toBeDefined()
    expect(screen.getByText('Runtime security')).toBeDefined()
    expect(screen.getByText('Security')).toBeDefined()
    expect(screen.getByText('required')).toBeDefined()
  })

  it('calls onRemove when remove button is clicked', () => {
    const onRemove = vi.fn()
    render(
      <PayloadCard
        project={mockProject}
        onRemove={onRemove}
        onUpdatePriority={vi.fn()}
      />
    )
    
    const removeBtn = screen.getByTitle('Remove')
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalled()
  })

  it('shows dependencies count', () => {
    render(
      <PayloadCard
        project={mockProject}
        onRemove={vi.fn()}
        onUpdatePriority={vi.fn()}
      />
    )
    
    expect(screen.getByText('+1 dep')).toBeDefined()
  })

  it('keeps the card stretched when swapped badges are present', () => {
    const swappedProject = {
      ...mockProject,
      displayName: 'Kube Prometheus Stack',
      originalName: 'step-ca',
    }

    const { container } = render(
      <PayloadCard
        project={swappedProject}
        onRemove={vi.fn()}
        onUpdatePriority={vi.fn()}
        installed={false}
      />
    )

    expect(screen.getByText('Swapped')).toBeDefined()
    expect(screen.getByText('Needs deploy')).toBeDefined()
    expect(container.firstElementChild).toHaveClass('h-full')
    expect(container.firstElementChild?.firstElementChild).toHaveClass('h-full', 'flex', 'flex-col')
  })
})

describe('PayloadGrid', () => {
  it('renders a list of projects', () => {
    const projects = [
      mockProject,
      { ...mockProject, name: 'prometheus', displayName: 'Prometheus' }
    ]
    render(
      <PayloadGrid
        projects={projects}
        onRemoveProject={vi.fn()}
        onUpdatePriority={vi.fn()}
      />
    )
    
    expect(screen.getByText('Falco')).toBeDefined()
    expect(screen.getByText('Prometheus')).toBeDefined()
    expect(screen.getByText('2 projects')).toBeDefined()
  })

  it('shows empty state when no projects', () => {
    render(
      <PayloadGrid
        projects={[]}
        onRemoveProject={vi.fn()}
        onUpdatePriority={vi.fn()}
      />
    )
    
    expect(screen.getByText('No projects selected yet')).toBeDefined()
  })

  it('filters projects by search input', () => {
    const projects = [
      { ...mockProject, name: 'falco', displayName: 'Falco' },
      { ...mockProject, name: 'prometheus', displayName: 'Prometheus' }
    ]
    render(
      <PayloadGrid
        projects={projects}
        onRemoveProject={vi.fn()}
        onUpdatePriority={vi.fn()}
      />
    )
    
    // Search input only shows if projects.length > 4 in the component
    // Let's add more projects to trigger search bar
    const manyProjects = Array.from({ length: 5 }, (_, i) => ({
      ...mockProject,
      name: `proj-${i}`,
      displayName: `Project ${i}`
    }))
    
    const { rerender } = render(
      <PayloadGrid
        projects={manyProjects}
        onRemoveProject={vi.fn()}
        onUpdatePriority={vi.fn()}
      />
    )
    
    const searchInput = screen.getByPlaceholderText('Filter projects...')
    fireEvent.change(searchInput, { target: { value: 'Project 1' } })
    
    expect(screen.getByText('Project 1')).toBeDefined()
    expect(screen.queryByText('Project 2')).toBeNull()
  })
})

describe('ClusterReadinessCard', () => {
  const mockCluster = {
    name: 'eks-prod',
    healthy: true,
    cpuCores: 8,
    memoryGB: 16,
    storageGB: 100,
    cpuUsageCores: 2,
    memoryUsageGB: 4,
    nodeCount: 3,
    podCount: 50,
    distribution: 'eks'
  }

  it('renders cluster info and capacity gauges', () => {
    render(
      <ClusterReadinessCard
        cluster={mockCluster as any}
        onToggleProject={vi.fn()}
        availableProjects={['falco']}
        assignment={{
          clusterName: 'eks-prod',
          projectNames: ['falco'],
          readiness: { overallScore: 85, cpuHeadroomPercent: 75, memHeadroomPercent: 75, storageHeadroomPercent: 100 },
          warnings: []
        } as any}
      />
    )
    
    expect(screen.getByText('eks-prod')).toBeDefined()
    expect(screen.getByText('85')).toBeDefined() // Readiness score
    expect(screen.getByText('2.0/8.0 cores (25%)')).toBeDefined()
  })

  it('calls onToggleProject when a project is clicked', () => {
    const onToggle = vi.fn()
    render(
      <ClusterReadinessCard
        cluster={mockCluster as any}
        onToggleProject={onToggle}
        availableProjects={['falco']}
        assignment={{
          clusterName: 'eks-prod',
          projectNames: [],
          readiness: { overallScore: 85 },
          warnings: []
        } as any}
      />
    )
    
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onToggle).toHaveBeenCalledWith('falco', true)
  })
})

describe('FixerDefinitionPanel', () => {
  const mockState = {
    phase: 'define',
    title: 'Test Mission',
    description: 'Test Description',
    projects: [mockProject],
    targetClusters: [],
    assignments: [],
    phases: [],
    launchProgress: [],
    aiStreaming: false,
  }

  it('renders initial state correctly', () => {
    render(
      <FixerDefinitionPanel
        state={mockState as any}
        onDescriptionChange={vi.fn()}
        onTitleChange={vi.fn()}
        onTargetClustersChange={vi.fn()}
        onAskAI={vi.fn()}
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
        onUpdatePriority={vi.fn()}
        aiStreaming={false}
        planningMission={null}
      />
    )
    
    expect(screen.getByText('Define Your Mission')).toBeDefined()
    expect(screen.getByDisplayValue('Test Mission')).toBeDefined()
    expect(screen.getByDisplayValue('Test Description')).toBeDefined()
    expect(screen.getByText('Falco')).toBeDefined()
  })

  it('calls onAskAI when Suggest/Refine button is clicked', () => {
    const onAskAI = vi.fn()
    render(
      <FixerDefinitionPanel
        state={mockState as any}
        onDescriptionChange={vi.fn()}
        onTitleChange={vi.fn()}
        onTargetClustersChange={vi.fn()}
        onAskAI={onAskAI}
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
        onUpdatePriority={vi.fn()}
        aiStreaming={false}
        planningMission={null}
      />
    )
    
    const suggestBtn = screen.getByText('Refine')
    fireEvent.click(suggestBtn)
    expect(onAskAI).toHaveBeenCalledWith('Test Description', mockState.projects)
  })

  it('shows AI streaming indicator when aiStreaming is true', () => {
    render(
      <FixerDefinitionPanel
        state={mockState as any}
        onDescriptionChange={vi.fn()}
        onTitleChange={vi.fn()}
        onTargetClustersChange={vi.fn()}
        onAskAI={vi.fn()}
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
        onUpdatePriority={vi.fn()}
        aiStreaming={true}
        planningMission={{ status: 'running', messages: [] } as any}
      />
    )
    
    expect(screen.getAllByText('Thinking...').length).toBeGreaterThan(0)
  })
})
