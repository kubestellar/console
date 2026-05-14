import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import {
  CardSearchInput,
  CardClusterFilter,
  CardControlsRow,
  CardPaginationFooter,
  CardListItem,
  CardAIActions,
  CardEmptyState,
  useDropdownPortal,
} from '../CardComponents'
import type { CardClusterFilterProps } from '../CardComponents'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../components/cards/CardWrapper', () => ({
  useCardType: () => 'test-card',
}))

const mockEmitCardSearchUsed = vi.fn()
const mockEmitCardClusterFilterChanged = vi.fn()
const mockEmitCardListItemClicked = vi.fn()
const mockEmitCardPaginationUsed = vi.fn()

vi.mock('../../analytics', () => ({
  emitCardSearchUsed: (...args: unknown[]) => mockEmitCardSearchUsed(...args),
  emitCardClusterFilterChanged: (...args: unknown[]) => mockEmitCardClusterFilterChanged(...args),
  emitCardListItemClicked: (...args: unknown[]) => mockEmitCardListItemClicked(...args),
  emitCardPaginationUsed: (...args: unknown[]) => mockEmitCardPaginationUsed(...args),
}))

const mockStartMission = vi.fn()
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

const mockCheckKeyAndRun = vi.fn((fn: () => void) => fn())
const mockGoToSettings = vi.fn()
const mockDismissPrompt = vi.fn()

vi.mock('../../../components/cards/console-missions/shared', () => ({
  useApiKeyCheck: () => ({
    showKeyPrompt: false,
    checkKeyAndRun: mockCheckKeyAndRun,
    goToSettings: mockGoToSettings,
    dismissPrompt: mockDismissPrompt,
  }),
  ApiKeyPromptModal: () => null,
}))

vi.mock('../../../components/ui/ClusterStatusBadge', () => ({
  ClusterStatusDot: ({ state }: { state: string }) => <span data-testid="status-dot">{state}</span>,
  getClusterState: (_healthy: boolean, reachable?: boolean) => {
    if (reachable === false) return 'unreachable'
    return 'healthy'
  },
}))

vi.mock('../../../components/ui/Skeleton', () => ({
  Skeleton: ({ height, width, variant, className }: { height?: number; width?: number; variant?: string; className?: string }) => (
    <div data-testid="skeleton" data-variant={variant} data-height={height} data-width={width} className={className} />
  ),
}))

vi.mock('../../../components/ui/Pagination', () => ({
  Pagination: ({ onPageChange, currentPage }: { onPageChange: (p: number) => void; currentPage: number }) => (
    <div data-testid="pagination">
      <button data-testid="next-page" onClick={() => onPageChange(currentPage + 1)}>Next</button>
    </div>
  ),
}))

vi.mock('../../../components/ui/CardControls', () => ({
  CardControls: () => <div data-testid="card-controls" />,
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// CardSearchInput
// ---------------------------------------------------------------------------

describe('CardSearchInput', () => {
  it('renders with value and placeholder', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="hello" onChange={onChange} placeholder="Search items..." />)
    const input = screen.getByPlaceholderText('Search items...')
    expect(input).toBeTruthy()
    expect((input as HTMLInputElement).value).toBe('hello')
  })

  it('calls onChange immediately when no debounceMs', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'test' } })
    expect(onChange).toHaveBeenCalledWith('test')
  })

  it('debounces onChange when debounceMs is set', () => {
    const DEBOUNCE_MS = 300
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} debounceMs={DEBOUNCE_MS} />)
    const input = screen.getByPlaceholderText('Search...')

    fireEvent.change(input, { target: { value: 'deb' } })
    expect(onChange).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS) })
    expect(onChange).toHaveBeenCalledWith('deb')
  })

  it('emits analytics on blur-sm when value is non-empty', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="query" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Search...')
    fireEvent.blur(input)
    expect(mockEmitCardSearchUsed).toHaveBeenCalledWith(5, 'test-card')
  })

  it('does not emit analytics on blur-sm when value is empty', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} />)
    const input = screen.getByPlaceholderText('Search...')
    fireEvent.blur(input)
    expect(mockEmitCardSearchUsed).not.toHaveBeenCalled()
  })

  it('emits analytics on blur-sm using localValue when debounced', () => {
    const DEBOUNCE_MS = 300
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} debounceMs={DEBOUNCE_MS} />)
    const input = screen.getByPlaceholderText('Search...')

    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)
    expect(mockEmitCardSearchUsed).toHaveBeenCalledWith(3, 'test-card')
  })

  it('applies custom className and keeps the icon positioned inside the input', () => {
    const onChange = vi.fn()
    const { container } = render(<CardSearchInput value="" onChange={onChange} className="my-custom" />)
    const wrapper = container.firstChild as HTMLDivElement | null
    const icon = container.querySelector('svg')

    expect(container.querySelector('.my-custom')).toBeTruthy()
    expect(wrapper?.className).toContain('relative')
    expect(icon?.getAttribute('class')).toContain('absolute')
    expect(icon?.getAttribute('class')).toContain('top-1/2')
  })

  it('clears debounce timer on unmount', () => {
    const DEBOUNCE_MS = 300
    const onChange = vi.fn()
    const { unmount } = render(<CardSearchInput value="" onChange={onChange} debounceMs={DEBOUNCE_MS} />)
    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'unmount-test' } })
    unmount()
    act(() => { vi.advanceTimersByTime(DEBOUNCE_MS) })
    expect(onChange).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// CardClusterFilter
// ---------------------------------------------------------------------------

describe('CardClusterFilter', () => {
  const defaultProps: CardClusterFilterProps = {
    availableClusters: [
      { name: 'cluster-a', healthy: true, reachable: true },
      { name: 'cluster-b', healthy: true, reachable: true },
      { name: 'cluster-c', healthy: true, reachable: false },
    ],
    selectedClusters: [],
    onToggle: vi.fn(),
    onClear: vi.fn(),
    isOpen: false,
    setIsOpen: vi.fn(),
    containerRef: React.createRef<HTMLDivElement>(),
    minClusters: 2,
  }

  it('returns null when clusters are below minClusters', () => {
    const { container } = render(
      <CardClusterFilter {...defaultProps} availableClusters={[{ name: 'only-one' }]} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders filter button when enough clusters', () => {
    render(<CardClusterFilter {...defaultProps} />)
    expect(screen.getByTitle('Filter by cluster')).toBeTruthy()
  })

  it('toggles dropdown on button click', () => {
    const setIsOpen = vi.fn()
    render(<CardClusterFilter {...defaultProps} setIsOpen={setIsOpen} />)
    fireEvent.click(screen.getByTitle('Filter by cluster'))
    expect(setIsOpen).toHaveBeenCalledWith(true)
  })

  it('renders dropdown portal when open', () => {
    // Mock getBoundingClientRect for positioning
    const btnRef = { current: null as HTMLButtonElement | null }
    const { container } = render(<CardClusterFilter {...defaultProps} isOpen={true} />)
    // The portal renders into document.body
    const allClustersBtn = screen.queryByText('All clusters')
    expect(allClustersBtn).toBeTruthy()
  })

  it('calls onClear and emits analytics when "All clusters" clicked', () => {
    const onClear = vi.fn()
    render(<CardClusterFilter {...defaultProps} isOpen={true} onClear={onClear} />)
    fireEvent.click(screen.getByText('All clusters'))
    expect(onClear).toHaveBeenCalled()
    expect(mockEmitCardClusterFilterChanged).toHaveBeenCalledWith(0, 3, 'test-card')
  })

  it('calls onToggle for healthy cluster', () => {
    const onToggle = vi.fn()
    render(<CardClusterFilter {...defaultProps} isOpen={true} onToggle={onToggle} />)
    fireEvent.click(screen.getByText('cluster-a'))
    expect(onToggle).toHaveBeenCalledWith('cluster-a')
  })

  it('does not call onToggle for unreachable cluster', () => {
    const onToggle = vi.fn()
    render(<CardClusterFilter {...defaultProps} isOpen={true} onToggle={onToggle} />)
    // cluster-c is unreachable, its button should be disabled
    const clusterCBtn = screen.getByText('cluster-c').closest('button')
    expect(clusterCBtn).toBeDisabled()
    fireEvent.click(clusterCBtn!)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('shows selected cluster highlighting', () => {
    render(
      <CardClusterFilter {...defaultProps} isOpen={true} selectedClusters={['cluster-a']} />
    )
    const clusterABtn = screen.getByText('cluster-a').closest('button')
    expect(clusterABtn?.className).toContain('bg-purple-500/20')
  })

  it('shows active style on filter button when clusters selected', () => {
    const { container } = render(
      <CardClusterFilter {...defaultProps} selectedClusters={['cluster-a']} />
    )
    const btn = screen.getByTitle('Filter by cluster')
    expect(btn.className).toContain('bg-purple-500/20')
  })
})

// ---------------------------------------------------------------------------
// CardListItem
// ---------------------------------------------------------------------------

describe('CardListItem', () => {
  it('renders children', () => {
    render(<CardListItem>Hello List Item</CardListItem>)
    expect(screen.getByText('Hello List Item')).toBeTruthy()
  })

  it('renders as clickable when onClick is provided', () => {
    const onClick = vi.fn()
    const { container } = render(<CardListItem onClick={onClick}>Click me</CardListItem>)
    const item = container.querySelector('[role="button"]')
    expect(item).toBeTruthy()
    fireEvent.click(item!)
    expect(onClick).toHaveBeenCalled()
    expect(mockEmitCardListItemClicked).toHaveBeenCalledWith('test-card')
  })

  it('does not render role=button when no onClick', () => {
    const { container } = render(<CardListItem>Static</CardListItem>)
    expect(container.querySelector('[role="button"]')).toBeNull()
  })

  it('handles keyboard Enter and Space', () => {
    const onClick = vi.fn()
    const { container } = render(<CardListItem onClick={onClick}>KB</CardListItem>)
    const item = container.querySelector('[role="button"]')!
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(item, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('ignores other key presses', () => {
    const onClick = vi.fn()
    const { container } = render(<CardListItem onClick={onClick}>KB</CardListItem>)
    const item = container.querySelector('[role="button"]')!
    fireEvent.keyDown(item, { key: 'Tab' })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies variant classes', () => {
    const { container } = render(<CardListItem variant="success">Succ</CardListItem>)
    expect(container.querySelector('.bg-green-500\\/20')).toBeTruthy()
  })

  it('applies error variant classes', () => {
    const { container } = render(<CardListItem variant="error">Err</CardListItem>)
    expect(container.querySelector('.bg-red-500\\/20')).toBeTruthy()
  })

  it('applies warning variant classes', () => {
    const { container } = render(<CardListItem variant="warning">Warn</CardListItem>)
    expect(container.querySelector('.bg-yellow-500\\/20')).toBeTruthy()
  })

  it('applies info variant classes', () => {
    const { container } = render(<CardListItem variant="info">Info</CardListItem>)
    expect(container.querySelector('.bg-blue-500\\/20')).toBeTruthy()
  })

  it('applies custom bgClass and borderClass', () => {
    const { container } = render(
      <CardListItem bgClass="bg-custom" borderClass="border-custom">Custom</CardListItem>
    )
    expect(container.querySelector('.bg-custom')).toBeTruthy()
    expect(container.querySelector('.border-custom')).toBeTruthy()
  })

  it('hides chevron when showChevron is false', () => {
    const onClick = vi.fn()
    const { container } = render(
      <CardListItem onClick={onClick} showChevron={false}>No Chevron</CardListItem>
    )
    // ChevronRight renders as an svg; with showChevron=false + onClick, no chevron should appear
    // The shrink-0 class is on the chevron element
    expect(container.querySelector('.shrink-0')).toBeNull()
  })

  it('hides chevron when no onClick even if showChevron is true', () => {
    const { container } = render(
      <CardListItem showChevron={true}>No Click</CardListItem>
    )
    expect(container.querySelector('.shrink-0')).toBeNull()
  })

  it('passes title prop', () => {
    render(<CardListItem title="tooltip text">Titled</CardListItem>)
    expect(screen.getByTitle('tooltip text')).toBeTruthy()
  })

  it('passes dataTour prop', () => {
    const { container } = render(<CardListItem dataTour="step-1">Tour</CardListItem>)
    expect(container.querySelector('[data-tour="step-1"]')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardControlsRow
// ---------------------------------------------------------------------------

describe('CardControlsRow', () => {
  it('renders empty row when no props provided', () => {
    const { container } = render(<CardControlsRow />)
    expect(container.querySelector('.flex')).toBeTruthy()
  })

  it('renders cluster indicator when provided', () => {
    render(<CardControlsRow clusterIndicator={{ selectedCount: 2, totalCount: 5 }} />)
    expect(screen.getByText('2/5')).toBeTruthy()
  })

  it('renders card controls when provided', () => {
    render(
      <CardControlsRow
        cardControls={{
          limit: 10,
          onLimitChange: vi.fn(),
          sortBy: 'name',
          sortOptions: [{ value: 'name', label: 'Name' }],
          onSortChange: vi.fn(),
          sortDirection: 'asc',
          onSortDirectionChange: vi.fn(),
        }}
      />
    )
    expect(screen.getByTestId('card-controls')).toBeTruthy()
  })

  it('renders extra content', () => {
    render(<CardControlsRow extra={<span data-testid="extra-content">Extra</span>} />)
    expect(screen.getByTestId('extra-content')).toBeTruthy()
  })

  it('applies custom className', () => {
    const { container } = render(<CardControlsRow className="my-class" />)
    expect(container.querySelector('.my-class')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardPaginationFooter
// ---------------------------------------------------------------------------

describe('CardPaginationFooter', () => {
  it('returns null when needsPagination is false', () => {
    const { container } = render(
      <CardPaginationFooter
        currentPage={1}
        totalPages={1}
        totalItems={5}
        itemsPerPage={10}
        onPageChange={vi.fn()}
        needsPagination={false}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders pagination when needsPagination is true', () => {
    render(
      <CardPaginationFooter
        currentPage={1}
        totalPages={3}
        totalItems={30}
        itemsPerPage={10}
        onPageChange={vi.fn()}
        needsPagination={true}
      />
    )
    expect(screen.getByTestId('pagination')).toBeTruthy()
  })

  it('emits analytics and calls onPageChange when page changes', () => {
    const onPageChange = vi.fn()
    render(
      <CardPaginationFooter
        currentPage={1}
        totalPages={3}
        totalItems={30}
        itemsPerPage={10}
        onPageChange={onPageChange}
        needsPagination={true}
      />
    )
    fireEvent.click(screen.getByTestId('next-page'))
    expect(mockEmitCardPaginationUsed).toHaveBeenCalledWith(2, 3, 'test-card')
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})

// ---------------------------------------------------------------------------
// CardAIActions
// ---------------------------------------------------------------------------

describe('CardAIActions', () => {
  const defaultResource = {
    kind: 'Pod',
    name: 'nginx-abc',
    namespace: 'default',
    cluster: 'cluster-1',
    status: 'CrashLoopBackOff',
  }

  it('renders diagnose and repair buttons', () => {
    render(<CardAIActions resource={defaultResource} />)
    expect(screen.getByTitle('Diagnose nginx-abc')).toBeTruthy()
    expect(screen.getByTitle('Repair nginx-abc')).toBeTruthy()
  })

  it('hides repair button when showRepair is false', () => {
    render(<CardAIActions resource={defaultResource} showRepair={false} />)
    expect(screen.getByTitle('Diagnose nginx-abc')).toBeTruthy()
    expect(screen.queryByTitle('Repair nginx-abc')).toBeNull()
  })

  it('uses custom repairLabel in title', () => {
    render(<CardAIActions resource={defaultResource} repairLabel="Fix" />)
    expect(screen.getByTitle('Fix nginx-abc')).toBeTruthy()
  })

  it('calls startMission on diagnose click', () => {
    render(<CardAIActions resource={defaultResource} />)
    fireEvent.click(screen.getByTitle('Diagnose nginx-abc'))
    expect(mockCheckKeyAndRun).toHaveBeenCalled()
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Diagnose nginx-abc',
        type: 'troubleshoot',
        cluster: 'cluster-1',
      })
    )
  })

  it('calls startMission on repair click', () => {
    render(<CardAIActions resource={defaultResource} />)
    fireEvent.click(screen.getByTitle('Repair nginx-abc'))
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Repair nginx-abc',
        type: 'repair',
      })
    )
  })

  it('uses custom diagnosePrompt when provided', () => {
    render(<CardAIActions resource={defaultResource} diagnosePrompt="Custom diagnose prompt" />)
    fireEvent.click(screen.getByTitle('Diagnose nginx-abc'))
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPrompt: 'Custom diagnose prompt',
      })
    )
  })

  it('uses custom repairPrompt when provided', () => {
    render(<CardAIActions resource={defaultResource} repairPrompt="Custom repair prompt" />)
    fireEvent.click(screen.getByTitle('Repair nginx-abc'))
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPrompt: 'Custom repair prompt',
      })
    )
  })

  it('calls custom onDiagnose handler instead of startMission', () => {
    const onDiagnose = vi.fn()
    render(<CardAIActions resource={defaultResource} onDiagnose={onDiagnose} />)
    fireEvent.click(screen.getByTitle('Diagnose nginx-abc'))
    expect(onDiagnose).toHaveBeenCalled()
    expect(mockStartMission).not.toHaveBeenCalled()
  })

  it('calls custom onRepair handler instead of startMission', () => {
    const onRepair = vi.fn()
    render(<CardAIActions resource={defaultResource} onRepair={onRepair} />)
    fireEvent.click(screen.getByTitle('Repair nginx-abc'))
    expect(onRepair).toHaveBeenCalled()
    expect(mockStartMission).not.toHaveBeenCalled()
  })

  it('stops propagation on container click', () => {
    const parentClick = vi.fn()
    render(
      <div role="button" onClick={parentClick}>
        <CardAIActions resource={defaultResource} />
      </div>
    )
    const container = screen.getByTitle('Diagnose nginx-abc').parentElement!
    fireEvent.click(container)
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('stops propagation on button clicks', () => {
    const parentClick = vi.fn()
    render(
      <div role="button" onClick={parentClick}>
        <CardAIActions resource={defaultResource} />
      </div>
    )
    fireEvent.click(screen.getByTitle('Diagnose nginx-abc'))
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('includes issues in the diagnose prompt', () => {
    const issues = [{ name: 'OOMKilled', message: 'Container exceeded memory limit' }]
    render(<CardAIActions resource={defaultResource} issues={issues} />)
    fireEvent.click(screen.getByTitle('Diagnose nginx-abc'))
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPrompt: expect.stringContaining('OOMKilled'),
      })
    )
  })

  it('includes issues in the repair prompt', () => {
    const issues = [{ name: 'CrashLoop', message: 'Restarting repeatedly' }]
    render(<CardAIActions resource={defaultResource} issues={issues} />)
    fireEvent.click(screen.getByTitle('Repair nginx-abc'))
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPrompt: expect.stringContaining('CrashLoop'),
      })
    )
  })

  it('handles resource without namespace or cluster', () => {
    const resource = { kind: 'Node', name: 'node-1', status: 'Ready' }
    render(<CardAIActions resource={resource} />)
    fireEvent.click(screen.getByTitle('Diagnose node-1'))
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Diagnose node-1',
        cluster: undefined,
      })
    )
  })

  it('applies custom className', () => {
    const { container } = render(
      <CardAIActions resource={defaultResource} className="custom-ai-class" />
    )
    expect(container.querySelector('.custom-ai-class')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CardEmptyState - error variant (not covered in existing tests)
// ---------------------------------------------------------------------------

describe('CardEmptyState - error variant', () => {
  it('renders error variant with red background', () => {
    const { container } = render(<CardEmptyState title="Error occurred" variant="error" />)
    const iconBg = container.querySelector('.bg-red-500\\/10')
    expect(iconBg).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// useDropdownPortal
// ---------------------------------------------------------------------------

describe('useDropdownPortal', () => {
  function TestHarness({ isOpen }: { isOpen: boolean }) {
    const { triggerRef, style } = useDropdownPortal(isOpen)
    return (
      <div>
        <button ref={triggerRef} data-testid="trigger">Trigger</button>
        {style && <div data-testid="portal-style">{JSON.stringify(style)}</div>}
      </div>
    )
  }

  it('returns null style when closed', () => {
    render(<TestHarness isOpen={false} />)
    expect(screen.queryByTestId('portal-style')).toBeNull()
  })

  it('returns positioning style when open', () => {
    render(<TestHarness isOpen={true} />)
    // getBoundingClientRect returns zeros in jsdom, but the hook still computes values
    const styleEl = screen.queryByTestId('portal-style')
    expect(styleEl).toBeTruthy()
    const parsed = JSON.parse(styleEl!.textContent!)
    expect(typeof parsed.top).toBe('number')
    expect(typeof parsed.left).toBe('number')
  })
})
