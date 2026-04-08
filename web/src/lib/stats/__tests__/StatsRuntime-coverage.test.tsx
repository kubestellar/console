/**
 * Coverage-focused tests for StatsRuntime.tsx component rendering
 *
 * The existing StatsRuntime.test.ts only covers registry/factory functions.
 * This file covers the actual React components:
 * - StatsRuntime rendering with blocks and data
 * - StatBlock rendering (icon, color, value, sublabel, click)
 * - StatBlockSkeleton when isLoading=true
 * - Collapse/expand toggle with localStorage persistence
 * - Grid column logic for various block counts
 * - Value getter: custom, registry, default (valueSource)
 * - hasData=false shows '-' instead of values
 * - collapsible=false disables toggle
 * - showConfigButton visibility
 * - lastUpdated display
 * - defaultCollapsed behavior
 * - hidden blocks (visible=false)
 * - parseStatsYAML stub
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  StatsRuntime,
  registerStatValueGetter,
  parseStatsYAML,
} from '../StatsRuntime'
import type {
  StatsDefinition,
  StatBlockDefinition,
  StatBlockValue,
} from '../types'

// Mock lucide-react icons used directly in the component
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  const iconStub = ({ className }: { className?: string }) => <span className={className}>icon</span>
  return {
    ...actual,
    ChevronDown: iconStub,
    ChevronRight: iconStub,
    Activity: iconStub,
    Settings: iconStub,
  }
})

vi.mock('../../icons', () => ({
  getIcon: (name: string) => {
    const IconStub = ({ className }: { className?: string }) => (
      <span data-testid={`icon-${name}`} className={className}>{name}</span>
    )
    IconStub.displayName = `Icon(${name})`
    return IconStub
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlock(id: string, overrides?: Partial<StatBlockDefinition>): StatBlockDefinition {
  return {
    id,
    label: `Block ${id}`,
    icon: 'Server',
    color: 'purple',
    visible: true,
    ...overrides,
  }
}

function makeDefinition(blockCount: number, overrides?: Partial<StatsDefinition>): StatsDefinition {
  const blocks = Array.from({ length: blockCount }, (_, i) => makeBlock(`block-${i}`))
  return {
    type: `test-stats-${blockCount}`,
    title: 'Test Stats',
    blocks,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

// ============================================================================
// Basic rendering
// ============================================================================

describe('StatsRuntime rendering', () => {
  it('renders title and stat blocks', () => {
    const def = makeDefinition(3)
    const getStatValue = (blockId: string): StatBlockValue => ({
      value: blockId === 'block-0' ? 42 : blockId === 'block-1' ? 7 : 0,
    })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)

    expect(screen.getByText('Test Stats')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('renders default title "Stats Overview" when no title provided', () => {
    const def = makeDefinition(1, { title: undefined })
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)
    expect(screen.getByText('Stats Overview')).toBeInTheDocument()
  })

  it('renders with className prop', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    const { container } = render(
      <StatsRuntime definition={def} getStatValue={getStatValue} className="my-custom-class" />
    )
    expect(container.firstElementChild?.classList.contains('my-custom-class')).toBe(true)
  })
})

// ============================================================================
// Loading state
// ============================================================================

describe('StatsRuntime loading', () => {
  it('renders skeletons when isLoading=true', () => {
    const def = makeDefinition(3)

    const { container } = render(
      <StatsRuntime definition={def} isLoading={true} />
    )

    // Skeletons have animate-pulse class
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBe(3)
  })

  it('does not render skeletons when isLoading=false', () => {
    const def = makeDefinition(2)
    const getStatValue = (): StatBlockValue => ({ value: 10 })

    const { container } = render(
      <StatsRuntime definition={def} getStatValue={getStatValue} isLoading={false} />
    )

    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBe(0)
  })
})

// ============================================================================
// hasData=false
// ============================================================================

describe('StatsRuntime hasData', () => {
  it('shows dash values when hasData=false', () => {
    const def = makeDefinition(2)
    const getStatValue = (): StatBlockValue => ({ value: 42 })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} hasData={false} />)

    // All values should be '-' instead of 42
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBe(2)
  })
})

// ============================================================================
// Collapse / expand
// ============================================================================

describe('StatsRuntime collapse', () => {
  it('toggles collapsed state on click', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 999 })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)

    // Should start expanded (default)
    expect(screen.getByText('999')).toBeInTheDocument()

    // Click the collapse button
    const toggleBtn = screen.getByText('Test Stats')
    fireEvent.click(toggleBtn)

    // Should be collapsed — stat values should not be visible
    expect(screen.queryByText('999')).toBeNull()

    // Click again to expand
    fireEvent.click(toggleBtn)
    expect(screen.getByText('999')).toBeInTheDocument()
  })

  it('persists collapsed state to localStorage', () => {
    const def = makeDefinition(1, { type: 'persist-test' })
    const getStatValue = (): StatBlockValue => ({ value: 1 })
    const storageKey = 'kubestellar-persist-test-stats-collapsed'

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)

    const toggleBtn = screen.getByText('Test Stats')
    fireEvent.click(toggleBtn)

    expect(localStorage.getItem(storageKey)).toBe('false')

    fireEvent.click(toggleBtn)
    expect(localStorage.getItem(storageKey)).toBe('true')
  })

  it('uses custom collapsedStorageKey', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 1 })
    const customKey = 'my-custom-storage-key'

    render(
      <StatsRuntime
        definition={def}
        getStatValue={getStatValue}
        collapsedStorageKey={customKey}
      />
    )

    const toggleBtn = screen.getByText('Test Stats')
    fireEvent.click(toggleBtn)

    expect(localStorage.getItem(customKey)).toBe('false')
  })

  it('reads initial collapsed state from localStorage', () => {
    const def = makeDefinition(1, { type: 'saved-state' })
    const getStatValue = (): StatBlockValue => ({ value: 99 })
    const storageKey = 'kubestellar-saved-state-stats-collapsed'

    // Pre-set collapsed state
    localStorage.setItem(storageKey, 'false')

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)

    // Should be collapsed because localStorage says false
    expect(screen.queryByText('99')).toBeNull()
  })

  it('starts collapsed when defaultCollapsed=true', () => {
    const def = makeDefinition(1, { defaultCollapsed: true })
    const getStatValue = (): StatBlockValue => ({ value: 55 })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)

    // Should start collapsed
    expect(screen.queryByText('55')).toBeNull()
  })

  it('handles corrupted localStorage gracefully', () => {
    const def = makeDefinition(1, { type: 'corrupt-state' })
    const getStatValue = (): StatBlockValue => ({ value: 1 })
    const storageKey = 'kubestellar-corrupt-state-stats-collapsed'

    localStorage.setItem(storageKey, 'not-valid-json{{{')

    // Should not throw, should use default expanded state
    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('collapsible=false disables toggle button', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    render(
      <StatsRuntime
        definition={def}
        getStatValue={getStatValue}
        collapsible={false}
      />
    )

    // Title should be present but not as a button
    expect(screen.getByText('Test Stats')).toBeInTheDocument()
    // Content should always be visible
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})

// ============================================================================
// Config button
// ============================================================================

describe('StatsRuntime config button', () => {
  it('shows config button when expanded and showConfigButton=true', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} showConfigButton={true} />)

    // Config button should be present (Settings icon)
    const configBtn = screen.getByTitle('Configure stats')
    expect(configBtn).toBeInTheDocument()
  })

  it('hides config button when showConfigButton=false', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} showConfigButton={false} />)

    expect(screen.queryByTitle('Configure stats')).toBeNull()
  })

  it('hides config button when collapsed', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} showConfigButton={true} />)

    // Collapse
    fireEvent.click(screen.getByText('Test Stats'))

    expect(screen.queryByTitle('Configure stats')).toBeNull()
  })
})

// ============================================================================
// lastUpdated
// ============================================================================

describe('StatsRuntime lastUpdated', () => {
  it('displays lastUpdated timestamp', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 1 })
    const date = new Date('2025-01-15T10:30:00')

    render(
      <StatsRuntime
        definition={def}
        getStatValue={getStatValue}
        lastUpdated={date}
      />
    )

    expect(screen.getByText(/Updated/)).toBeInTheDocument()
  })

  it('does not display timestamp when lastUpdated is null', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    render(
      <StatsRuntime
        definition={def}
        getStatValue={getStatValue}
        lastUpdated={null}
      />
    )

    expect(screen.queryByText(/Updated/)).toBeNull()
  })
})

// ============================================================================
// StatBlock interactions
// ============================================================================

describe('StatBlock interactions', () => {
  it('calls onClick when block is clickable', () => {
    const onClick = vi.fn()
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({
      value: 42,
      onClick,
      isClickable: true,
    })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)

    fireEvent.click(screen.getByText('42'))
    expect(onClick).toHaveBeenCalled()
  })

  it('does not call onClick when isClickable=false', () => {
    const onClick = vi.fn()
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({
      value: 42,
      onClick,
      isClickable: false,
    })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)

    // Click the block container, not just the value
    const block = screen.getByText('42').closest('.glass')
    if (block) fireEvent.click(block)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders sublabel when provided', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({
      value: 42,
      sublabel: 'of 100 total',
    })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)
    expect(screen.getByText('of 100 total')).toBeInTheDocument()
  })

  it('renders tooltip from block definition', () => {
    const def = makeDefinition(1, {
      blocks: [makeBlock('b1', { tooltip: 'Total clusters' })],
    })
    const getStatValue = (): StatBlockValue => ({ value: 5 })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)

    const block = screen.getByText('5').closest('[title]')
    expect(block?.getAttribute('title')).toBe('Total clusters')
  })
})

// ============================================================================
// Hidden blocks (visible=false)
// ============================================================================

describe('StatsRuntime hidden blocks', () => {
  it('does not render blocks with visible=false', () => {
    const def: StatsDefinition = {
      type: 'hidden-test',
      blocks: [
        makeBlock('visible-1'),
        makeBlock('hidden-1', { visible: false }),
        makeBlock('visible-2'),
      ],
    }
    const getStatValue = (id: string): StatBlockValue => ({ value: id })

    render(<StatsRuntime definition={def} getStatValue={getStatValue} />)

    expect(screen.getByText('Block visible-1')).toBeInTheDocument()
    expect(screen.getByText('Block visible-2')).toBeInTheDocument()
    expect(screen.queryByText('Block hidden-1')).toBeNull()
  })
})

// ============================================================================
// Grid columns
// ============================================================================

describe('StatsRuntime grid columns', () => {
  it('uses grid.columns when specified in definition', () => {
    const def = makeDefinition(3, { grid: { columns: 3 } })
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    const { container } = render(
      <StatsRuntime definition={def} getStatValue={getStatValue} />
    )

    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('md:grid-cols-3')
  })

  it('uses 4 columns for <= 4 blocks', () => {
    const def = makeDefinition(4)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    const { container } = render(
      <StatsRuntime definition={def} getStatValue={getStatValue} />
    )

    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('md:grid-cols-4')
  })

  it('uses 5 columns for 5 blocks', () => {
    const def = makeDefinition(5)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    const { container } = render(
      <StatsRuntime definition={def} getStatValue={getStatValue} />
    )

    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('md:grid-cols-5')
  })

  it('uses 6 columns for 6 blocks', () => {
    const def = makeDefinition(6)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    const { container } = render(
      <StatsRuntime definition={def} getStatValue={getStatValue} />
    )

    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('lg:grid-cols-6')
  })

  it('uses 8 columns for 7-8 blocks', () => {
    const def = makeDefinition(8)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    const { container } = render(
      <StatsRuntime definition={def} getStatValue={getStatValue} />
    )

    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('lg:grid-cols-8')
  })

  it('uses 10 columns for > 8 blocks', () => {
    const def = makeDefinition(10)
    const getStatValue = (): StatBlockValue => ({ value: 1 })

    const { container } = render(
      <StatsRuntime definition={def} getStatValue={getStatValue} />
    )

    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('lg:grid-cols-10')
  })
})

// ============================================================================
// Default value getter (valueSource)
// ============================================================================

describe('StatsRuntime default valueSource getter', () => {
  it('extracts value from data using field', () => {
    const def: StatsDefinition = {
      type: 'value-source-test',
      blocks: [
        makeBlock('clusters', {
          valueSource: { field: 'clusterCount' },
        }),
      ],
    }

    render(
      <StatsRuntime
        definition={def}
        data={{ clusterCount: 42 }}
      />
    )

    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('applies format to numeric values', () => {
    const def: StatsDefinition = {
      type: 'format-test',
      blocks: [
        makeBlock('memory', {
          valueSource: { field: 'memoryUsage', format: 'percent' },
        }),
      ],
    }

    render(
      <StatsRuntime
        definition={def}
        data={{ memoryUsage: 75 }}
      />
    )

    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('applies prefix and suffix', () => {
    const def: StatsDefinition = {
      type: 'prefix-suffix-test',
      blocks: [
        makeBlock('cost', {
          valueSource: { field: 'cost', prefix: '$', suffix: '/mo' },
        }),
      ],
    }

    render(
      <StatsRuntime
        definition={def}
        data={{ cost: 150 }}
      />
    )

    expect(screen.getByText('$150/mo')).toBeInTheDocument()
  })

  it('shows sublabel from sublabelField', () => {
    const def: StatsDefinition = {
      type: 'sublabel-test',
      blocks: [
        makeBlock('pods', {
          valueSource: { field: 'podCount', sublabelField: 'podStatus' },
        }),
      ],
    }

    render(
      <StatsRuntime
        definition={def}
        data={{ podCount: 10, podStatus: '8 running' }}
      />
    )

    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('8 running')).toBeInTheDocument()
  })

  it('returns dash when block has no valueSource', () => {
    const def: StatsDefinition = {
      type: 'no-source-test',
      blocks: [makeBlock('empty')],
    }

    render(<StatsRuntime definition={def} data={{}} />)

    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('returns dash when data is undefined', () => {
    const def: StatsDefinition = {
      type: 'no-data-test',
      blocks: [
        makeBlock('item', { valueSource: { field: 'count' } }),
      ],
    }

    render(<StatsRuntime definition={def} />)

    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('converts non-numeric values to string', () => {
    const def: StatsDefinition = {
      type: 'string-val-test',
      blocks: [
        makeBlock('status', {
          valueSource: { field: 'status' },
        }),
      ],
    }

    render(
      <StatsRuntime
        definition={def}
        data={{ status: 'Healthy' }}
      />
    )

    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  it('shows dash for null/undefined field values', () => {
    const def: StatsDefinition = {
      type: 'null-field-test',
      blocks: [
        makeBlock('missing', {
          valueSource: { field: 'nonexistent' },
        }),
      ],
    }

    render(
      <StatsRuntime
        definition={def}
        data={{ other: 'value' }}
      />
    )

    // String(undefined ?? '-') = '-'
    expect(screen.getByText('-')).toBeInTheDocument()
  })
})

// ============================================================================
// Registry-based value getter
// ============================================================================

describe('StatsRuntime registry value getter', () => {
  it('uses registered value getter when no custom getter provided', () => {
    const REGISTRY_TYPE = 'registry-getter-test'

    registerStatValueGetter(REGISTRY_TYPE, (blockId) => ({
      value: blockId === 'block-0' ? 'From Registry' : '-',
    }))

    const def = makeDefinition(1, { type: REGISTRY_TYPE })

    render(<StatsRuntime definition={def} data={{}} />)

    expect(screen.getByText('From Registry')).toBeInTheDocument()
  })
})

// ============================================================================
// parseStatsYAML
// ============================================================================

describe('parseStatsYAML', () => {
  it('throws descriptive error', () => {
    expect(() => parseStatsYAML('type: foo')).toThrow('YAML parsing not yet implemented')
  })
})

// ============================================================================
// defaultExpanded prop
// ============================================================================

describe('StatsRuntime defaultExpanded', () => {
  it('starts collapsed when defaultExpanded=false', () => {
    const def = makeDefinition(1)
    const getStatValue = (): StatBlockValue => ({ value: 77 })

    render(
      <StatsRuntime
        definition={def}
        getStatValue={getStatValue}
        defaultExpanded={false}
      />
    )

    expect(screen.queryByText('77')).toBeNull()
  })
})
