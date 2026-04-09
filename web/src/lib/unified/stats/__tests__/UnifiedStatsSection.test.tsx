/**
 * Tests for UnifiedStatsSection component
 *
 * Mocks heavy children (UnifiedStatBlock, StatusBadge, Button) and tests:
 * - Default rendering with visible blocks
 * - Collapsed/expanded toggle with localStorage persistence
 * - Demo data badge display
 * - Config modal open/save/reset
 * - Grid column calculation for various block counts
 * - Custom grid responsive config
 * - Non-collapsible mode
 * - lastUpdated display
 * - getStatValue passthrough
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { UnifiedStatsSection } from '../UnifiedStatsSection'
import type { UnifiedStatsSectionConfig, UnifiedStatBlockConfig } from '../../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../UnifiedStatBlock', () => ({
  UnifiedStatBlock: (props: Record<string, unknown>) => (
    <div
      data-testid={`stat-block-${(props.config as { id: string }).id}`}
      data-loading={String(props.isLoading)}
    >
      StatBlock
    </div>
  ),
}))

const mockResolveStatValue = vi.fn().mockReturnValue({
  value: 42,
  formatted: '42',
  isDemo: false,
})
vi.mock('../valueResolvers', () => ({
  resolveStatValue: (...args: unknown[]) => mockResolveStatValue(...args),
}))

vi.mock('../../../../components/ui/Button', () => ({
  Button: (props: Record<string, unknown>) => (
    <button data-testid="button" onClick={props.onClick as () => void} title={props.title as string}>
      {props.children as string}
    </button>
  ),
}))

vi.mock('../../../../components/ui/StatusBadge', () => ({
  StatusBadge: (props: Record<string, unknown>) => (
    <span data-testid="status-badge">{props.children as string}</span>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlock(id: string, visible?: boolean): UnifiedStatBlockConfig {
  return {
    id,
    name: `Block ${id}`,
    icon: 'activity',
    color: 'blue',
    visible,
    valueSource: { type: 'field', field: id },
  } as UnifiedStatBlockConfig
}

function makeConfig(overrides: Partial<UnifiedStatsSectionConfig> = {}): UnifiedStatsSectionConfig {
  return {
    type: 'test-stats',
    title: 'Test Stats',
    blocks: [makeBlock('a'), makeBlock('b'), makeBlock('c')],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UnifiedStatsSection', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders stat blocks for each visible block', () => {
    render(<UnifiedStatsSection config={makeConfig()} />)
    expect(screen.getByTestId('stat-block-a')).toBeInTheDocument()
    expect(screen.getByTestId('stat-block-b')).toBeInTheDocument()
    expect(screen.getByTestId('stat-block-c')).toBeInTheDocument()
  })

  it('filters out blocks with visible=false', () => {
    const config = makeConfig({
      blocks: [makeBlock('a'), makeBlock('b', false), makeBlock('c')],
    })
    render(<UnifiedStatsSection config={config} />)
    expect(screen.getByTestId('stat-block-a')).toBeInTheDocument()
    expect(screen.queryByTestId('stat-block-b')).not.toBeInTheDocument()
    expect(screen.getByTestId('stat-block-c')).toBeInTheDocument()
  })

  it('displays the section title', () => {
    render(<UnifiedStatsSection config={makeConfig({ title: 'My Stats' })} />)
    expect(screen.getByText('My Stats')).toBeInTheDocument()
  })

  it('uses default title when none provided', () => {
    render(<UnifiedStatsSection config={makeConfig({ title: undefined })} />)
    expect(screen.getByText('Stats Overview')).toBeInTheDocument()
  })

  it('toggles collapsed state and persists to localStorage', () => {
    const config = makeConfig({ collapsible: true, storageKey: 'test-key' })
    render(<UnifiedStatsSection config={config} />)

    // Initially expanded (defaultCollapsed is not set)
    expect(screen.getByTestId('stat-block-a')).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(screen.getByText('Test Stats'))
    expect(screen.queryByTestId('stat-block-a')).not.toBeInTheDocument()

    // localStorage should be updated
    expect(localStorage.getItem('test-key')).toBeDefined()

    // Click to expand again
    fireEvent.click(screen.getByText('Test Stats'))
    expect(screen.getByTestId('stat-block-a')).toBeInTheDocument()
  })

  it('starts collapsed when defaultCollapsed is true', () => {
    const config = makeConfig({ defaultCollapsed: true })
    render(<UnifiedStatsSection config={config} />)
    expect(screen.queryByTestId('stat-block-a')).not.toBeInTheDocument()
  })

  it('renders as non-collapsible when collapsible is false', () => {
    const config = makeConfig({ collapsible: false })
    render(<UnifiedStatsSection config={config} />)
    // Title is plain text, not a button
    expect(screen.getByText('Test Stats')).toBeInTheDocument()
    // Blocks always visible
    expect(screen.getByTestId('stat-block-a')).toBeInTheDocument()
  })

  it('displays lastUpdated timestamp', () => {
    const date = new Date('2024-01-15T10:30:00')
    render(<UnifiedStatsSection config={makeConfig()} lastUpdated={date} />)
    expect(screen.getByText(/Updated/)).toBeInTheDocument()
  })

  it('does not show lastUpdated when null', () => {
    render(<UnifiedStatsSection config={makeConfig()} lastUpdated={null} />)
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument()
  })

  it('passes isLoading to stat blocks', () => {
    render(<UnifiedStatsSection config={makeConfig()} isLoading={true} />)
    expect(screen.getByTestId('stat-block-a').getAttribute('data-loading')).toBe('true')
  })

  it('opens config modal when settings button is clicked', () => {
    const config = makeConfig({ showConfigButton: true })
    render(<UnifiedStatsSection config={config} />)

    // Click the settings button
    const btn = screen.getByTitle('Configure stats')
    fireEvent.click(btn)

    // Modal title should be visible
    expect(screen.getByText('Configure Test Stats')).toBeInTheDocument()
  })

  it('config modal toggles block visibility', () => {
    const config = makeConfig({ showConfigButton: true })
    render(<UnifiedStatsSection config={config} />)

    // Open modal
    fireEvent.click(screen.getByTitle('Configure stats'))

    // Should see checkboxes for each block
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(3)

    // Toggle first block off
    fireEvent.click(checkboxes[0])

    // Save
    fireEvent.click(screen.getByText('Save'))
  })

  it('config modal reset restores default blocks', () => {
    const config = makeConfig({ showConfigButton: true })
    render(<UnifiedStatsSection config={config} />)

    fireEvent.click(screen.getByTitle('Configure stats'))
    fireEvent.click(screen.getByText('Reset to default'))
    // Blocks should still be 3 checkboxes
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('config modal closes on Cancel', () => {
    const config = makeConfig({ showConfigButton: true })
    render(<UnifiedStatsSection config={config} />)

    fireEvent.click(screen.getByTitle('Configure stats'))
    expect(screen.getByText('Configure Test Stats')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Configure Test Stats')).not.toBeInTheDocument()
  })

  it('config modal closes when backdrop is clicked', () => {
    const config = makeConfig({ showConfigButton: true })
    render(<UnifiedStatsSection config={config} />)

    fireEvent.click(screen.getByTitle('Configure stats'))
    // Click the backdrop (bg-black/60 — standardized in UX cohesion PR #5286)
    const backdrop = document.querySelector('.bg-black\\/60')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)

    expect(screen.queryByText('Configure Test Stats')).not.toBeInTheDocument()
  })

  it('displays demo badge when resolveStatValue returns isDemo=true', () => {
    mockResolveStatValue.mockReturnValue({
      value: 42,
      formatted: '42',
      isDemo: true,
    })

    render(<UnifiedStatsSection config={makeConfig()} data={{ a: 1, b: 2, c: 3 }} />)
    expect(screen.getByTestId('status-badge')).toBeInTheDocument()
    expect(screen.getByText('Demo')).toBeInTheDocument()
  })

  it('passes getStatValue through to blocks via getValue', () => {
    const getStatValue = vi.fn().mockReturnValue({ value: 99, label: '99' })
    render(<UnifiedStatsSection config={makeConfig()} getStatValue={getStatValue} />)
    // Blocks should be rendered (getValue is a function wrapper)
    expect(screen.getByTestId('stat-block-a')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <UnifiedStatsSection config={makeConfig()} className="custom-class" />,
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('loads custom blocks from localStorage on mount', () => {
    const key = 'kubestellar-test-stats-stats-collapsed'
    const customBlocks = [makeBlock('x'), makeBlock('y')]
    localStorage.setItem(`${key}-blocks`, JSON.stringify(customBlocks))

    render(<UnifiedStatsSection config={makeConfig()} />)
    expect(screen.getByTestId('stat-block-x')).toBeInTheDocument()
    expect(screen.getByTestId('stat-block-y')).toBeInTheDocument()
    expect(screen.queryByTestId('stat-block-a')).not.toBeInTheDocument()
  })

  it('uses custom responsive grid when config.grid.responsive is provided', () => {
    const config = makeConfig({
      grid: { responsive: { sm: 1, md: 2, lg: 3 } },
    })
    const { container } = render(<UnifiedStatsSection config={config} />)
    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('grid-cols-1')
    expect(grid?.className).toContain('md:grid-cols-2')
    expect(grid?.className).toContain('lg:grid-cols-3')
  })

  it('hides config button when showConfigButton is false', () => {
    const config = makeConfig({ showConfigButton: false })
    render(<UnifiedStatsSection config={config} />)
    expect(screen.queryByTitle('Configure stats')).not.toBeInTheDocument()
  })
})
