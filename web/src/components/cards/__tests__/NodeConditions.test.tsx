import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { NodeConditions } from '../NodeConditions'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeNode = (overrides = {}) => ({
  name: 'node-1',
  cluster: 'cluster-1',
  unschedulable: false,
  conditions: [{ type: 'Ready', status: 'True' }],
  ...overrides,
})

const mockExecute = vi.fn()

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNodes: vi.fn(() => ({
    nodes: [],
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
  })),
}))

vi.mock('../../../hooks/useKubectl', () => ({
  useKubectl: () => ({ execute: mockExecute }),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: vi.fn(() => ({})),
}))

vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
  getDemoMode: () => false, default: () => false,
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.count !== undefined) return `${key}:${opts.count}`
      if (opts?.action !== undefined) return `${key}:${opts.action}`
      if (opts?.node !== undefined) return `${key}:${opts.node}`
      return key
    },
  }),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span data-testid="status-badge">{children}</span>,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NodeConditions', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('Loading state', () => {
    it('renders pulse skeletons when isLoading and no nodes', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [], isLoading: true, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      const pulses = document.querySelectorAll('.animate-pulse')
      expect(pulses.length).toBeGreaterThan(0)
    })
  })

  describe('Filter pills', () => {
    it('renders all 4 filter pills', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode()], isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      expect(screen.getByText(/nodeConditions.filterAll/)).toBeTruthy()
      expect(screen.getByText(/nodeConditions.filterHealthy/)).toBeTruthy()
      expect(screen.getByText(/nodeConditions.filterCordoned/)).toBeTruthy()
      expect(screen.getByText(/nodeConditions.filterPressure/)).toBeTruthy()
    })

    it('shows correct count in all pill', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode(), makeNode({ name: 'node-2' })],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      expect(screen.getByText(/nodeConditions.filterAll: 2/)).toBeTruthy()
    })

    it('filters to cordoned nodes on cordoned pill click', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [
          makeNode({ name: 'node-1', unschedulable: false }),
          makeNode({ name: 'node-2', unschedulable: true }),
        ],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      fireEvent.click(screen.getByText(/nodeConditions.filterCordoned/))
      // After filter, only cordoned node should be visible
      expect(screen.getByText('node-2')).toBeTruthy()
      expect(screen.queryByText('node-1')).toBeNull()
    })

    it('filters to healthy nodes', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [
          makeNode({ name: 'healthy-node' }),
          makeNode({ name: 'bad-node', conditions: [{ type: 'Ready', status: 'False' }] }),
        ],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      fireEvent.click(screen.getByText(/nodeConditions.filterHealthy/))
      expect(screen.getByText('healthy-node')).toBeTruthy()
      expect(screen.queryByText('bad-node')).toBeNull()
    })
  })

  describe('Node rows', () => {
    it('renders node name and cluster', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      expect(screen.getByText('node-1')).toBeTruthy()
      expect(screen.getByText('cluster-1')).toBeTruthy()
    })

    it('shows Cordoned badge for unschedulable nodes', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode({ unschedulable: true })],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      expect(screen.getByTestId('status-badge')).toBeTruthy()
    })

    it('shows pressure labels for nodes under disk/mem/pid pressure', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode({
          conditions: [
            { type: 'Ready', status: 'True' },
            { type: 'MemoryPressure', status: 'True' },
          ],
        })],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      expect(screen.getByText('Memory')).toBeTruthy()
    })
  })

  describe('Cordon/Uncordon action', () => {
    it('shows cordon button for schedulable nodes', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      expect(screen.getByText('nodeConditions.cordon')).toBeTruthy()
    })

    it('shows uncordon button for cordoned nodes', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode({ unschedulable: true })],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      expect(screen.getByText('nodeConditions.uncordon')).toBeTruthy()
    })

    it('shows confirmation dialog when cordon button clicked', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      fireEvent.click(screen.getByText('nodeConditions.cordon'))
      expect(screen.getByText('nodeConditions.cancel')).toBeTruthy()
    })

    it('cancels action when cancel button clicked', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      fireEvent.click(screen.getByText('nodeConditions.cordon'))
      fireEvent.click(screen.getByText('nodeConditions.cancel'))
      expect(screen.queryByText('nodeConditions.cancel')).toBeNull()
    })

    it('calls execute with cordon command on confirm', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      mockExecute.mockResolvedValue(undefined)
      render(<NodeConditions />)
      // Click the row cordon button to open the confirmation dialog
      await act(async () => fireEvent.click(screen.getByText('nodeConditions.cordon')))
      // The confirm button in the dialog renders first in DOM, row button second
      const buttons = screen.getAllByText('nodeConditions.cordon')
      await act(async () => fireEvent.click(buttons[0]))
      await waitFor(() => expect(mockExecute).toHaveBeenCalledWith('cluster-1', ['cordon', 'node-1']))
    })

    it('shows error message when execute fails', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes: [makeNode()],
        isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      mockExecute.mockRejectedValue(new Error('kubectl failed'))
      render(<NodeConditions />)
      // Click the row cordon button to open the confirmation dialog
      await act(async () => fireEvent.click(screen.getByText('nodeConditions.cordon')))
      // The confirm button in the dialog renders first in DOM, row button second
      const buttons = screen.getAllByText('nodeConditions.cordon')
      await act(async () => fireEvent.click(buttons[0]))
      await waitFor(() => expect(screen.getByText(/kubectl failed/)).toBeTruthy())
    })
  })

  describe('Overflow truncation', () => {
    it('shows "more nodes" message when over 20 nodes', async () => {
      const { useCachedNodes } = await import('../../../hooks/useCachedData')
      const nodes = Array.from({ length: 25 }, (_, i) => makeNode({ name: `node-${i}` }))
      vi.mocked(useCachedNodes).mockReturnValue({
        nodes, isLoading: false, isRefreshing: false, isDemoFallback: false, isFailed: false, consecutiveFailures: 0,
      } as never)
      render(<NodeConditions />)
      expect(screen.getByText(/nodeConditions.moreNodes/)).toBeTruthy()
    })
  })
})