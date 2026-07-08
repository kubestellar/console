import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusDot, NodeControls, SourceIconEl, ReactionIconEl, NodeCard } from '../DrasiNodeCard'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
}))

// react-i18next is globally mocked in src/test/setup.ts — no local mock needed.

// ---------------------------------------------------------------------------
// StatusDot
// ---------------------------------------------------------------------------

describe('StatusDot', () => {
  it('renders a green dot for ready status when not stopped', () => {
    const { container } = render(<StatusDot status="ready" isStopped={false} />)
    expect(container.querySelector('.bg-green-500')).not.toBeNull()
  })

  it('renders a red dot for error status when not stopped', () => {
    const { container } = render(<StatusDot status="error" isStopped={false} />)
    expect(container.querySelector('.bg-red-500')).not.toBeNull()
  })

  it('renders a yellow dot for pending status when not stopped', () => {
    const { container } = render(<StatusDot status="pending" isStopped={false} />)
    expect(container.querySelector('.bg-yellow-500')).not.toBeNull()
  })

  it('renders a slate dot when isStopped overrides any status', () => {
    const { container } = render(<StatusDot status="ready" isStopped={true} />)
    expect(container.querySelector('.bg-slate-500')).not.toBeNull()
    expect(container.querySelector('.bg-green-500')).toBeNull()
  })

  it('renders a slate dot for error status when stopped', () => {
    const { container } = render(<StatusDot status="error" isStopped={true} />)
    expect(container.querySelector('.bg-slate-500')).not.toBeNull()
    expect(container.querySelector('.bg-red-500')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// NodeControls
// ---------------------------------------------------------------------------

describe('NodeControls', () => {
  const base = {
    isStopped: false,
    onStop: vi.fn(),
    onExpand: vi.fn(),
  }

  it('renders a Stop button when not stopped', () => {
    render(<NodeControls {...base} isStopped={false} />)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
  })

  it('renders a Start button when stopped', () => {
    render(<NodeControls {...base} isStopped={true} />)
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('always renders the Expand button', () => {
    render(<NodeControls {...base} />)
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
  })

  it('does not render Pin button when showPin is false (default)', () => {
    render(<NodeControls {...base} />)
    expect(screen.queryByRole('button', { name: /pin/i })).toBeNull()
  })

  it('renders Pin button when showPin is true', () => {
    render(<NodeControls {...base} showPin={true} onPin={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Pin' })).toBeInTheDocument()
  })

  it('renders Unpin label when isPinned is true', () => {
    render(<NodeControls {...base} showPin={true} isPinned={true} onPin={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Unpin' })).toBeInTheDocument()
  })

  it('does not render Configure button when showGear is false (default)', () => {
    render(<NodeControls {...base} />)
    expect(screen.queryByRole('button', { name: 'Configure' })).toBeNull()
  })

  it('renders Configure button when showGear is true', () => {
    render(<NodeControls {...base} showGear={true} onConfigure={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument()
  })

  it('does not render Delete button when showDelete is false (default)', () => {
    render(<NodeControls {...base} />)
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('renders Delete button when showDelete is true', () => {
    render(<NodeControls {...base} showDelete={true} onDelete={vi.fn()} />)
    // Global i18n mock returns the key for t('actions.delete')
    expect(screen.getByRole('button', { name: 'actions.delete' })).toBeInTheDocument()
  })

  it('fires onStop when the Stop button is clicked', () => {
    const onStop = vi.fn()
    render(<NodeControls {...base} onStop={onStop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('fires onExpand when the Expand button is clicked', () => {
    const onExpand = vi.fn()
    render(<NodeControls {...base} onExpand={onExpand} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('fires onPin when the Pin button is clicked', () => {
    const onPin = vi.fn()
    render(<NodeControls {...base} showPin={true} onPin={onPin} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }))
    expect(onPin).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// SourceIconEl
// ---------------------------------------------------------------------------

describe('SourceIconEl', () => {
  it('renders without throwing for HTTP kind', () => {
    expect(() => render(<SourceIconEl kind="HTTP" />)).not.toThrow()
  })

  it('renders without throwing for POSTGRES kind', () => {
    expect(() => render(<SourceIconEl kind="POSTGRES" />)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// ReactionIconEl
// ---------------------------------------------------------------------------

describe('ReactionIconEl', () => {
  it('renders without throwing for SSE kind', () => {
    expect(() => render(<ReactionIconEl kind="SSE" />)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// NodeCard
// ---------------------------------------------------------------------------

describe('NodeCard', () => {
  const base = {
    nodeRef: vi.fn(),
    title: 'My Node',
    subtitle: 'source',
    icon: <span>icon</span>,
    status: 'ready' as const,
    accentColor: 'emerald' as const,
    isStopped: false,
    onStop: vi.fn(),
    onExpand: vi.fn(),
  }

  it('renders the title text', () => {
    render(<NodeCard {...base} />)
    expect(screen.getByText('My Node')).toBeInTheDocument()
  })

  it('renders the subtitle text', () => {
    render(<NodeCard {...base} />)
    expect(screen.getByText('source')).toBeInTheDocument()
  })

  it('renders custom children inside the card', () => {
    render(<NodeCard {...base}><span data-testid="child">extra</span></NodeCard>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('applies opacity-60 class when isStopped is true', () => {
    const { container } = render(<NodeCard {...base} isStopped={true} />)
    expect((container.firstChild as HTMLElement).className).toContain('opacity-60')
  })

  it('applies opacity-25 class when isDimmed is true (takes precedence over stopped)', () => {
    const { container } = render(<NodeCard {...base} isDimmed={true} />)
    expect((container.firstChild as HTMLElement).className).toContain('opacity-25')
  })

  it('applies no opacity class when active and not dimmed', () => {
    const { container } = render(<NodeCard {...base} />)
    const cls = (container.firstChild as HTMLElement).className
    expect(cls).not.toContain('opacity-60')
    expect(cls).not.toContain('opacity-25')
  })

  it('applies emerald selected border when isSelected with emerald accentColor', () => {
    const { container } = render(<NodeCard {...base} isSelected={true} accentColor="emerald" />)
    expect((container.firstChild as HTMLElement).className).toContain('border-emerald-400')
  })

  it('applies cyan selected border when isSelected with cyan accentColor', () => {
    const { container } = render(<NodeCard {...base} isSelected={true} accentColor="cyan" />)
    expect((container.firstChild as HTMLElement).className).toContain('border-cyan-400')
  })

  it('fires onClick when the card is clicked', () => {
    const onClick = vi.fn()
    render(<NodeCard {...base} onClick={onClick} />)
    fireEvent.click(screen.getByText('My Node'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('fires onHoverEnter when mouse enters the card', () => {
    const onHoverEnter = vi.fn()
    const { container } = render(<NodeCard {...base} onHoverEnter={onHoverEnter} />)
    fireEvent.mouseEnter(container.firstChild as HTMLElement)
    expect(onHoverEnter).toHaveBeenCalledTimes(1)
  })

  it('fires onHoverLeave when mouse leaves the card', () => {
    const onHoverLeave = vi.fn()
    const { container } = render(<NodeCard {...base} onHoverLeave={onHoverLeave} />)
    fireEvent.mouseLeave(container.firstChild as HTMLElement)
    expect(onHoverLeave).toHaveBeenCalledTimes(1)
  })
})
