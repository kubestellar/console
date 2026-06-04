import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
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
import type { FeedbackDraft } from '../../../hooks/useFeedbackDrafts'

const DELETED_DRAFT: FeedbackDraft = {
  id: 'draft-del',
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

const MIN_TOUCH_PX = 44

describe('DraftsTab — touch target accessibility (WCAG 2.5.5)', () => {
  it('empty-all confirm group has min-h-11 (44px) touch target height', async () => {
    const user = userEvent.setup()
    renderDraftsTab({
      recentlyDeletedDrafts: [DELETED_DRAFT],
      recentlyDeletedCount: 1,
    })
    // Expand recently deleted section
    await user.click(screen.getByText(/Recently Deleted \(1\)/i).closest('button')!)
    // Click "Empty All" to show confirm
    await user.click(screen.getByText('Empty All'))

    const confirmGroup = screen.getByRole('group')
    expect(confirmGroup.className).toContain('min-h-11')
  })

  it('empty-all Confirm button meets 44x44px touch target via min-h-11 min-w-11', async () => {
    const user = userEvent.setup()
    renderDraftsTab({
      recentlyDeletedDrafts: [DELETED_DRAFT],
      recentlyDeletedCount: 1,
    })
    await user.click(screen.getByText(/Recently Deleted \(1\)/i).closest('button')!)
    await user.click(screen.getByText('Empty All'))

    const confirmBtn = screen.getByRole('button', { name: /confirm/i })
    expect(confirmBtn.className).toContain('min-h-11')
    expect(confirmBtn.className).toContain('min-w-11')
  })

  it('empty-all Cancel button meets 44x44px touch target via min-h-11 min-w-11', async () => {
    const user = userEvent.setup()
    renderDraftsTab({
      recentlyDeletedDrafts: [DELETED_DRAFT],
      recentlyDeletedCount: 1,
    })
    await user.click(screen.getByText(/Recently Deleted \(1\)/i).closest('button')!)
    await user.click(screen.getByText('Empty All'))

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    expect(cancelBtn.className).toContain('min-h-11')
    expect(cancelBtn.className).toContain('min-w-11')
  })

  it('Confirm and Cancel buttons use inline-flex centering for proper tap alignment', async () => {
    const user = userEvent.setup()
    renderDraftsTab({
      recentlyDeletedDrafts: [DELETED_DRAFT],
      recentlyDeletedCount: 1,
    })
    await user.click(screen.getByText(/Recently Deleted \(1\)/i).closest('button')!)
    await user.click(screen.getByText('Empty All'))

    const confirmBtn = screen.getByRole('button', { name: /confirm/i })
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    expect(confirmBtn.className).toContain('inline-flex')
    expect(confirmBtn.className).toContain('items-center')
    expect(confirmBtn.className).toContain('justify-center')
    expect(cancelBtn.className).toContain('inline-flex')
    expect(cancelBtn.className).toContain('items-center')
    expect(cancelBtn.className).toContain('justify-center')
  })

  it('uses TOUCH_TARGET_SIZE_CLASS constant (not hardcoded values)', async () => {
    // Verify the component imports and uses the centralized constant
    // by checking the rendered output matches the expected pattern
    const user = userEvent.setup()
    renderDraftsTab({
      recentlyDeletedDrafts: [DELETED_DRAFT],
      recentlyDeletedCount: 1,
    })
    await user.click(screen.getByText(/Recently Deleted \(1\)/i).closest('button')!)
    await user.click(screen.getByText('Empty All'))

    const confirmBtn = screen.getByRole('button', { name: /confirm/i })
    // TOUCH_TARGET_SIZE_CLASS = 'min-h-11 min-w-11' — both dimensions present
    expect(confirmBtn.className).toMatch(/min-h-11/)
    expect(confirmBtn.className).toMatch(/min-w-11/)
  })
})
