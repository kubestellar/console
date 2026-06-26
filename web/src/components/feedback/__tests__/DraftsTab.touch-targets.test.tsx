import { describe, it, expect, vi } from 'vitest'
import type { ComponentProps, ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
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
  StatusBadge: ({ children }: { children: ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

import { TOUCH_TARGET_HEIGHT_CLASS, TOUCH_TARGET_SIZE_CLASS } from '../../../lib/constants/ui'
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
  overrides: Partial<ComponentProps<typeof DraftsTab>> = {},
) {
  const props: ComponentProps<typeof DraftsTab> = {
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

async function openEmptyAllConfirmation() {
  const user = userEvent.setup()
  renderDraftsTab({
    recentlyDeletedDrafts: [DELETED_DRAFT],
    recentlyDeletedCount: 1,
  })

  await user.click(screen.getByText(/Recently Deleted \(1\)/i).closest('button')!)
  await user.click(screen.getByRole('button', { name: /^Empty All$/i }))

  return screen.getByRole('group')
}

function expectClassList(element: HTMLElement, classNames: string) {
  classNames.split(' ').forEach(className => expect(element).toHaveClass(className))
}

describe('DraftsTab — touch target accessibility (WCAG 2.5.5)', () => {
  it('empty-all confirm group has min-h-11 (44px) touch target height', async () => {
    const confirmGroup = await openEmptyAllConfirmation()

    expectClassList(confirmGroup, TOUCH_TARGET_HEIGHT_CLASS)
  })

  it('empty-all Confirm button meets 44x44px touch target via min-h-11 min-w-11', async () => {
    const confirmGroup = await openEmptyAllConfirmation()
    const confirmBtn = within(confirmGroup).getByRole('button', { name: /^Confirm$/i })

    expectClassList(confirmBtn, TOUCH_TARGET_SIZE_CLASS)
  })

  it('empty-all Cancel button meets 44x44px touch target via min-h-11 min-w-11', async () => {
    const confirmGroup = await openEmptyAllConfirmation()
    const cancelBtn = within(confirmGroup).getByRole('button', { name: /^Cancel$/i })

    expectClassList(cancelBtn, TOUCH_TARGET_SIZE_CLASS)
  })

  it('Confirm and Cancel buttons use inline-flex centering for proper tap alignment', async () => {
    const confirmGroup = await openEmptyAllConfirmation()
    const confirmBtn = within(confirmGroup).getByRole('button', { name: /^Confirm$/i })
    const cancelBtn = within(confirmGroup).getByRole('button', { name: /^Cancel$/i })

    expect(confirmBtn).toHaveClass('inline-flex', 'items-center', 'justify-center')
    expect(cancelBtn).toHaveClass('inline-flex', 'items-center', 'justify-center')
  })

  it('uses TOUCH_TARGET_SIZE_CLASS constant (not hardcoded values)', async () => {
    const confirmGroup = await openEmptyAllConfirmation()
    const confirmBtn = within(confirmGroup).getByRole('button', { name: /^Confirm$/i })

    expectClassList(confirmBtn, TOUCH_TARGET_SIZE_CLASS)
  })
})
