import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterDragReorder, SortableClusterItem } from './ClusterDragReorder'
import type { ClusterInfo } from '../../../hooks/useMCP'
import type { DragEndEvent } from '@dnd-kit/core'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Mock @dnd-kit modules
vi.mock('@dnd-kit/core', () => {
  const actualCore = vi.importActual('@dnd-kit/core')
  return {
    ...actualCore,
    DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd?: (event: DragEndEvent) => void }) => {
      // Expose onDragEnd for testing via data attribute
      return <div data-testid="dnd-context" data-ondragend={onDragEnd ? 'present' : 'absent'}>{children}</div>
    },
    useSensor: vi.fn(),
    useSensors: vi.fn(() => []),
    PointerSensor: vi.fn(),
    KeyboardSensor: vi.fn(),
    closestCenter: vi.fn(),
  }
})

vi.mock('@dnd-kit/sortable', () => {
  const actualSortable = vi.importActual('@dnd-kit/sortable')
  return {
    ...actualSortable,
    SortableContext: ({ children }: { children: React.ReactNode }) => <div data-testid="sortable-context">{children}</div>,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
    arrayMove: (array: unknown[], oldIndex: number, newIndex: number) => {
      const result = [...array]
      const [removed] = result.splice(oldIndex, 1)
      result.splice(newIndex, 0, removed)
      return result
    },
    rectSortingStrategy: vi.fn(),
    verticalListSortingStrategy: vi.fn(),
    sortableKeyboardCoordinates: vi.fn(),
  }
})

describe('ClusterDragReorder', () => {
  const mockClusters: ClusterInfo[] = [
    { name: 'cluster-a', reachable: true } as ClusterInfo,
    { name: 'cluster-b', reachable: true } as ClusterInfo,
    { name: 'cluster-c', reachable: true } as ClusterInfo,
  ]

  const mockOnReorder = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children inside DndContext and SortableContext', () => {
    render(
      <ClusterDragReorder clusters={mockClusters} layoutMode="grid" onReorder={mockOnReorder}>
        <div data-testid="test-child">Test Content</div>
      </ClusterDragReorder>,
    )

    expect(screen.getByTestId('dnd-context')).toBeInTheDocument()
    expect(screen.getByTestId('sortable-context')).toBeInTheDocument()
    expect(screen.getByTestId('test-child')).toBeInTheDocument()
  })

  it('renders with list layout mode', () => {
    render(
      <ClusterDragReorder clusters={mockClusters} layoutMode="list" onReorder={mockOnReorder}>
        <div>List Layout</div>
      </ClusterDragReorder>,
    )

    expect(screen.getByTestId('dnd-context')).toBeInTheDocument()
  })

  it('renders with grid layout mode', () => {
    render(
      <ClusterDragReorder clusters={mockClusters} layoutMode="grid" onReorder={mockOnReorder}>
        <div>Grid Layout</div>
      </ClusterDragReorder>,
    )

    expect(screen.getByTestId('dnd-context')).toBeInTheDocument()
  })

  it('renders without onReorder callback', () => {
    render(
      <ClusterDragReorder clusters={mockClusters} layoutMode="grid">
        <div data-testid="test-child">No Reorder</div>
      </ClusterDragReorder>,
    )

    expect(screen.getByTestId('test-child')).toBeInTheDocument()
  })

  it('handles empty clusters array', () => {
    render(
      <ClusterDragReorder clusters={[]} layoutMode="grid" onReorder={mockOnReorder}>
        <div data-testid="empty-child">Empty</div>
      </ClusterDragReorder>,
    )

    expect(screen.getByTestId('empty-child')).toBeInTheDocument()
  })
})

describe('SortableClusterItem', () => {
  const mockOnReorder = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children with drag handle when onReorder is provided', () => {
    render(
      <SortableClusterItem id="cluster-a" onReorder={mockOnReorder}>
        {(dragHandle) => (
          <div data-testid="cluster-item">
            {dragHandle}
            <span>Cluster A</span>
          </div>
        )}
      </SortableClusterItem>,
    )

    expect(screen.getByTestId('cluster-item')).toBeInTheDocument()
    expect(screen.getByText('Cluster A')).toBeInTheDocument()
    expect(screen.getByTitle('Drag to reorder')).toBeInTheDocument()
  })

  it('renders children without drag handle when onReorder is not provided', () => {
    render(
      <SortableClusterItem id="cluster-a">
        {(dragHandle) => (
          <div data-testid="cluster-item">
            {dragHandle}
            <span>Cluster A</span>
          </div>
        )}
      </SortableClusterItem>,
    )

    expect(screen.getByTestId('cluster-item')).toBeInTheDocument()
    expect(screen.getByText('Cluster A')).toBeInTheDocument()
    expect(screen.queryByTitle('Drag to reorder')).not.toBeInTheDocument()
  })

  it('renders with correct data-testid', () => {
    render(
      <SortableClusterItem id="cluster-xyz" onReorder={mockOnReorder}>
        {() => <div>Content</div>}
      </SortableClusterItem>,
    )

    expect(screen.getByTestId('cluster-row-cluster-xyz')).toBeInTheDocument()
  })

  it('applies correct styles to the wrapper', () => {
    render(
      <SortableClusterItem id="cluster-a" onReorder={mockOnReorder}>
        {() => <div>Content</div>}
      </SortableClusterItem>,
    )

    const wrapper = screen.getByTestId('cluster-row-cluster-a')
    expect(wrapper).toHaveStyle({ position: 'relative', opacity: '1' })
  })
})
