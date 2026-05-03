/**
 * ModalSections-coverage — tests for uncovered branches
 *
 * Covers: status badge getStatusColors, timestamp rendering (valid + invalid),
 * link rendering with linkTo + onNavigate, copy button feedback (Check icon),
 * copyable render mode, JSON non-string values, table render modes (timestamp,
 * badge, code), table column alignment, table keyboard interaction,
 * AlertSection all variants, QuickActionsSection primary variant,
 * BadgesSection keyboard interaction, EmptySection with icon,
 * and CollapsibleSection with string badge.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  KeyValueSection,
  TableSection,
  CollapsibleSection,
  AlertSection,
  EmptySection,
  BadgesSection,
  QuickActionsSection,
} from '../ModalSections'
import type { KeyValueItem } from '../ModalSections'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCopyToClipboard = vi.fn().mockResolvedValue(true)
vi.mock('../../clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => mockCopyToClipboard(...args),
}))

vi.mock('../../constants/network', () => ({
  UI_FEEDBACK_TIMEOUT_MS: 100,
}))

vi.mock('../../../components/ui/Button', () => ({
  Button: ({ children, onClick, icon, title, ...props }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} title={title as string} {...props}>
      {icon as React.ReactNode}
      {children as React.ReactNode}
    </button>
  ),
}))

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COPY_FEEDBACK_DELAY_MS = 150

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KeyValueSection — coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders status badge with getStatusColors', () => {
    const items: KeyValueItem[] = [
      { label: 'Status', value: 'Running', render: 'status' },
    ]
    render(<KeyValueSection items={items} />)
    const badge = screen.getByText('Running')
    // Status badge should have color classes
    expect(badge.className).toContain('rounded')
    expect(badge.className).toContain('text-xs')
  })

  it('renders valid timestamp with toLocaleString', () => {
    const validDate = '2024-01-15T10:30:00Z'
    const items: KeyValueItem[] = [
      { label: 'Created', value: validDate, render: 'timestamp' },
    ]
    render(<KeyValueSection items={items} />)
    // Should render the locale string, not "Invalid Date"
    const dateEl = screen.getByTitle(new Date(validDate).toISOString())
    expect(dateEl).toBeInTheDocument()
  })

  it('renders em-dash for invalid/NaN date timestamp', () => {
    const items: KeyValueItem[] = [
      { label: 'Updated', value: 'not-a-date', render: 'timestamp' },
    ]
    render(<KeyValueSection items={items} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders em-dash for null timestamp value', () => {
    const items: KeyValueItem[] = [
      { label: 'Deleted', value: null as unknown as string, render: 'timestamp' },
    ]
    render(<KeyValueSection items={items} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders link with onNavigate callback', () => {
    const onNavigate = vi.fn()
    const linkTarget = { route: '/pods', params: { name: 'test' } }
    const items: KeyValueItem[] = [
      { label: 'Pod', value: 'nginx', render: 'link', linkTo: linkTarget },
    ]
    render(<KeyValueSection items={items} onNavigate={onNavigate} />)
    const link = screen.getByText('nginx')
    fireEvent.click(link)
    expect(onNavigate).toHaveBeenCalledWith(linkTarget)
  })

  it('renders link as plain text when onNavigate is not provided', () => {
    const items: KeyValueItem[] = [
      { label: 'Pod', value: 'nginx', render: 'link', linkTo: { route: '/pods' } },
    ]
    render(<KeyValueSection items={items} />)
    expect(screen.getByText('nginx')).toBeInTheDocument()
  })

  it('renders link as plain text when linkTo is not provided', () => {
    const items: KeyValueItem[] = [
      { label: 'Pod', value: 'nginx', render: 'link' },
    ]
    render(<KeyValueSection items={items} onNavigate={vi.fn()} />)
    expect(screen.getByText('nginx')).toBeInTheDocument()
  })

  it('renders copy button and shows Check icon after copy', async () => {
    const items: KeyValueItem[] = [
      { label: 'ID', value: 'abc-123', copyable: true },
    ]
    render(<KeyValueSection items={items} />)

    const copyBtn = screen.getByTitle('Copy to clipboard')
    expect(copyBtn).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(copyBtn)
    })

    expect(mockCopyToClipboard).toHaveBeenCalledWith('abc-123')

    // After copy, the Check icon should appear (we check by the green class)
    const checkIcon = copyBtn.querySelector('.text-green-400')
    expect(checkIcon).not.toBeNull()

    // After timeout, should revert to Copy icon
    act(() => {
      vi.advanceTimersByTime(COPY_FEEDBACK_DELAY_MS)
    })
  })

  it('renders copy button for render="copyable" mode', async () => {
    const items: KeyValueItem[] = [
      { label: 'Token', value: 'secret-token', render: 'copyable' },
    ]
    render(<KeyValueSection items={items} />)

    const copyBtn = screen.getByTitle('Copy to clipboard')
    expect(copyBtn).toBeInTheDocument()
  })

  it('renders JSON for non-string object values', () => {
    const objValue = { key: 'val', nested: { a: 1 } }
    const items: KeyValueItem[] = [
      { label: 'Config', value: objValue as unknown as string, render: 'json' },
    ]
    render(<KeyValueSection items={items} />)
    const pre = screen.getByText(/"key": "val"/)
    expect(pre.tagName).toBe('PRE')
  })

  it('handles copy of non-string value via String()', async () => {
    const items: KeyValueItem[] = [
      { label: 'Num', value: 42 as unknown as string, copyable: true },
    ]
    render(<KeyValueSection items={items} />)

    const copyBtn = screen.getByTitle('Copy to clipboard')
    await act(async () => {
      fireEvent.click(copyBtn)
    })
    expect(mockCopyToClipboard).toHaveBeenCalledWith('42')
  })
})

describe('TableSection — coverage', () => {
  it('renders timestamp column via render="timestamp"', () => {
    const date = '2024-06-01T12:00:00Z'
    const cols = [{ key: 'time', header: 'Time', render: 'timestamp' as const }]
    render(<TableSection data={[{ time: date }]} columns={cols} />)
    // Should render the locale string
    const rendered = new Date(date).toLocaleString()
    expect(screen.getByText(rendered)).toBeInTheDocument()
  })

  it('renders badge column via render="badge"', () => {
    const cols = [{ key: 'tag', header: 'Tag', render: 'badge' as const }]
    render(<TableSection data={[{ tag: 'v2.0' }]} columns={cols} />)
    expect(screen.getByText('v2.0')).toBeInTheDocument()
  })

  it('renders code column via render="code"', () => {
    const cols = [{ key: 'cmd', header: 'Cmd', render: 'code' as const }]
    render(<TableSection data={[{ cmd: 'ls -la' }]} columns={cols} />)
    const code = screen.getByText('ls -la')
    expect(code.tagName).toBe('CODE')
  })

  it('applies column alignment classes', () => {
    const cols = [
      { key: 'left', header: 'Left', align: 'left' as const },
      { key: 'center', header: 'Center', align: 'center' as const },
      { key: 'right', header: 'Right', align: 'right' as const },
    ]
    const data = [{ left: 'L', center: 'C', right: 'R' }]
    const { container } = render(<TableSection data={data} columns={cols} />)

    const headers = container.querySelectorAll('th')
    expect(headers[1]?.className).toContain('text-center')
    expect(headers[2]?.className).toContain('text-right')

    const cells = container.querySelectorAll('td')
    expect(cells[1]?.className).toContain('text-center')
    expect(cells[2]?.className).toContain('text-right')
  })

  it('supports keyboard Enter to trigger onRowClick', () => {
    const onRowClick = vi.fn()
    const cols = [{ key: 'name', header: 'Name' }]
    const data = [{ name: 'test-row' }]
    render(<TableSection data={data} columns={cols} onRowClick={onRowClick} />)

    const row = screen.getByText('test-row').closest('tr')!
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })

  it('supports keyboard Space to trigger onRowClick', () => {
    const onRowClick = vi.fn()
    const cols = [{ key: 'name', header: 'Name' }]
    const data = [{ name: 'space-row' }]
    render(<TableSection data={data} columns={cols} onRowClick={onRowClick} />)

    const row = screen.getByText('space-row').closest('tr')!
    fireEvent.keyDown(row, { key: ' ' })
    expect(onRowClick).toHaveBeenCalledWith(data[0])
  })

  it('does not add cursor-pointer class when onRowClick is absent', () => {
    const cols = [{ key: 'name', header: 'Name' }]
    render(<TableSection data={[{ name: 'noclick' }]} columns={cols} />)
    const row = screen.getByText('noclick').closest('tr')
    expect(row?.className).not.toContain('cursor-pointer')
  })

  it('applies custom maxHeight', () => {
    const cols = [{ key: 'a', header: 'A' }]
    const { container } = render(
      <TableSection data={[{ a: '1' }]} columns={cols} maxHeight="500px" />,
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.maxHeight).toBe('500px')
  })

  it('applies custom className', () => {
    const cols = [{ key: 'a', header: 'A' }]
    const { container } = render(
      <TableSection data={[{ a: '1' }]} columns={cols} className="my-table" />,
    )
    expect(container.firstElementChild?.className).toContain('my-table')
  })
})

describe('AlertSection — coverage', () => {
  it('applies warning styling', () => {
    const { container } = render(
      <AlertSection type="warning" message="watch out" />,
    )
    expect(container.firstElementChild?.className).toContain('yellow')
  })

  it('applies success styling', () => {
    const { container } = render(
      <AlertSection type="success" message="all good" />,
    )
    expect(container.firstElementChild?.className).toContain('green')
  })

  it('renders without title', () => {
    render(<AlertSection type="info" message="no title here" />)
    expect(screen.getByText('no title here')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <AlertSection type="error" message="err" className="my-alert" />,
    )
    expect(container.firstElementChild?.className).toContain('my-alert')
  })
})

describe('QuickActionsSection — coverage', () => {
  const MockIcon = ({ className }: { className?: string }) => (
    <span className={className} data-testid="action-icon" />
  )

  it('applies primary variant styling', () => {
    const actions = [
      { id: 'a1', label: 'Primary', icon: MockIcon, onClick: vi.fn(), variant: 'primary' as const },
    ]
    render(<QuickActionsSection actions={actions} />)
    const btn = screen.getByText('Primary').closest('button')
    expect(btn?.className).toContain('purple')
  })

  it('applies default variant when variant is undefined', () => {
    const actions = [
      { id: 'a2', label: 'Default', icon: MockIcon, onClick: vi.fn() },
    ]
    render(<QuickActionsSection actions={actions} />)
    const btn = screen.getByText('Default').closest('button')
    expect(btn?.className).toContain('bg-secondary')
  })

  it('applies custom className', () => {
    const actions = [
      { id: 'a3', label: 'Act', icon: MockIcon, onClick: vi.fn() },
    ]
    const { container } = render(
      <QuickActionsSection actions={actions} className="my-actions" />,
    )
    expect(container.firstElementChild?.className).toContain('my-actions')
  })
})

describe('BadgesSection — coverage', () => {
  it('handles keyboard Enter on clickable badge', () => {
    const onClick = vi.fn()
    const badges = [{ label: 'Tag', value: 'v1', onClick }]
    render(<BadgesSection badges={badges} />)
    const badge = screen.getByRole('button')
    fireEvent.keyDown(badge, { key: 'Enter' })
    expect(onClick).toHaveBeenCalled()
  })

  it('handles keyboard Space on clickable badge', () => {
    const onClick = vi.fn()
    const badges = [{ label: 'Tag', value: 'v1', onClick }]
    render(<BadgesSection badges={badges} />)
    const badge = screen.getByRole('button')
    fireEvent.keyDown(badge, { key: ' ' })
    expect(onClick).toHaveBeenCalled()
  })

  it('applies custom color to badge', () => {
    const badges = [{ label: 'X', value: 'Y', color: 'bg-red-500 text-white' }]
    render(<BadgesSection badges={badges} />)
    // The value <span> is nested inside the outer badge <span> that has the color class
    const valueSpan = screen.getByText('Y')
    const outerBadge = valueSpan.parentElement
    expect(outerBadge?.className).toContain('bg-red-500')
  })

  it('applies custom className', () => {
    const badges = [{ label: 'X', value: 'Y' }]
    const { container } = render(
      <BadgesSection badges={badges} className="my-badges" />,
    )
    expect(container.firstElementChild?.className).toContain('my-badges')
  })
})

describe('EmptySection — coverage', () => {
  it('renders icon when provided', () => {
    const MockIcon = ({ className }: { className?: string }) => (
      <span data-testid="empty-icon" className={className} />
    )
    render(<EmptySection icon={MockIcon} title="Empty" />)
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument()
  })

  it('does not render icon when not provided', () => {
    render(<EmptySection title="Empty" />)
    expect(screen.queryByTestId('empty-icon')).not.toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <EmptySection title="Empty" className="my-empty" />,
    )
    expect(container.firstElementChild?.className).toContain('my-empty')
  })

  it('fires action onClick when action button clicked', () => {
    const onClick = vi.fn()
    render(
      <EmptySection title="Empty" action={{ label: 'Go', onClick }} />,
    )
    fireEvent.click(screen.getByText('Go'))
    expect(onClick).toHaveBeenCalled()
  })
})

describe('CollapsibleSection — coverage', () => {
  it('renders string badge', () => {
    render(
      <CollapsibleSection title="Section" badge="info">
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('info')).toBeInTheDocument()
  })

  it('renders zero badge value', () => {
    render(
      <CollapsibleSection title="Section" badge={0}>
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('does not render badge when undefined', () => {
    const { container } = render(
      <CollapsibleSection title="Section">
        <p>Content</p>
      </CollapsibleSection>,
    )
    const badges = container.querySelectorAll('.bg-secondary')
    expect(badges.length).toBe(0)
  })

  it('applies custom className', () => {
    const { container } = render(
      <CollapsibleSection title="S" className="my-section">
        <p>C</p>
      </CollapsibleSection>,
    )
    expect(container.firstElementChild?.className).toContain('my-section')
  })
})
