/**
 * Deep branch-coverage tests for CreateDashboardModal.tsx
 *
 * Tests form validation, template selection, creation flow,
 * health alert display, and keyboard interactions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen,waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'dashboard.create.title': 'Create Dashboard',
        'dashboard.create.description': 'Create a new dashboard',
        'dashboard.create.nameLabel': 'Dashboard Name',
        'dashboard.create.descriptionLabel': 'Description',
        'dashboard.create.descriptionPlaceholder': 'Add a description...',
        'dashboard.create.optional': '(optional)',
        'dashboard.create.startingContent': 'Starting Content',
        'dashboard.create.startBlank': 'Start Blank',
        'dashboard.create.startBlankDesc': 'Empty dashboard with no cards',
        'dashboard.create.startWithTemplate': 'Start with a Card Collection',
        'dashboard.create.chooseFromTemplates': 'Choose from pre-built card sets',
        'dashboard.create.selectByCategory': 'Select a collection by category:',
        'dashboard.create.cards': 'cards',
        'dashboard.create.creating': 'Creating...',
        'actions.cancel': 'Cancel',
      }
      if (key === 'dashboard.create.preConfiguredCards' && opts?.count) {
        return `${opts.count} pre-configured cards`
      }
      return map[key] || key
    },
  }),
}))

vi.mock('../../../lib/modals', () => ({
  BaseModal: Object.assign(
    ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) => {
      if (!isOpen) return null
      return <div data-testid="base-modal">{children}</div>
    },
    {
      Header: ({ title, onClose }: { title: string; onClose: () => void }) => (
        <div data-testid="modal-header">
          <span>{title}</span>
          <button onClick={onClose} data-testid="close-button">Close</button>
        </div>
      ),
      Content: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="modal-content">{children}</div>
      ),
      Footer: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="modal-footer">{children}</div>
      ),
    }
  ),
}))

vi.mock('../../ui/Button', () => ({
  Button: ({ children, onClick, disabled, loading, ...rest }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    [key: string]: unknown
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-loading={loading}
      data-testid={rest['data-testid']}
    >
      {children}
    </button>
  ),
}))

// Health alert was removed from CreateDashboardModal — no mock needed

vi.mock('../../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FOCUS_DELAY_MS: 0,
} })

vi.mock('../templates', () => ({
  DASHBOARD_TEMPLATES: [
    {
      id: 'tmpl-1',
      name: 'Cluster Overview',
      description: 'Monitor clusters',
      icon: '🌐',
      category: 'cluster',
      cards: [
        { card_type: 'cluster_health', position: { w: 4, h: 2 } },
        { card_type: 'pod_issues', position: { w: 6, h: 2 } },
      ],
    },
    {
      id: 'tmpl-2',
      name: 'GPU Dashboard',
      description: 'GPU monitoring',
      icon: '🎮',
      category: 'gpu',
      cards: [
        { card_type: 'gpu_overview', position: { w: 4, h: 2 } },
      ],
    },
  ],
  TEMPLATE_CATEGORIES: [
    { id: 'cluster', name: 'Cluster', icon: '🌐' },
    { id: 'gpu', name: 'GPU', icon: '🎮' },
  ],
}))

import { CreateDashboardModal } from '../CreateDashboardModal'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onCreate: vi.fn().mockResolvedValue(undefined),
  existingNames: [] as string[],
}

describe('CreateDashboardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ───────────────────────────────────────────────────────

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CreateDashboardModal {...defaultProps} isOpen={false} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the modal when isOpen is true', () => {
    render(<CreateDashboardModal {...defaultProps} />)
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
    // Title should appear in the header
    expect(screen.getAllByText('Create Dashboard').length).toBeGreaterThanOrEqual(1)
  })

  it('renders name input and description textarea', () => {
    render(<CreateDashboardModal {...defaultProps} />)
    expect(screen.getByText('Dashboard Name')).toBeInTheDocument()
    expect(screen.getByText(/Description/)).toBeInTheDocument()
  })

  it('shows blank option selected by default', () => {
    render(<CreateDashboardModal {...defaultProps} />)
    expect(screen.getByText('Start Blank')).toBeInTheDocument()
  })

  // ── Name generation ─────────────────────────────────────────────────

  it('generates a unique default name avoiding existing names', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(
      <CreateDashboardModal
        {...defaultProps}
        existingNames={['Dashboard 1', 'Dashboard 2']}
        onCreate={onCreate}
      />
    )
    // Click create without entering a name
    const createBtn = screen.getByText('Create Dashboard', { selector: 'button' })
    await user.click(createBtn)
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith('Dashboard 3', undefined, undefined)
    })
  })

  // ── Template selection ──────────────────────────────────────────────

  it('shows templates when template option is clicked', async () => {
    const user = userEvent.setup()
    render(<CreateDashboardModal {...defaultProps} />)
    // Click "Start with Template"
    await user.click(screen.getByText('Start with a Card Collection'))
    expect(screen.getByText('Select a collection by category:')).toBeInTheDocument()
    // Categories should be visible
    expect(screen.getByText('Cluster')).toBeInTheDocument()
    expect(screen.getByText('GPU')).toBeInTheDocument()
  })

  it('expands a category to show templates', async () => {
    const user = userEvent.setup()
    render(<CreateDashboardModal {...defaultProps} />)
    await user.click(screen.getByText('Start with a Card Collection'))
    // Click cluster category
    await user.click(screen.getByText('Cluster'))
    expect(screen.getByText('Cluster Overview')).toBeInTheDocument()
  })

  it('selects a template and shows card count', async () => {
    const user = userEvent.setup()
    render(<CreateDashboardModal {...defaultProps} />)
    await user.click(screen.getByText('Start with a Card Collection'))
    await user.click(screen.getByText('Cluster'))
    await user.click(screen.getByText('Cluster Overview'))
    // Should show selected template info
    expect(screen.getByText('2 pre-configured cards')).toBeInTheDocument()
  })

  it('creates with selected template', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateDashboardModal {...defaultProps} onCreate={onCreate} />)

    // Type a name
    const nameInput = screen.getByPlaceholderText('Dashboard 1')
    await user.type(nameInput, 'My Dashboard')

    // Select template
    await user.click(screen.getByText('Start with a Card Collection'))
    await user.click(screen.getByText('GPU'))
    await user.click(screen.getByText('GPU Dashboard'))

    // Create
    const createBtn = screen.getByText('Create Dashboard', { selector: 'button' })
    await user.click(createBtn)

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1)
      const [name, template] = onCreate.mock.calls[0]
      expect(name).toBe('My Dashboard')
      expect(template.id).toBe('tmpl-2')
    })
  })

  // ── Blank creation ──────────────────────────────────────────────────

  it('creates blank dashboard when no template selected', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateDashboardModal {...defaultProps} onCreate={onCreate} />)

    const nameInput = screen.getByPlaceholderText('Dashboard 1')
    await user.type(nameInput, 'Blank Board')

    const createBtn = screen.getByText('Create Dashboard', { selector: 'button' })
    await user.click(createBtn)

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith('Blank Board', undefined, undefined)
    })
  })

  // ── Keyboard interaction ────────────────────────────────────────────

  it('submits on Enter key in name input', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateDashboardModal {...defaultProps} onCreate={onCreate} />)

    const nameInput = screen.getByPlaceholderText('Dashboard 1')
    await user.type(nameInput, 'Keyboard Test{Enter}')

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalled()
    })
  })

  // ── Loading / disabled state ─────────────────────────────────────────

  it('disables the create button and shows loading while creating', async () => {
    const user = userEvent.setup()
    let resolveCreate: () => void = () => {}
    const onCreate = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolveCreate = r }))
    render(<CreateDashboardModal {...defaultProps} onCreate={onCreate} />)

    const createBtn = screen.getByText('Create Dashboard', { selector: 'button' })
    await user.click(createBtn)

    // Button should be disabled and show loading during async creation
    await waitFor(() => {
      expect(createBtn).toBeDisabled()
      expect(createBtn).toHaveAttribute('data-loading', 'true')
    })

    // Resolve the promise to finish creation
    resolveCreate()
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1)
    })
  })

  // ── Cancel ──────────────────────────────────────────────────────────

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<CreateDashboardModal {...defaultProps} />)
    await user.click(screen.getByText('Cancel'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  // ── Toggle template/blank ───────────────────────────────────────────

  it('toggles back to blank after selecting templates', async () => {
    const user = userEvent.setup()
    render(<CreateDashboardModal {...defaultProps} />)
    // Open templates
    await user.click(screen.getByText('Start with a Card Collection'))
    expect(screen.getByText('Select a collection by category:')).toBeInTheDocument()
    // Click back to blank
    await user.click(screen.getByText('Start Blank'))
    expect(screen.queryByText('Select a collection by category:')).not.toBeInTheDocument()
  })

  // ── Category collapse ───────────────────────────────────────────────

  it('collapses category when clicked again', async () => {
    const user = userEvent.setup()
    render(<CreateDashboardModal {...defaultProps} />)
    await user.click(screen.getByText('Start with a Card Collection'))
    // Expand
    await user.click(screen.getByText('Cluster'))
    expect(screen.getByText('Cluster Overview')).toBeInTheDocument()
    // Collapse
    await user.click(screen.getByText('Cluster'))
    expect(screen.queryByText('Cluster Overview')).not.toBeInTheDocument()
  })

  // ── Description input ───────────────────────────────────────────────

  it('passes description when provided', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateDashboardModal {...defaultProps} onCreate={onCreate} />)

    const nameInput = screen.getByPlaceholderText('Dashboard 1')
    await user.type(nameInput, 'My Board')

    const descInput = screen.getByPlaceholderText('Add a description...')
    await user.type(descInput, 'A test description')

    const createBtn = screen.getByText('Create Dashboard', { selector: 'button' })
    await user.click(createBtn)

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith('My Board', undefined, 'A test description')
    })
  })
})
