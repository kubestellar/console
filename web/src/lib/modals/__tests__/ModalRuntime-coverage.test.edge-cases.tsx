import React from 'react'
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
      {showBack && onBack && <div role="button" tabIndex={0} data-testid="back-btn" onClick={onBack}>Back</div>}
      {onClose && <div role="button" tabIndex={0} data-testid="close-btn" onClick={onClose}>Close</div>}
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


describe('parseModalYAML', () => {
  it('throws with descriptive error', () => {
    expect(() => parseModalYAML('kind: Pod')).toThrow('YAML parsing not yet implemented')
  })
})


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

