import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FeedbackDraft } from '../../../hooks/useFeedbackDrafts'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, _opts?: unknown) => {
      if (typeof fallback === 'string') return fallback
      return key
    },
  }),
}))

vi.mock('../../../hooks/useFeedbackDrafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useFeedbackDrafts')>()
  return {
    ...actual,
    extractDraftTitle: (desc: string) => desc.split('\n')[0] ?? 'Untitled',
  }
})

vi.mock('../FeatureRequestTypes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../FeatureRequestTypes')>()
  return {
    ...actual,
    formatRelativeTime: () => '2 hours ago',
  }
})

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

import { DraftsTab } from '../DraftsTab'

const BUG_DRAFT: FeedbackDraft = {
  id: 'draft-1',
  requestType: 'bug',
  targetRepo: 'console',
  description: 'Login button broken\nMore details here',
  savedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const FEATURE_DRAFT: FeedbackDraft = {
  id: 'draft-2',
  requestType: 'feature',
  targetRepo: 'docs',
  description: 'Add dark mode support\nDetails',
  savedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const DELETED_DRAFT: FeedbackDraft = {
  id: 'draft-3',
  requestType: 'bug',
  targetRepo: 'console',
  description: 'Deleted draft\nSome details',
  savedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: new Date().toISOString(),
}

function renderDraftsTab(
  overrides: Partial<React.ComponentProps<typeof DraftsTab>> = {},
) {
  const props: React.ComponentProps<typeof DraftsTab> = {
    drafts: [],
    draftCount: 0,
    recentlyDeletedDrafts: [],
    recentlyDeletedCount: 0,
    editingDraftId: null,
    confirmDeleteDraft: null,
    showClearAllDrafts: false,
    onSetActiveTab: vi.fn(),
    onRestoreDraft: vi.fn(),
    onDeleteDraft: vi.fn(),
    onPermanentlyDeleteDraft: vi.fn(),
    onRestoreDeletedDraft: vi.fn(),
    onEmptyRecentlyDeleted: vi.fn(),
    onSetConfirmDeleteDraft: vi.fn(),
    onSetShowClearAllDrafts: vi.fn(),
    onClearAllDrafts: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<DraftsTab {...props} />) }
}

describe('DraftsTab — empty state', () => {
  it('shows "No saved drafts" when draftCount is 0', () => {
    renderDraftsTab()
    expect(screen.getByText('No saved drafts')).toBeInTheDocument()
  })

  it('shows start-writing button in empty state', () => {
    renderDraftsTab()
    expect(screen.getByText('Start writing a new report')).toBeInTheDocument()
  })

  it('calls onSetActiveTab("submit") when start-writing is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDraftsTab()
    await user.click(screen.getByText('Start writing a new report'))
    expect(props.onSetActiveTab).toHaveBeenCalledWith('submit')
  })

  it('shows draft count header', () => {
    renderDraftsTab({ draftCount: 0 })
    expect(screen.getByText(/Saved Drafts \(0\)/i)).toBeInTheDocument()
  })
})

describe('DraftsTab — draft list', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a bug draft with title', () => {
    renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1 })
    expect(screen.getByText(/Login button broken/)).toBeInTheDocument()
  })

  it('renders bug type badge', () => {
    renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1 })
    expect(screen.getByText('Bug')).toBeInTheDocument()
  })

  it('renders console repo badge', () => {
    renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1 })
    expect(screen.getByText('Console')).toBeInTheDocument()
  })

  it('renders feature type badge', () => {
    renderDraftsTab({ drafts: [FEATURE_DRAFT], draftCount: 1 })
    expect(screen.getByText('Feature')).toBeInTheDocument()
  })

  it('renders docs repo badge', () => {
    renderDraftsTab({ drafts: [FEATURE_DRAFT], draftCount: 1 })
    expect(screen.getByText('Docs')).toBeInTheDocument()
  })

  it('calls onRestoreDraft when draft row is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1 })
    await user.click(screen.getByRole('button', { name: /restore draft/i }))
    expect(props.onRestoreDraft).toHaveBeenCalledWith(BUG_DRAFT)
  })

  it('renders Edit button', () => {
    renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1 })
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('shows Reload instead of Edit when draft is being edited', () => {
    renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1, editingDraftId: 'draft-1' })
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
  })

  it('shows Editing status badge when draft is being edited', () => {
    renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1, editingDraftId: 'draft-1' })
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Editing')
  })

  it('calls onSetConfirmDeleteDraft when Delete button clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1 })
    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(props.onSetConfirmDeleteDraft).toHaveBeenCalledWith('draft-1')
  })

  it('shows delete confirmation when confirmDeleteDraft matches draft id', () => {
    renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1, confirmDeleteDraft: 'draft-1' })
    expect(screen.getByText('Delete this draft?')).toBeInTheDocument()
  })

  it('calls onDeleteDraft when confirm delete is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDraftsTab({
      drafts: [BUG_DRAFT],
      draftCount: 1,
      confirmDeleteDraft: 'draft-1',
    })
    const confirmBtn = screen.getAllByRole('button', { name: /confirm/i })[0]
    await user.click(confirmBtn)
    expect(props.onDeleteDraft).toHaveBeenCalledWith('draft-1')
  })

  it('calls onSetConfirmDeleteDraft(null) when cancel delete is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDraftsTab({
      drafts: [BUG_DRAFT],
      draftCount: 1,
      confirmDeleteDraft: 'draft-1',
    })
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelBtn)
    expect(props.onSetConfirmDeleteDraft).toHaveBeenCalledWith(null)
  })
})

describe('DraftsTab — clear all', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows Clear All button when draftCount > 1', () => {
    renderDraftsTab({
      drafts: [BUG_DRAFT, FEATURE_DRAFT],
      draftCount: 2,
    })
    expect(screen.getByText('Clear All')).toBeInTheDocument()
  })

  it('does not show Clear All button when draftCount is 1', () => {
    renderDraftsTab({ drafts: [BUG_DRAFT], draftCount: 1 })
    expect(screen.queryByText('Clear All')).not.toBeInTheDocument()
  })

  it('calls onSetShowClearAllDrafts(true) when Clear All is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDraftsTab({
      drafts: [BUG_DRAFT, FEATURE_DRAFT],
      draftCount: 2,
    })
    await user.click(screen.getByText('Clear All'))
    expect(props.onSetShowClearAllDrafts).toHaveBeenCalledWith(true)
  })

  it('shows Delete all confirmation when showClearAllDrafts is true', () => {
    renderDraftsTab({ draftCount: 2, showClearAllDrafts: true })
    expect(screen.getByText('Delete all?')).toBeInTheDocument()
  })

  it('calls onClearAllDrafts when clear confirm is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDraftsTab({ draftCount: 2, showClearAllDrafts: true })
    const confirmBtn = screen.getByRole('button', { name: /confirm/i })
    await user.click(confirmBtn)
    expect(props.onClearAllDrafts).toHaveBeenCalledOnce()
  })

  it('calls onSetShowClearAllDrafts(false) when clear cancel is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDraftsTab({ draftCount: 2, showClearAllDrafts: true })
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(props.onSetShowClearAllDrafts).toHaveBeenCalledWith(false)
  })
})

describe('DraftsTab — recently deleted', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows Recently Deleted toggle when recentlyDeletedCount > 0', () => {
    renderDraftsTab({
      recentlyDeletedDrafts: [DELETED_DRAFT],
      recentlyDeletedCount: 1,
    })
    expect(screen.getByText(/Recently Deleted \(1\)/i)).toBeInTheDocument()
  })

  it('does not show Recently Deleted section when count is 0', () => {
    renderDraftsTab()
    expect(screen.queryByText(/Recently Deleted/i)).not.toBeInTheDocument()
  })

  it('expands recently deleted on toggle click', async () => {
    const user = userEvent.setup()
    renderDraftsTab({
      recentlyDeletedDrafts: [DELETED_DRAFT],
      recentlyDeletedCount: 1,
    })
    await user.click(screen.getByText(/Recently Deleted \(1\)/i).closest('button')!)
    expect(screen.getByText(/Restore/i)).toBeInTheDocument()
  })

  it('calls onRestoreDeletedDraft and showToast when Restore clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDraftsTab({
      recentlyDeletedDrafts: [DELETED_DRAFT],
      recentlyDeletedCount: 1,
    })
    // Expand first
    await user.click(screen.getByText(/Recently Deleted \(1\)/i).closest('button')!)
    await user.click(screen.getByRole('button', { name: /restore/i }))
    expect(props.onRestoreDeletedDraft).toHaveBeenCalledWith('draft-3')
    expect(props.showToast).toHaveBeenCalledWith('Draft restored', 'success')
  })
})
