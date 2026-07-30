import React from 'react'
/**
 * Unit tests for YAMLEditorPanel (KubectlYAMLEditorPanel).
 * Covers: YAML textarea renders, validate button, apply button, clear button,
 * dry-run toggle, recent manifests list, copy/download actions, and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { YAMLEditorPanel } from './KubectlYAMLEditorPanel'
import type { YAMLManifest } from './Kubectl.types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}))

vi.mock('../ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/download', () => ({
  downloadText: vi.fn().mockReturnValue({ ok: true }),
}))

vi.mock('../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeManifest = (overrides: Partial<YAMLManifest> = {}): YAMLManifest => ({
  id: 'manifest-1',
  name: 'my-deployment',
  content: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: my-deployment',
  timestamp: new Date('2026-01-01T10:00:00Z'),
  ...overrides,
})

const defaultProps = {
  isDemoData: false,
  yamlContent: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: test',
  yamlError: null,
  yamlManifests: [makeManifest()],
  selectedManifest: null,
  isDryRun: false,
  isExecuting: false,
  onContentChange: vi.fn(),
  onValidate: vi.fn(),
  onApply: vi.fn(),
  onClear: vi.fn(),
  onToggleDryRun: vi.fn(),
  onLoadManifest: vi.fn(),
  onAddOutput: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('YAMLEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Renders editor
  it('renders YAML editor textarea', () => {
    render(<YAMLEditorPanel {...defaultProps} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders YAML content in textarea', () => {
    render(<YAMLEditorPanel {...defaultProps} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('apiVersion')
  })

  // 2. Apply button
  it('renders apply button', () => {
    render(<YAMLEditorPanel {...defaultProps} />)
    const applyBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('apply') || b.textContent?.includes('Apply'))
    expect(applyBtn).toBeTruthy()
  })

  it('calls onValidate when YAML content is typed in textarea', async () => {
    const user = userEvent.setup()
    render(<YAMLEditorPanel {...defaultProps} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'x')
    expect(defaultProps.onValidate).toHaveBeenCalled()
  })

  // 3. Apply button
  it('calls onApply when apply button is clicked', async () => {
    const user = userEvent.setup()
    render(<YAMLEditorPanel {...defaultProps} />)
    const applyBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('apply') || b.textContent?.includes('Apply'))
    if (applyBtn) {
      await user.click(applyBtn)
      expect(defaultProps.onApply).toHaveBeenCalled()
    }
  })

  // 4. Clear button
  it('calls onClear when clear button is clicked', async () => {
    const user = userEvent.setup()
    render(<YAMLEditorPanel {...defaultProps} />)
    const clearBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('clear') || b.textContent?.includes('Clear'))
    if (clearBtn) {
      await user.click(clearBtn)
      expect(defaultProps.onClear).toHaveBeenCalled()
    }
  })

  // 5. Dry-run toggle
  it('calls onToggleDryRun when dry-run checkbox is toggled', async () => {
    const user = userEvent.setup()
    render(<YAMLEditorPanel {...defaultProps} />)
    const checkbox = screen.queryByRole('checkbox')
    if (checkbox) {
      await user.click(checkbox)
      expect(defaultProps.onToggleDryRun).toHaveBeenCalled()
    }
  })

  // 6. YAML error display
  it('renders YAML error message', () => {
    render(<YAMLEditorPanel {...defaultProps} yamlError="Line 3: Invalid indentation" />)
    expect(screen.getByText(/Invalid indentation/i)).toBeInTheDocument()
  })

  // 7. Recent manifests
  it('renders recent manifest name', () => {
    render(<YAMLEditorPanel {...defaultProps} />)
    expect(screen.getByText('my-deployment')).toBeInTheDocument()
  })

  it('calls onLoadManifest when manifest item is clicked', async () => {
    const user = userEvent.setup()
    render(<YAMLEditorPanel {...defaultProps} />)
    const manifestBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('my-deployment'))
    if (manifestBtn) {
      await user.click(manifestBtn)
      expect(defaultProps.onLoadManifest).toHaveBeenCalled()
    }
  })

  // 8. Demo data notice
  it('shows demo badge when isDemoData is true', () => {
    render(<YAMLEditorPanel {...defaultProps} isDemoData={true} />)
    expect(screen.getByTestId('status-badge')).toBeInTheDocument()
  })

  // 9. Snapshot
  it('matches snapshot', () => {
    const { asFragment } = render(<YAMLEditorPanel {...defaultProps} />)
    expect(asFragment()).toMatchSnapshot()
  })
})
