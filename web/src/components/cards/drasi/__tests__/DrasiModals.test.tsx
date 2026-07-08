import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModalShell, ExpandModal, SourceConfigModal, QueryConfigModal } from '../DrasiModals'
import type { ExpandedNodeDetails, DrasiSource, DrasiQuery } from '../DrasiTypes'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../LazyCodeMirror', () => ({
  LazyCodeMirror: ({ value }: { value?: string }) => (
    <div data-testid="code-mirror">{value}</div>
  ),
}))

vi.mock('../../../../lib/download', () => ({
  downloadText: vi.fn(),
}))

vi.mock('js-yaml', () => ({
  dump: vi.fn((obj: unknown) => JSON.stringify(obj)),
}))

vi.mock('@codemirror/language', () => ({ StreamLanguage: { define: vi.fn(() => ({})) } }))
vi.mock('@codemirror/legacy-modes/mode/cypher', () => ({ cypher: {} }))
vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: {} }))

// ---------------------------------------------------------------------------
// ModalShell
// ---------------------------------------------------------------------------

describe('ModalShell', () => {
  it('renders children', () => {
    render(
      <ModalShell labelledBy="test-title" onClose={vi.fn()} panelClassName="panel">
        <span data-testid="child">modal content</span>
      </ModalShell>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders with role="dialog"', () => {
    render(
      <ModalShell labelledBy="test-title" onClose={vi.fn()} panelClassName="panel">
        <div />
      </ModalShell>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(
      <ModalShell labelledBy="test-title" onClose={onClose} panelClassName="panel">
        <div />
      </ModalShell>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked (closeOnBackdrop=true)', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ModalShell labelledBy="test-title" onClose={onClose} panelClassName="panel">
        <div />
      </ModalShell>,
    )
    // The outer motion.div (backdrop) is the first div in the container
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when backdrop clicked with closeOnBackdrop=false', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ModalShell
        labelledBy="test-title"
        onClose={onClose}
        panelClassName="panel"
        closeOnBackdrop={false}
      >
        <div />
      </ModalShell>,
    )
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes keydown listener on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(
      <ModalShell labelledBy="test-title" onClose={onClose} panelClassName="panel">
        <div />
      </ModalShell>,
    )
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ExpandModal
// ---------------------------------------------------------------------------

const EXPAND_NODE: ExpandedNodeDetails = {
  id: 'source-1',
  name: 'PostgreSQL Source',
  type: 'source',
  kind: 'POSTGRES',
  extra: { host: 'localhost', port: '5432' },
}

describe('ExpandModal', () => {
  it('renders nothing when node is null', () => {
    const { container } = render(<ExpandModal node={null} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders node name and type when node is provided', () => {
    render(<ExpandModal node={EXPAND_NODE} onClose={vi.fn()} />)
    expect(screen.getByText('PostgreSQL Source')).toBeInTheDocument()
    expect(screen.getByText('source · POSTGRES')).toBeInTheDocument()
  })

  it('renders extra fields from node', () => {
    render(<ExpandModal node={EXPAND_NODE} onClose={vi.fn()} />)
    expect(screen.getByText('host:')).toBeInTheDocument()
    expect(screen.getByText('localhost')).toBeInTheDocument()
    expect(screen.getByText('port:')).toBeInTheDocument()
    expect(screen.getByText('5432')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<ExpandModal node={EXPAND_NODE} onClose={onClose} />)
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// SourceConfigModal
// ---------------------------------------------------------------------------

const MOCK_SOURCE: DrasiSource = {
  id: 'src-1',
  name: 'My Source',
  kind: 'HTTP',
  status: 'ready',
}

describe('SourceConfigModal – create mode', () => {
  it('renders in create mode when source is null', () => {
    render(
      <SourceConfigModal source={null} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // save button should be present
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('save button is disabled when name is empty', () => {
    render(
      <SourceConfigModal source={null} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect(saveBtn).toBeDisabled()
  })

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn()
    render(<SourceConfigModal source={null} onSave={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('SourceConfigModal – edit mode', () => {
  it('pre-fills name from existing source', () => {
    render(
      <SourceConfigModal source={MOCK_SOURCE} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    const nameInput = screen.getByRole('textbox') as HTMLInputElement
    expect(nameInput.value).toBe('My Source')
  })

  it('save button is enabled when source name is non-empty', () => {
    render(
      <SourceConfigModal source={MOCK_SOURCE} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('calls onSave with name and kind on save click', () => {
    const onSave = vi.fn()
    render(
      <SourceConfigModal source={MOCK_SOURCE} onSave={onSave} onClose={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Source', kind: 'HTTP' }),
    )
  })
})

// ---------------------------------------------------------------------------
// QueryConfigModal
// ---------------------------------------------------------------------------

const MOCK_QUERY: DrasiQuery = {
  id: 'q-1',
  name: 'My Query',
  language: 'CYPHER QUERY',
  status: 'ready',
  sourceIds: ['src-1'],
  queryText: 'MATCH (n) RETURN n',
}

describe('QueryConfigModal – create mode', () => {
  it('renders in create mode when query is null', () => {
    render(
      <QueryConfigModal query={null} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('save button is disabled when name is empty in create mode', () => {
    render(
      <QueryConfigModal query={null} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})

describe('QueryConfigModal – edit mode', () => {
  it('pre-fills name from existing query', () => {
    render(
      <QueryConfigModal query={MOCK_QUERY} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    const nameInput = screen.getByRole('textbox') as HTMLInputElement
    expect(nameInput.value).toBe('My Query')
  })

  it('calls onSave on save click', () => {
    const onSave = vi.fn()
    render(
      <QueryConfigModal query={MOCK_QUERY} onSave={onSave} onClose={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Query', language: 'CYPHER QUERY' }),
    )
  })
})
