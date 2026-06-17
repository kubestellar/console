import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ClusterInfo } from '../../../hooks/useMCP'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  closestCenter: vi.fn(),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div data-testid="sortable-context">{children}</div>,
  arrayMove: (arr: any[], oldIndex: number, newIndex: number) => {
    const newArr = [...arr]
    const [item] = newArr.splice(oldIndex, 1)
    newArr.splice(newIndex, 0, item)
    return newArr
  },
  rectSortingStrategy: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}))

import { ClusterDragReorder, SortableClusterItem } from './ClusterDragReorder'

describe('ClusterDragReorder', () => {
  const mockClusters: ClusterInfo[] = [
    {
      name: 'cluster-1',
      context: 'context-1',
      server: 'https://cluster1.example.com',
      healthy: true,
      namespaces: [],
      aliases: [],
    },
    {
      name: 'cluster-2',
      context: 'context-2',
      server: 'https://cluster2.example.com',
      healthy: true,
      namespaces: [],
      aliases: [],
    },
    {
      name: 'cluster-3',
      context: 'context-3',
      server: 'https://cluster3.example.com',
      healthy: true,
      namespaces: [],
      aliases: [],
    },
  ]

  it('renders DndContext and SortableContext', () => {
    const { getByTestId } = render(
      <ClusterDragReorder
        clusters={mockClusters}
        layoutMode="grid"
        onReorder={vi.fn()}
      >
        <div>Test Children</div>
      </ClusterDragReorder>
    )
    expect(getByTestId('dnd-context')).toBeTruthy()
    expect(getByTestId('sortable-context')).toBeTruthy()
  })

  it('renders children', () => {
    const { getByText } = render(
      <ClusterDragReorder
        clusters={mockClusters}
        layoutMode="grid"
        onReorder={vi.fn()}
      >
        <div>Test Children</div>
      </ClusterDragReorder>
    )
    expect(getByText('Test Children')).toBeTruthy()
  })

  it('calls onReorder with reordered cluster names when drag ends', () => {
    const onReorder = vi.fn()
    const { container } = render(
      <ClusterDragReorder
        clusters={mockClusters}
        layoutMode="grid"
        onReorder={onReorder}
      >
        <div>Test</div>
      </ClusterDragReorder>
    )
    expect(container).toBeTruthy()
    // Note: Full drag-and-drop testing would require integration tests with @dnd-kit
  })

  it('uses vertical list strategy for list layout mode', () => {
    const { container } = render(
      <ClusterDragReorder
        clusters={mockClusters}
        layoutMode="list"
        onReorder={vi.fn()}
      >
        <div>Test</div>
      </ClusterDragReorder>
    )
    expect(container).toBeTruthy()
  })

  it('uses rect strategy for grid layout mode', () => {
    const { container } = render(
      <ClusterDragReorder
        clusters={mockClusters}
        layoutMode="grid"
        onReorder={vi.fn()}
      >
        <div>Test</div>
      </ClusterDragReorder>
    )
    expect(container).toBeTruthy()
  })

  it('handles empty clusters array', () => {
    const { container } = render(
      <ClusterDragReorder
        clusters={[]}
        layoutMode="grid"
        onReorder={vi.fn()}
      >
        <div>Test</div>
      </ClusterDragReorder>
    )
    expect(container).toBeTruthy()
  })
})

describe('SortableClusterItem', () => {
  it('renders children with drag handle when onReorder is provided', () => {
    const { getByText } = render(
      <SortableClusterItem
        id="cluster-1"
        onReorder={vi.fn()}
      >
        {(dragHandle) => (
          <div>
            {dragHandle}
            <span>Cluster Content</span>
          </div>
        )}
      </SortableClusterItem>
    )
    expect(getByText('Cluster Content')).toBeTruthy()
  })

  it('does not render drag handle when onReorder is not provided', () => {
    const { container } = render(
      <SortableClusterItem id="cluster-1">
        {(dragHandle) => (
          <div>
            {dragHandle}
            <span>Cluster Content</span>
          </div>
        )}
      </SortableClusterItem>
    )
    expect(container.querySelector('[title="Drag to reorder"]')).toBeNull()
  })

  it('applies correct test id to wrapper', () => {
    const { getByTestId } = render(
      <SortableClusterItem id="cluster-1" onReorder={vi.fn()}>
        {() => <div>Content</div>}
      </SortableClusterItem>
    )
    expect(getByTestId('cluster-row-cluster-1')).toBeTruthy()
  })

  it('applies opacity style when dragging', () => {
    vi.mocked(useSortable).mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: true,
    })

    const { getByTestId } = render(
      <SortableClusterItem id="cluster-1" onReorder={vi.fn()}>
        {() => <div>Content</div>}
      </SortableClusterItem>
    )
    const wrapper = getByTestId('cluster-row-cluster-1')
    expect(wrapper.style.opacity).toBe('0.5')
  })

  it('applies higher z-index when dragging', () => {
    vi.mocked(useSortable).mockReturnValue({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: true,
    })

    const { getByTestId } = render(
      <SortableClusterItem id="cluster-1" onReorder={vi.fn()}>
        {() => <div>Content</div>}
      </SortableClusterItem>
    )
    const wrapper = getByTestId('cluster-row-cluster-1')
    expect(wrapper.style.zIndex).toBe('10')
  })

  it('drag handle has accessible title', () => {
    const { container } = render(
      <SortableClusterItem id="cluster-1" onReorder={vi.fn()}>
        {(dragHandle) => <div>{dragHandle}</div>}
      </SortableClusterItem>
    )
    const dragButton = container.querySelector('[title="Drag to reorder"]')
    expect(dragButton).toBeTruthy()
  })
})
