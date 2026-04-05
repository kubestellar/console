import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module that transitively imports them
// ---------------------------------------------------------------------------

const mockUseCachedNodes = vi.fn()
vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNodes: () => mockUseCachedNodes(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (opts: unknown) => mockUseCardLoadingState(opts),
}))

const mockUseDemoMode = vi.fn()
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

const mockExecute = vi.fn()
vi.mock('../../../hooks/useKubectl', () => ({
  useKubectl: () => ({ execute: mockExecute }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return key.replace('{{count}}', String(opts.count))
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// ---------------------------------------------------------------------------
// Import the component under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import { NodeConditions } from '../NodeConditions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    name: 'node-1',
    cluster: 'cluster-a',
    status: 'Ready',
    roles: ['worker'],
    kubeletVersion: 'v1.29.0',
    cpuCapacity: '4',
    memoryCapacity: '8Gi',
    podCapacity: '110',
    conditions: [{ type: 'Ready', status: 'True' }],
    unschedulable: false,
    ...overrides,
  }
}

function healthyNode(name: string, cluster = 'cluster-a') {
  return makeNode({ name, cluster })
}

function pressureNode(name: string, pressureTypes: string[], cluster = 'cluster-a') {
  return makeNode({
    name,
    cluster,
    conditions: [
      { type: 'Ready', status: 'True' },
      ...pressureTypes.map(t => ({ type: t, status: 'True' })),
    ],
  })
}

function cordonedNode(name: string, cluster = 'cluster-a') {
  return makeNode({ name, cluster, unschedulable: true })
}

function notReadyNode(name: string, cluster = 'cluster-a') {
  return makeNode({
    name,
    cluster,
    status: 'NotReady',
    conditions: [{ type: 'Ready', status: 'False' }],
  })
}

function cachedNodesDefaults(nodes: ReturnType<typeof makeNode>[] = []) {
  return {
    nodes,
    data: nodes,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    error: null,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NodeConditions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false, setDemoMode: vi.fn() })
    mockUseCardLoadingState.mockReturnValue(undefined)
    mockExecute.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // Loading / skeleton state
  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('renders pulse skeletons when loading with no data', () => {
      mockUseCachedNodes.mockReturnValue({
        ...cachedNodesDefaults(),
        isLoading: true,
        nodes: [],
      })

      const { container } = render(<NodeConditions />)
      const pulses = container.querySelectorAll('.animate-pulse')
      expect(pulses.length).toBe(4)
    })

    it('passes isLoading true and hasAnyData false to useCardLoadingState when loading with no nodes', () => {
      mockUseCachedNodes.mockReturnValue({
        ...cachedNodesDefaults(),
        isLoading: true,
        nodes: [],
      })

      render(<NodeConditions />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isLoading: true,
          hasAnyData: false,
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // Empty state (loaded, no nodes)
  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('renders filter buttons showing zero counts when there are no nodes', () => {
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults([]))

      render(<NodeConditions />)

      // All filter buttons should show 0
      const buttons = screen.getAllByRole('button')
      const filterButtons = buttons.filter(b => b.textContent?.includes(': 0'))
      expect(filterButtons.length).toBe(4)
    })
  })

  // -------------------------------------------------------------------------
  // Healthy nodes rendering
  // -------------------------------------------------------------------------
  describe('healthy nodes', () => {
    it('renders node names and cluster labels', () => {
      const nodes = [healthyNode('worker-1', 'prod'), healthyNode('worker-2', 'prod')]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      expect(screen.getByText('worker-1')).toBeInTheDocument()
      expect(screen.getByText('worker-2')).toBeInTheDocument()
      expect(screen.getAllByText('prod').length).toBe(2)
    })

    it('shows correct summary counts for healthy nodes', () => {
      const nodes = [healthyNode('n1'), healthyNode('n2'), healthyNode('n3')]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      // The "All" filter should show total count 3
      const allButton = screen.getByText(/nodeConditions\.filterAll.*3/)
      expect(allButton).toBeInTheDocument()

      // The "Healthy" filter should show 3
      const healthyButton = screen.getByText(/nodeConditions\.filterHealthy.*3/)
      expect(healthyButton).toBeInTheDocument()
    })

    it('renders a green dot indicator for healthy nodes', () => {
      const nodes = [healthyNode('worker-1')]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      const { container } = render(<NodeConditions />)

      const dot = container.querySelector('.bg-green-500')
      expect(dot).toBeInTheDocument()
    })

    it('renders a Cordon button for each node with a cluster', () => {
      const nodes = [healthyNode('worker-1')]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      expect(screen.getByText('nodeConditions.cordon')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Pressure conditions rendering
  // -------------------------------------------------------------------------
  describe('pressure conditions', () => {
    it('renders pressure badges for nodes with DiskPressure', () => {
      const nodes = [pressureNode('disk-node', ['DiskPressure'])]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      // The component strips "Pressure" suffix: DiskPressure -> "Disk"
      expect(screen.getByText('Disk')).toBeInTheDocument()
    })

    it('renders pressure badges for nodes with MemoryPressure', () => {
      const nodes = [pressureNode('mem-node', ['MemoryPressure'])]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      expect(screen.getByText('Memory')).toBeInTheDocument()
    })

    it('renders pressure badges for nodes with PIDPressure', () => {
      const nodes = [pressureNode('pid-node', ['PIDPressure'])]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      expect(screen.getByText('PID')).toBeInTheDocument()
    })

    it('renders multiple pressure badges on a single node', () => {
      const nodes = [pressureNode('multi-pressure', ['DiskPressure', 'MemoryPressure'])]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      expect(screen.getByText('Disk')).toBeInTheDocument()
      expect(screen.getByText('Memory')).toBeInTheDocument()
    })

    it('shows correct pressure count in the filter summary', () => {
      const nodes = [
        healthyNode('healthy-1'),
        pressureNode('disk-node', ['DiskPressure']),
        pressureNode('mem-node', ['MemoryPressure']),
      ]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      // Pressure count should be 2
      const pressureButton = screen.getByText(/nodeConditions\.filterPressure.*2/)
      expect(pressureButton).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Cordoned nodes rendering
  // -------------------------------------------------------------------------
  describe('cordoned nodes', () => {
    it('renders a Cordoned badge and yellow dot for cordoned nodes', () => {
      const nodes = [cordonedNode('cordoned-1')]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      const { container } = render(<NodeConditions />)

      expect(screen.getByText('nodeConditions.cordoned')).toBeInTheDocument()
      const dot = container.querySelector('.bg-yellow-500')
      expect(dot).toBeInTheDocument()
    })

    it('renders an Uncordon button for cordoned nodes', () => {
      const nodes = [cordonedNode('cordoned-1')]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      expect(screen.getByText('nodeConditions.uncordon')).toBeInTheDocument()
    })

    it('shows correct cordoned count in the filter summary', () => {
      const nodes = [
        healthyNode('healthy-1'),
        cordonedNode('cordoned-1'),
        cordonedNode('cordoned-2'),
      ]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      const cordonedButton = screen.getByText(/nodeConditions\.filterCordoned.*2/)
      expect(cordonedButton).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Not-ready nodes
  // -------------------------------------------------------------------------
  describe('not-ready nodes', () => {
    it('renders a red dot for not-ready nodes', () => {
      const nodes = [notReadyNode('bad-node')]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      const { container } = render(<NodeConditions />)

      const dot = container.querySelector('.bg-red-500')
      expect(dot).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Filter interactions
  // -------------------------------------------------------------------------
  describe('filter interactions', () => {
    it('filters to only healthy nodes when Healthy button is clicked', async () => {
      const user = userEvent.setup()
      // Use a not-ready node instead of pressure — pressure nodes with Ready=True
      // also count as "healthy" per the component's filter logic.
      const nodes = [
        healthyNode('healthy-1'),
        notReadyNode('notready-1'),
        cordonedNode('cordoned-1'),
      ]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      // Click the Healthy filter button (count = 1)
      const healthyButton = screen.getByText(/nodeConditions\.filterHealthy.*1/)
      await user.click(healthyButton)

      // Only healthy-1 should remain visible
      expect(screen.getByText('healthy-1')).toBeInTheDocument()
      expect(screen.queryByText('notready-1')).not.toBeInTheDocument()
      expect(screen.queryByText('cordoned-1')).not.toBeInTheDocument()
    })

    it('filters to only pressure nodes when Pressure button is clicked', async () => {
      const user = userEvent.setup()
      const nodes = [
        healthyNode('healthy-1'),
        pressureNode('pressure-1', ['DiskPressure']),
      ]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      const pressureButton = screen.getByText(/nodeConditions\.filterPressure.*1/)
      await user.click(pressureButton)

      expect(screen.queryByText('healthy-1')).not.toBeInTheDocument()
      expect(screen.getByText('pressure-1')).toBeInTheDocument()
    })

    it('filters to only cordoned nodes when Cordoned button is clicked', async () => {
      const user = userEvent.setup()
      const nodes = [
        healthyNode('healthy-1'),
        cordonedNode('cordoned-1'),
      ]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      const cordonedButton = screen.getByText(/nodeConditions\.filterCordoned.*1/)
      await user.click(cordonedButton)

      expect(screen.queryByText('healthy-1')).not.toBeInTheDocument()
      expect(screen.getByText('cordoned-1')).toBeInTheDocument()
    })

    it('shows all nodes when All button is clicked after filtering', async () => {
      const user = userEvent.setup()
      const nodes = [
        healthyNode('healthy-1'),
        pressureNode('pressure-1', ['DiskPressure']),
      ]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      // Filter to pressure first
      const pressureButton = screen.getByText(/nodeConditions\.filterPressure.*1/)
      await user.click(pressureButton)
      expect(screen.queryByText('healthy-1')).not.toBeInTheDocument()

      // Click All to show everything
      const allButton = screen.getByText(/nodeConditions\.filterAll.*2/)
      await user.click(allButton)

      expect(screen.getByText('healthy-1')).toBeInTheDocument()
      expect(screen.getByText('pressure-1')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Node list truncation
  // -------------------------------------------------------------------------
  describe('node list truncation', () => {
    it('shows a "more nodes" message when there are more than 20 nodes', () => {
      const nodes = Array.from({ length: 25 }, (_, i) => healthyNode(`node-${i}`))
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      // Only first 20 nodes rendered
      expect(screen.getByText('node-0')).toBeInTheDocument()
      expect(screen.getByText('node-19')).toBeInTheDocument()
      expect(screen.queryByText('node-20')).not.toBeInTheDocument()

      // The "+X more nodes" text should appear
      expect(screen.getByText(/nodeConditions\.moreNodes/)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Cordon / Uncordon actions
  // -------------------------------------------------------------------------
  describe('cordon/uncordon actions', () => {
    it('calls execute with cordon when Cordon button is clicked on a healthy node', async () => {
      const user = userEvent.setup()
      const nodes = [healthyNode('worker-1', 'prod')]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      // Click the cordon button to open the confirmation dialog
      const cordonBtn = screen.getByText('nodeConditions.cordon')
      await user.click(cordonBtn)

      // The confirmation dialog should show the confirm title
      expect(screen.getByText(/nodeConditions\.confirmTitle/)).toBeInTheDocument()

      // Click the confirm button in the dialog (find by role within the dialog)
      const allButtons = screen.getAllByRole('button')
      const confirmBtn = allButtons.find(b =>
        b.textContent === 'nodeConditions.cordon' && b !== cordonBtn
      )!
      await user.click(confirmBtn)

      expect(mockExecute).toHaveBeenCalledWith('prod', ['cordon', 'worker-1'])
    })

    it('calls execute with uncordon when Uncordon button is clicked on a cordoned node', async () => {
      const user = userEvent.setup()
      const nodes = [cordonedNode('worker-1', 'prod')]
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults(nodes))

      render(<NodeConditions />)

      // Click the uncordon button to open the confirmation dialog
      const uncordonBtn = screen.getByText('nodeConditions.uncordon')
      await user.click(uncordonBtn)

      // The confirmation dialog should show the confirm title
      expect(screen.getByText(/nodeConditions\.confirmTitle/)).toBeInTheDocument()

      // Click the confirm button in the dialog (find by role within the dialog)
      const allButtons = screen.getAllByRole('button')
      const confirmBtn = allButtons.find(b =>
        b.textContent === 'nodeConditions.uncordon' && b !== uncordonBtn
      )!
      await user.click(confirmBtn)

      expect(mockExecute).toHaveBeenCalledWith('prod', ['uncordon', 'worker-1'])
    })
  })

  // -------------------------------------------------------------------------
  // Demo data
  // -------------------------------------------------------------------------
  describe('demo data', () => {
    it('reports isDemoData as true when isDemoFallback is true', () => {
      mockUseCachedNodes.mockReturnValue({
        ...cachedNodesDefaults([healthyNode('n1')]),
        isDemoFallback: true,
      })

      render(<NodeConditions />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isDemoData: true,
        })
      )
    })

    it('reports isDemoData as true when global demo mode is enabled', () => {
      mockUseDemoMode.mockReturnValue({ isDemoMode: true, setDemoMode: vi.fn() })
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults([healthyNode('n1')]))

      render(<NodeConditions />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isDemoData: true,
        })
      )
    })

    it('reports isDemoData as false for live data', () => {
      mockUseCachedNodes.mockReturnValue(cachedNodesDefaults([healthyNode('n1')]))

      render(<NodeConditions />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isDemoData: false,
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // Failure states
  // -------------------------------------------------------------------------
  describe('failure states', () => {
    it('passes isFailed and consecutiveFailures to useCardLoadingState', () => {
      mockUseCachedNodes.mockReturnValue({
        ...cachedNodesDefaults([healthyNode('n1')]),
        isFailed: true,
        consecutiveFailures: 3,
      })

      render(<NodeConditions />)

      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: true,
          consecutiveFailures: 3,
        })
      )
    })
  })
})
