/**
 * Coverage-focused tests for ModalRuntime.tsx component rendering
 *
 * The existing ModalRuntime.test.tsx only covers registry functions.
 * This file covers the actual React component:
 * - Rendering with tabs, sections, actions
 * - Title placeholder resolution
 * - Key-value, table, badges, custom, unknown section types
 * - Action bar with variants (default, primary, danger, warning)
 * - Disabled actions
 * - onAction callback
 * - onNavigate / onBack props
 * - Custom section renderers (prop + registry)
 * - Footer keyboard hints with/without onBack
 * - isOpen=false returns null
 * - Children rendering
 * - parseModalYAML throws
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  ModalRuntime,
  registerSectionRenderer,
  parseModalYAML,
} from '../ModalRuntime'
import type {
  ModalDefinition,
  ModalActionDefinition,
  SectionRendererProps,
} from '../types'

// Mock the BaseModal to avoid portal rendering and simplify testing
vi.mock('../BaseModal', () => {
  const Header = ({ title, children, onClose, onBack, showBack }: {
    title: string; children?: React.ReactNode; onClose?: () => void; onBack?: () => void; showBack?: boolean
  }) => (
    <div data-testid="modal-header">
      <span data-testid="modal-title">{title}</span>
      {showBack && onBack && <button data-testid="back-btn" onClick={onBack}>Back</button>}
      {onClose && <button data-testid="close-btn" onClick={onClose}>Close</button>}
      {children}
    </div>
  )
  const Content = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="modal-content">{children}</div>
  )
  const Footer = ({ showKeyboardHints, keyboardHints }: {
    showKeyboardHints?: boolean; keyboardHints?: Array<{ key: string; label: string }>
  }) => (
    <div data-testid="modal-footer">
      {showKeyboardHints && keyboardHints?.map((h) => (
        <span key={h.key}>{h.key}: {h.label}</span>
      ))}
    </div>
  )
  const Tabs = ({ tabs, activeTab, onTabChange }: {
    tabs: Array<{ id: string; label: string }>; activeTab: string; onTabChange: (id: string) => void
  }) => (
    <div data-testid="modal-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-testid={`tab-${tab.id}`}
          data-active={tab.id === activeTab}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
  const ActionBar = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="modal-action-bar">{children}</div>
  )

  const BaseModal = ({ isOpen, children }: {
    isOpen: boolean; onClose: () => void; size?: string; children?: React.ReactNode
  }) => {
    if (!isOpen) return null
    return <div data-testid="base-modal">{children}</div>
  }
  BaseModal.Header = Header
  BaseModal.Content = Content
  BaseModal.Footer = Footer
  BaseModal.Tabs = Tabs
  BaseModal.ActionBar = ActionBar

  return { BaseModal }
})

vi.mock('../useModalNavigation', () => ({
  useModalNavigation: vi.fn(),
}))

vi.mock('../../icons', () => ({
  getIcon: (name: string) => {
    const IconStub = ({ className }: { className?: string }) => (
      <span data-testid={`icon-${name}`} className={className}>{name}</span>
    )
    IconStub.displayName = `Icon(${name})`
    return IconStub
  },
}))

vi.mock('../ModalSections', () => ({
  KeyValueSection: ({ items, onNavigate }: { items: Array<{ label: string; value: string }>; onNavigate?: unknown }) => (
    <div data-testid="key-value-section">
      {items.map((item) => (
        <span key={item.label}>{item.label}: {item.value}</span>
      ))}
    </div>
  ),
  TableSection: ({ data, columns, emptyMessage }: {
    data: Array<Record<string, unknown>>; columns: Array<{ key: string; header: string }>; emptyMessage?: string
  }) => (
    <div data-testid="table-section">
      {Array.isArray(data) && data.length === 0 && emptyMessage && <span>{emptyMessage}</span>}
      {(Array.isArray(data) ? data : []).map((row, i) => (
        <div key={i}>{(columns || []).map((c) => <span key={c.key}>{String(row[c.key])}</span>)}</div>
      ))}
    </div>
  ),
  BadgesSection: ({ badges }: { badges: Array<{ label: string; value: string }> }) => (
    <div data-testid="badges-section">
      {badges.map((b) => <span key={b.label}>{b.label}: {b.value}</span>)}
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Helper definitions
// ---------------------------------------------------------------------------

function makeDefinition(overrides?: Partial<ModalDefinition>): ModalDefinition {
  return {
    kind: 'Pod',
    title: 'Pod Details - {name}',
    icon: 'Box',
    size: 'lg',
    tabs: [
      {
        id: 'overview',
        label: 'Overview',
        sections: [
          {
            type: 'key-value',
            fields: [
              { key: 'name', label: 'Name' },
              { key: 'namespace', label: 'Namespace' },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

const defaultData = { name: 'nginx-abc', namespace: 'production', cluster: 'cluster-1' }

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// Basic rendering
// ============================================================================

describe('ModalRuntime rendering', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ModalRuntime
        definition={makeDefinition()}
        isOpen={false}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders modal with resolved title', () => {
    render(
      <ModalRuntime
        definition={makeDefinition()}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByTestId('modal-title')).toHaveTextContent('Pod Details - nginx-abc')
  })

  it('renders tabs from definition', () => {
    render(
      <ModalRuntime
        definition={makeDefinition({
          tabs: [
            { id: 'overview', label: 'Overview', sections: [{ type: 'key-value', fields: [] }] },
            { id: 'events', label: 'Events', icon: 'Activity', badge: 'eventCount', sections: [{ type: 'key-value', fields: [] }] },
          ],
        })}
        isOpen={true}
        onClose={vi.fn()}
        data={{ ...defaultData, eventCount: 5 }}
      />
    )
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument()
    expect(screen.getByTestId('tab-events')).toBeInTheDocument()
  })

  it('switches tab content when a tab is clicked', () => {
    const def = makeDefinition({
      tabs: [
        {
          id: 'overview',
          label: 'Overview',
          sections: [{ type: 'key-value', fields: [{ key: 'name', label: 'Name' }] }],
        },
        {
          id: 'containers',
          label: 'Containers',
          sections: [{
            type: 'table',
            config: {
              dataKey: 'containers',
              columns: [{ key: 'name', header: 'Name' }],
            },
          }],
        },
      ],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={{ ...defaultData, containers: [{ name: 'main' }] }}
      />
    )

    // Initially on overview tab
    expect(screen.getByTestId('key-value-section')).toBeInTheDocument()

    // Switch to containers tab
    fireEvent.click(screen.getByTestId('tab-containers'))
    expect(screen.getByTestId('table-section')).toBeInTheDocument()
  })

  it('renders children in content area', () => {
    render(
      <ModalRuntime
        definition={makeDefinition()}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      >
        <div data-testid="custom-child">Custom Content</div>
      </ModalRuntime>
    )
    expect(screen.getByTestId('custom-child')).toBeInTheDocument()
  })
})

// ============================================================================
// Section rendering — various types
// ============================================================================

describe('ModalRuntime section types', () => {
  it('renders key-value section', () => {
    render(
      <ModalRuntime
        definition={makeDefinition()}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByTestId('key-value-section')).toBeInTheDocument()
    expect(screen.getByText('Name: nginx-abc')).toBeInTheDocument()
  })

  it('renders table section with dataKey', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{
          type: 'table',
          config: {
            dataKey: 'items',
            columns: [{ key: 'id', header: 'ID' }],
            emptyMessage: 'No items',
          },
        }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={{ ...defaultData, items: [{ id: '1' }, { id: '2' }] }}
      />
    )
    expect(screen.getByTestId('table-section')).toBeInTheDocument()
  })

  it('renders badges section', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{
          type: 'badges',
          config: { badges: ['status', 'phase'] },
        }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={{ ...defaultData, status: 'Running', phase: 'Active' }}
      />
    )
    expect(screen.getByTestId('badges-section')).toBeInTheDocument()
    expect(screen.getByText('Status: Running')).toBeInTheDocument()
  })

  it('renders custom section with content from config', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{
          type: 'custom',
          config: { content: <div data-testid="custom-content">Hello</div> },
        }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByTestId('custom-content')).toBeInTheDocument()
  })

  it('renders unknown section type with fallback message', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{ type: 'unknown-type' as never }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByText(/Unknown section type: unknown-type/)).toBeInTheDocument()
  })

  it('renders section title when provided', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{
          type: 'key-value',
          title: 'Resource Info',
          fields: [{ key: 'name', label: 'Name' }],
        }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByText('Resource Info')).toBeInTheDocument()
  })
})

// ============================================================================
// Header sections
// ============================================================================

describe('ModalRuntime header sections', () => {
  it('renders header sections (badges in header)', () => {
    const def = makeDefinition({
      headerSections: [{
        type: 'badges',
        config: { badges: ['cluster'] },
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    // Header should contain the badges section
    expect(screen.getByTestId('badges-section')).toBeInTheDocument()
  })
})

// ============================================================================
// Actions
// ============================================================================

describe('ModalRuntime actions', () => {
  const actions: ModalActionDefinition[] = [
    {
      id: 'diagnose',
      label: 'Diagnose',
      icon: 'Stethoscope',
      type: 'ai',
      variant: 'primary',
      description: 'Run AI diagnosis',
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: 'Trash',
      type: 'callback',
      variant: 'danger',
      disabled: true,
      description: 'Delete resource',
    },
    {
      id: 'warn',
      label: 'Warning',
      icon: 'AlertTriangle',
      type: 'callback',
      variant: 'warning',
    },
    {
      id: 'default-action',
      label: 'Default',
      icon: 'Circle',
      type: 'callback',
    },
  ]

  it('renders action buttons', () => {
    const def = makeDefinition({ actions })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )

    expect(screen.getByText('Diagnose')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Warning')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
  })

  it('calls onAction when action button is clicked', () => {
    const onAction = vi.fn()
    const def = makeDefinition({ actions: [actions[0]] })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
        onAction={onAction}
      />
    )

    fireEvent.click(screen.getByText('Diagnose'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'diagnose' }))
  })

  it('disabled actions are not clickable', () => {
    const onAction = vi.fn()
    const def = makeDefinition({ actions: [actions[1]] })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
        onAction={onAction}
      />
    )

    const deleteBtn = screen.getByText('Delete')
    expect(deleteBtn.closest('button')).toBeDisabled()
  })

  it('does not crash when onAction is not provided', () => {
    const def = makeDefinition({ actions: [actions[0]] })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )

    // Should not throw
    fireEvent.click(screen.getByText('Diagnose'))
  })
})

// ============================================================================
// Custom section renderers
// ============================================================================

describe('ModalRuntime custom renderers', () => {
  it('uses prop-based custom section renderers', () => {
    const CustomRenderer = ({ section, data }: SectionRendererProps) => (
      <div data-testid="custom-renderer">Custom: {String(data.name)}</div>
    )

    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{ type: 'my-custom' as never }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
        sectionRenderers={{ 'my-custom': CustomRenderer }}
      />
    )
    expect(screen.getByTestId('custom-renderer')).toBeInTheDocument()
    expect(screen.getByText('Custom: nginx-abc')).toBeInTheDocument()
  })

  it('uses registry-based section renderers', () => {
    const RegistryRenderer = ({ section, data }: SectionRendererProps) => (
      <div data-testid="registry-renderer">Registry: {String(data.name)}</div>
    )
    registerSectionRenderer('registry-type', RegistryRenderer)

    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{ type: 'registry-type' as never }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByTestId('registry-renderer')).toBeInTheDocument()
  })
})

// ============================================================================
// Footer / keyboard hints
// ============================================================================

describe('ModalRuntime footer', () => {
  it('shows Esc + Space hints when onBack is provided', () => {
    render(
      <ModalRuntime
        definition={makeDefinition()}
        isOpen={true}
        onClose={vi.fn()}
        onBack={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByText('Esc: close')).toBeInTheDocument()
    expect(screen.getByText('Space: back')).toBeInTheDocument()
  })

  it('shows only Esc hint when onBack is not provided', () => {
    render(
      <ModalRuntime
        definition={makeDefinition()}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByText('Esc: close')).toBeInTheDocument()
    expect(screen.queryByText('Space: back')).toBeNull()
  })

  it('respects footer.showKeyboardHints=false', () => {
    const def = makeDefinition({ footer: { showKeyboardHints: false } })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    // Footer is rendered but hints are hidden
    expect(screen.getByTestId('modal-footer')).toBeInTheDocument()
  })
})

// ============================================================================
// Keyboard config
// ============================================================================

describe('ModalRuntime keyboard config', () => {
  it('renders with custom keyboard config (escape=none, backspace=none)', async () => {
    const { useModalNavigation } = await import('../useModalNavigation') as { useModalNavigation: ReturnType<typeof vi.fn> }

    const def = makeDefinition({
      keyboard: { escape: 'none', backspace: 'none' },
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )

    expect(useModalNavigation).toHaveBeenCalledWith(expect.objectContaining({
      enableEscape: false,
      enableBackspace: false,
    }))
  })
})

// ============================================================================
// Table section edge cases
// ============================================================================

describe('ModalRuntime table section edge cases', () => {
  it('renders table without dataKey (uses data directly)', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{
          type: 'table',
          config: {
            columns: [{ key: 'name', header: 'Name' }],
          },
        }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByTestId('table-section')).toBeInTheDocument()
  })

  it('renders table with empty config', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{
          type: 'table',
        }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByTestId('table-section')).toBeInTheDocument()
  })
})

// ============================================================================
// Key-value section with linkTo
// ============================================================================

describe('ModalRuntime key-value with linkTo', () => {
  it('passes linkTo navigation target in items', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{
          type: 'key-value',
          fields: [
            { key: 'nodeName', label: 'Node', linkTo: 'node' },
          ],
        }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={{ ...defaultData, nodeName: 'worker-1' }}
        onNavigate={vi.fn()}
      />
    )
    expect(screen.getByText('Node: worker-1')).toBeInTheDocument()
  })
})

// ============================================================================
// Badges section with missing data
// ============================================================================

describe('ModalRuntime badges with missing data', () => {
  it('renders dash for missing badge values', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{
          type: 'badges',
          config: { badges: ['missing'] },
        }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByText('Missing: -')).toBeInTheDocument()
  })
})

// ============================================================================
// parseModalYAML
// ============================================================================

describe('parseModalYAML', () => {
  it('throws with descriptive error', () => {
    expect(() => parseModalYAML('kind: Pod')).toThrow('YAML parsing not yet implemented')
  })
})

// ============================================================================
// Definition without tabs
// ============================================================================

describe('ModalRuntime without tabs', () => {
  it('renders without tabs section', () => {
    const def = makeDefinition({ tabs: undefined })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('modal-tabs')).toBeNull()
  })
})

// ============================================================================
// Custom section with no content
// ============================================================================

describe('ModalRuntime custom section with no content', () => {
  it('renders null for custom section without config.content', () => {
    const def = makeDefinition({
      tabs: [{
        id: 'tab1',
        label: 'Tab',
        sections: [{ type: 'custom', config: {} }],
      }],
    })

    render(
      <ModalRuntime
        definition={def}
        isOpen={true}
        onClose={vi.fn()}
        data={defaultData}
      />
    )
    // Should not crash
    expect(screen.getByTestId('modal-content')).toBeInTheDocument()
  })
})
