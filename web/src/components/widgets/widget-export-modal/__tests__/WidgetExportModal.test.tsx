import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WidgetExportModal } from '../WidgetExportModalContent'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../lib/modals', () => ({
  BaseModal: ({ isOpen, children }: { isOpen: boolean; children?: React.ReactNode }) =>
    isOpen ? <div data-testid="base-modal">{children}</div> : null,
}))

// Mock BaseModal sub-components accessed as compound properties
const MockBaseModal = ({ isOpen, children }: { isOpen: boolean; children?: React.ReactNode }) =>
  isOpen ? <div data-testid="base-modal">{children}</div> : null
MockBaseModal.Header = ({ title }: { title: string; [key: string]: unknown }) => (
  <div data-testid="modal-header">{title}</div>
)
MockBaseModal.Content = ({ children }: { children?: React.ReactNode }) => (
  <div data-testid="modal-content">{children}</div>
)
MockBaseModal.Footer = ({ children }: { children?: React.ReactNode }) => (
  <div data-testid="modal-footer">{children}</div>
)

vi.mock('../../../../lib/modals', () => ({
  BaseModal: MockBaseModal,
}))

vi.mock('../../../../lib/analytics', () => ({
  emitWidgetDownloaded: vi.fn(),
}))

vi.mock('../../../../lib/download', () => ({
  safeRevokeObjectURL: vi.fn(),
}))

vi.mock('../../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../../../lib/widgets/codeGenerator', () => ({
  generateWidget: vi.fn(() => 'export default function Widget() { return null; }'),
  getWidgetFilename: vi.fn(() => 'my-widget.jsx'),
}))

vi.mock('../../../../lib/widgets/widgetRegistry', () => ({
  WIDGET_CARDS: {
    clusters: { cardType: 'clusters', label: 'Clusters', description: 'Cluster overview' },
    pods: { cardType: 'pods', label: 'Pods', description: 'Pod list' },
  },
  WIDGET_STATS: {
    cpu: { statId: 'cpu', label: 'CPU Usage' },
    memory: { statId: 'memory', label: 'Memory' },
  },
  WIDGET_TEMPLATES: {
    cluster_overview: { templateId: 'cluster_overview', label: 'Cluster Overview', description: 'Overview' },
  },
}))

vi.mock('../WidgetExportModalPreview', () => ({
  WidgetPreview: () => <div data-testid="widget-preview" />,
  getWidgetPreviewDimensions: vi.fn(() => ({ width: 400, height: 300 })),
  getWidgetPreviewScale: vi.fn(() => 1),
}))

vi.mock('../WidgetExportModalSelectionItems', () => ({
  CardItem: ({ card, selected, onSelect }: {
    card: { cardType: string; label: string }
    selected: boolean
    onSelect: () => void
  }) => (
    <button
      data-testid={`card-item-${card.cardType}`}
      aria-selected={selected}
      onClick={onSelect}
    >
      {card.label}
    </button>
  ),
  StatItem: ({ stat, selected, onToggle }: {
    stat: { statId: string; label: string }
    selected: boolean
    onToggle: () => void
  }) => (
    <button
      data-testid={`stat-item-${stat.statId}`}
      aria-selected={selected}
      onClick={onToggle}
    >
      {stat.label}
    </button>
  ),
  TemplateCard: ({ template, selected, onSelect }: {
    template: { templateId: string; label: string }
    selected: boolean
    onSelect: () => void
  }) => (
    <button
      data-testid={`template-${template.templateId}`}
      aria-selected={selected}
      onClick={onSelect}
    >
      {template.label}
    </button>
  ),
}))

vi.mock('../../../../lib/a11y/rovingFocus', () => ({
  moveFocusByKey: vi.fn(),
}))

vi.mock('../../../../lib/constants', () => ({
  BACKEND_DEFAULT_URL: 'http://localhost:8080',
}))

vi.mock('../../../../lib/constants/network', () => ({
  UI_FEEDBACK_TIMEOUT_MS: 2000,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(props: Partial<React.ComponentProps<typeof WidgetExportModal>> = {}) {
  return render(
    <WidgetExportModal
      isOpen={true}
      onClose={vi.fn()}
      {...props}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WidgetExportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing when isOpen=true', () => {
    renderModal()
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
  })

  it('renders nothing when isOpen=false', () => {
    render(<WidgetExportModal isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument()
  })

  it('shows the templates tab by default', () => {
    renderModal()
    expect(screen.getByRole('tab', { name: /templates/i })).toBeInTheDocument()
    const templatesTab = screen.getByRole('tab', { name: /templates/i })
    expect(templatesTab).toHaveAttribute('aria-selected', 'true')
  })

  it('starts on the card tab when cardType is provided', () => {
    renderModal({ cardType: 'clusters' })
    const cardTab = screen.getByRole('tab', { name: /single card/i })
    expect(cardTab).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to card tab on click', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('tab', { name: /single card/i }))
    expect(screen.getByTestId('card-item-clusters')).toBeInTheDocument()
    expect(screen.getByTestId('card-item-pods')).toBeInTheDocument()
  })

  it('switches to stats tab on click', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('tab', { name: /stat blocks/i }))
    expect(screen.getByTestId('stat-item-cpu')).toBeInTheDocument()
    expect(screen.getByTestId('stat-item-memory')).toBeInTheDocument()
  })

  it('shows template items in templates tab', () => {
    renderModal()
    expect(screen.getByTestId('template-cluster_overview')).toBeInTheDocument()
  })

  it('renders Copy Code and Download buttons', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
  })

  it('copy and download buttons are enabled when a template is selected', () => {
    renderModal()
    // A template is pre-selected by default (cluster_overview)
    const copyBtn = screen.getByRole('button', { name: /copy code/i })
    expect(copyBtn).not.toBeDisabled()
  })

  it('calls copyToClipboard on copy button click', async () => {
    const { copyToClipboard } = await import('../../../../lib/clipboard')
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /copy code/i }))
    expect(copyToClipboard).toHaveBeenCalled()
  })

  it('toggles show code section on button click', async () => {
    const user = userEvent.setup()
    renderModal()
    const toggleBtn = screen.getByRole('button', { name: /show code/i })
    await user.click(toggleBtn)
    expect(screen.getByRole('button', { name: /hide code/i })).toBeInTheDocument()
  })

  it('renders in embedded mode without BaseModal wrapper', () => {
    const { container } = render(
      <WidgetExportModal isOpen={true} onClose={vi.fn()} embedded={true} />,
    )
    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument()
    expect(container.firstChild).toBeTruthy()
  })
})
