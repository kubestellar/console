import { describe, it, expect, vi} from 'vitest'
import { render, screen, fireEvent} from '@testing-library/react'
import {
  KeyValueSection,
  TableSection,
  CollapsibleSection,
  AlertSection,
  EmptySection,
  LoadingSection,
  BadgesSection,
  QuickActionsSection,
} from '../ModalSections'
import type { KeyValueItem } from '../ModalSections'

/**
 * Tests for ModalSections reusable section components.
 */

// Mock clipboard module
vi.mock('../../clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

// Mock Button component
vi.mock('../../../components/ui/Button', () => ({
  Button: ({ children, onClick, icon, ...props }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} {...props}>
      {icon as React.ReactNode}
      {children as React.ReactNode}
    </button>
  ),
}))

describe('KeyValueSection', () => {
  it('renders key-value items', () => {
    const items: KeyValueItem[] = [
      { label: 'Name', value: 'nginx-pod' },
      { label: 'Namespace', value: 'production' },
    ]
    render(<KeyValueSection items={items} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('nginx-pod')).toBeInTheDocument()
    expect(screen.getByText('Namespace')).toBeInTheDocument()
    expect(screen.getByText('production')).toBeInTheDocument()
  })

  it('defaults to 2-column grid', () => {
    const items: KeyValueItem[] = [{ label: 'A', value: 'B' }]
    const { container } = render(<KeyValueSection items={items} />)
    const grid = container.firstElementChild
    expect(grid?.className).toContain('grid-cols-2')
  })

  it('supports 1-column layout', () => {
    const items: KeyValueItem[] = [{ label: 'A', value: 'B' }]
    const { container } = render(<KeyValueSection items={items} columns={1} />)
    const grid = container.firstElementChild
    expect(grid?.className).toContain('grid-cols-1')
  })

  it('supports 3-column layout', () => {
    const items: KeyValueItem[] = [{ label: 'A', value: 'B' }]
    const { container } = render(<KeyValueSection items={items} columns={3} />)
    const grid = container.firstElementChild
    expect(grid?.className).toContain('grid-cols-3')
  })

  it('renders status badge for render="status"', () => {
    const items: KeyValueItem[] = [
      { label: 'Status', value: 'Running', render: 'status' },
    ]
    render(<KeyValueSection items={items} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('renders code element for render="code"', () => {
    const items: KeyValueItem[] = [
      { label: 'Command', value: 'kubectl get pods', render: 'code' },
    ]
    render(<KeyValueSection items={items} />)
    const codeEl = screen.getByText('kubectl get pods')
    expect(codeEl.tagName).toBe('CODE')
  })

  it('renders JSON pre block for render="json"', () => {
    const items: KeyValueItem[] = [
      { label: 'Config', value: '{"key": "val"}', render: 'json' },
    ]
    render(<KeyValueSection items={items} />)
    const preEl = screen.getByText('{"key": "val"}')
    expect(preEl.tagName).toBe('PRE')
  })

  it('renders badge for render="badge"', () => {
    const items: KeyValueItem[] = [
      { label: 'Label', value: 'v1.2.3', render: 'badge' },
    ]
    render(<KeyValueSection items={items} />)
    expect(screen.getByText('v1.2.3')).toBeInTheDocument()
  })

  it('renders dash placeholder for null/undefined values', () => {
    const items: KeyValueItem[] = [
      { label: 'Missing', value: null as unknown as string },
    ]
    render(<KeyValueSection items={items} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const items: KeyValueItem[] = [{ label: 'A', value: 'B' }]
    const { container } = render(
      <KeyValueSection items={items} className="custom-class" />
    )
    expect(container.firstElementChild?.className).toContain('custom-class')
  })
})

describe('TableSection', () => {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'status', header: 'Status' },
  ]
  const data = [
    { name: 'pod-1', status: 'Running' },
    { name: 'pod-2', status: 'Failed' },
  ]

  it('renders table with headers and rows', () => {
    render(<TableSection data={data} columns={columns} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('pod-1')).toBeInTheDocument()
    expect(screen.getByText('pod-2')).toBeInTheDocument()
  })

  it('shows empty message when data is empty', () => {
    render(<TableSection data={[]} columns={columns} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('uses custom empty message', () => {
    render(
      <TableSection data={[]} columns={columns} emptyMessage="No pods found" />
    )
    expect(screen.getByText('No pods found')).toBeInTheDocument()
  })

  it('renders status badge for render="status" column', () => {
    const cols = [{ key: 'status', header: 'Status', render: 'status' as const }]
    render(<TableSection data={[{ status: 'Running' }]} columns={cols} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('calls onRowClick when a row is clicked', () => {
    const onRowClick = vi.fn()
    render(
      <TableSection data={data} columns={columns} onRowClick={onRowClick} />
    )
    fireEvent.click(screen.getByText('pod-1'))
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })

  it('renders cell value as dash for null/undefined', () => {
    const d = [{ name: null, status: undefined }]
    render(<TableSection data={d as unknown as Record<string, unknown>[]} columns={columns} />)
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('supports custom render function for column', () => {
    const cols = [
      {
        key: 'name',
        header: 'Name',
        render: (value: unknown) => `Custom: ${String(value)}`,
      },
    ]
    render(<TableSection data={[{ name: 'test' }]} columns={cols} />)
    expect(screen.getByText('Custom: test')).toBeInTheDocument()
  })
})

describe('CollapsibleSection', () => {
  it('renders expanded by default', () => {
    render(
      <CollapsibleSection title="Details">
        <p>Inner content</p>
      </CollapsibleSection>
    )
    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(screen.getByText('Inner content')).toBeInTheDocument()
  })

  it('renders collapsed when defaultOpen=false', () => {
    render(
      <CollapsibleSection title="Details" defaultOpen={false}>
        <p>Inner content</p>
      </CollapsibleSection>
    )
    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(screen.queryByText('Inner content')).not.toBeInTheDocument()
  })

  it('toggles on click', () => {
    render(
      <CollapsibleSection title="Details">
        <p>Inner content</p>
      </CollapsibleSection>
    )
    // Click to collapse
    fireEvent.click(screen.getByText('Details'))
    expect(screen.queryByText('Inner content')).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(screen.getByText('Details'))
    expect(screen.getByText('Inner content')).toBeInTheDocument()
  })

  it('displays badge when provided', () => {
    render(
      <CollapsibleSection title="Items" badge={42}>
        <p>Content</p>
      </CollapsibleSection>
    )
    expect(screen.getByText('42')).toBeInTheDocument()
  })
})

describe('AlertSection', () => {
  it('renders message text', () => {
    render(<AlertSection type="info" message="Operation completed" />)
    expect(screen.getByText('Operation completed')).toBeInTheDocument()
  })

  it('renders title when provided', () => {
    render(<AlertSection type="warning" title="Warning" message="Be careful" />)
    expect(screen.getByText('Warning')).toBeInTheDocument()
    expect(screen.getByText('Be careful')).toBeInTheDocument()
  })

  it('applies correct styling for each type', () => {
    const { container: infoContainer } = render(
      <AlertSection type="info" message="info msg" />
    )
    expect(infoContainer.firstElementChild?.className).toContain('blue')

    const { container: errorContainer } = render(
      <AlertSection type="error" message="error msg" />
    )
    expect(errorContainer.firstElementChild?.className).toContain('red')
  })
})

describe('EmptySection', () => {
  it('renders title', () => {
    render(<EmptySection title="No results" />)
    expect(screen.getByText('No results')).toBeInTheDocument()
  })

  it('renders message when provided', () => {
    render(<EmptySection title="Empty" message="Try adjusting filters" />)
    expect(screen.getByText('Try adjusting filters')).toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    const onClick = vi.fn()
    render(
      <EmptySection
        title="Empty"
        action={{ label: 'Create New', onClick }}
      />
    )
    const btn = screen.getByText('Create New')
    expect(btn).toBeInTheDocument()
  })
})

describe('LoadingSection', () => {
  it('renders default loading message', () => {
    render(<LoadingSection />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders custom loading message', () => {
    render(<LoadingSection message="Fetching data..." />)
    expect(screen.getByText('Fetching data...')).toBeInTheDocument()
  })
})

describe('BadgesSection', () => {
  it('renders badges', () => {
    const badges = [
      { label: 'Cluster', value: 'prod' },
      { label: 'Namespace', value: 'default' },
    ]
    render(<BadgesSection badges={badges} />)
    expect(screen.getByText('Cluster:')).toBeInTheDocument()
    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.getByText('Namespace:')).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
  })

  it('makes clickable badges interactive', () => {
    const onClick = vi.fn()
    const badges = [{ label: 'Tag', value: 'v1', onClick }]
    render(<BadgesSection badges={badges} />)
    // The clickable badge has role="button" when onClick is provided
    const badge = screen.getByRole('button')
    expect(badge.className).toContain('cursor-pointer')
  })
})

describe('QuickActionsSection', () => {
  it('renders action buttons with labels', () => {
    const MockIcon = ({ className }: { className?: string }) => (
      <span className={className} data-testid="icon" />
    )
    const actions = [
      { id: 'act1', label: 'Diagnose', icon: MockIcon, onClick: vi.fn() },
      { id: 'act2', label: 'Restart', icon: MockIcon, onClick: vi.fn() },
    ]
    render(<QuickActionsSection actions={actions} />)
    expect(screen.getByText('Diagnose')).toBeInTheDocument()
    expect(screen.getByText('Restart')).toBeInTheDocument()
  })

  it('calls onClick when action button is clicked', () => {
    const onClick = vi.fn()
    const MockIcon = () => <span />
    const actions = [{ id: 'act1', label: 'Click Me', icon: MockIcon, onClick }]
    render(<QuickActionsSection actions={actions} />)
    fireEvent.click(screen.getByText('Click Me'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disables action buttons when disabled=true', () => {
    const MockIcon = () => <span />
    const actions = [
      { id: 'act1', label: 'Disabled', icon: MockIcon, onClick: vi.fn(), disabled: true },
    ]
    render(<QuickActionsSection actions={actions} />)
    const btn = screen.getByText('Disabled').closest('button')
    expect(btn).toBeDisabled()
  })

  it('applies variant-specific styling', () => {
    const MockIcon = () => <span />
    const actions = [
      { id: 'danger', label: 'Delete', icon: MockIcon, onClick: vi.fn(), variant: 'danger' as const },
    ]
    render(<QuickActionsSection actions={actions} />)
    const btn = screen.getByText('Delete').closest('button')
    expect(btn?.className).toContain('red')
  })
})
