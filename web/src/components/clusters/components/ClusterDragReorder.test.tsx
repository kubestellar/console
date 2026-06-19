import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClusterDragReorder, SortableClusterItem } from './ClusterDragReorder'
import type { ClusterInfo } from '../../../hooks/useMCP'
import type { DragEndEvent } from '@dnd-kit/core'

let lastDragEndHandler: ((event: DragEndEvent) => void) | undefined
let mockSortableState = {
  attributes: {},
  listeners: {},
  setNodeRef: vi.fn(),
  transform: null,
  transition: undefined as string | undefined,
  isDragging: false,
}

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode
    onDragEnd?: (event: DragEndEvent) => void
  }) => {
    lastDragEndHandler = onDragEnd
    return (
      <div>
        <button
          type="button"
          data-testid="trigger-drag-end"
          onClick={() =>
            onDragEnd?.({
              active: { id: 'cluster-a' },
              over: { id: 'cluster-c' },
            } as DragEndEvent)
          }
        >
          drag
        </button>
        {children}
      </div>
    )
  },
  closestCenter: vi.fn(),
  KeyboardSensor: class {},
  PointerSensor: class {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => (
    <div data-testid="sortable-context">{children}</div>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => mockSortableState,
  verticalListSortingStrategy: {},
  rectSortingStrategy: {},
  arrayMove: (items: unknown[], oldIndex: number, newIndex: number) => {
    const result = [...items]
    const [moved] = result.splice(oldIndex, 1)
    result.splice(newIndex, 0, moved)
    return result
  },
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

describe('ClusterDragReorder', () => {
  const mockClusters: ClusterInfo[] = [
    { name: 'cluster-a', reachable: true } as ClusterInfo,
    { name: 'cluster-b', reachable: true } as ClusterInfo,
    { name: 'cluster-c', reachable: true } as ClusterInfo,
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    lastDragEndHandler = undefined
  })

  it('renders children inside the sortable context', () => {
    render(
      <ClusterDragReorder clusters={mockClusters} layoutMode="grid" onReorder={vi.fn()}>
        <div data-testid="child">content</div>
      </ClusterDragReorder>,
    )

    expect(screen.getByTestId('sortable-context')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(lastDragEndHandler).toBeTypeOf('function')
  })

  it('reorders cluster names when dragging ends on a different target', () => {
    const onReorder = vi.fn()

    render(
      <ClusterDragReorder clusters={mockClusters} layoutMode="list" onReorder={onReorder}>
        <div>list</div>
      </ClusterDragReorder>,
    )

    fireEvent.click(screen.getByTestId('trigger-drag-end'))

    expect(onReorder).toHaveBeenCalledWith(['cluster-b', 'cluster-c', 'cluster-a'])
  })

  it('ignores drag end events when reordering is unavailable or invalid', () => {
    const onReorder = vi.fn()

    render(
      <ClusterDragReorder clusters={mockClusters} layoutMode="grid" onReorder={onReorder}>
        <div>grid</div>
      </ClusterDragReorder>,
    )

    lastDragEndHandler?.({
      active: { id: 'cluster-a' },
      over: { id: 'cluster-a' },
    } as DragEndEvent)
    lastDragEndHandler?.({
      active: { id: 'missing' },
      over: { id: 'cluster-b' },
    } as DragEndEvent)

    expect(onReorder).not.toHaveBeenCalled()

    render(
      <ClusterDragReorder clusters={mockClusters} layoutMode="grid">
        <div>no reorder</div>
      </ClusterDragReorder>,
    )

    fireEvent.click(screen.getAllByTestId('trigger-drag-end')[1])
    expect(onReorder).not.toHaveBeenCalled()
  })
})

describe('SortableClusterItem', () => {
  beforeEach(() => {
    mockSortableState = {
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }
  })

  it('renders a drag handle only when reordering is enabled', () => {
    const { rerender } = render(
      <SortableClusterItem id="cluster-a" onReorder={vi.fn()}>
        {(dragHandle) => <div>{dragHandle}<span>Cluster A</span></div>}
      </SortableClusterItem>,
    )

    expect(screen.getByTitle('Drag to reorder')).toBeInTheDocument()

    rerender(
      <SortableClusterItem id="cluster-a">
        {(dragHandle) => <div>{dragHandle}<span>Cluster A</span></div>}
      </SortableClusterItem>,
    )

    expect(screen.queryByTitle('Drag to reorder')).not.toBeInTheDocument()
  })

  it('applies dragging styles and test id to the wrapper', () => {
    mockSortableState = {
      ...mockSortableState,
      isDragging: true,
    }

    render(
      <SortableClusterItem id="cluster-b" onReorder={vi.fn()}>
        {() => <div>Cluster B</div>}
      </SortableClusterItem>,
    )

    const wrapper = screen.getByTestId('cluster-row-cluster-b')
    expect(wrapper).toHaveStyle({ position: 'relative', opacity: '0.5' })
  })
})
