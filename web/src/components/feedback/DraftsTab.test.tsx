import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DraftsTab } from './DraftsTab'

describe('DraftsTab', () => {
  it('renders saved drafts content', () => {
    render(
      <DraftsTab
        drafts={[
          {
            id: 'draft-1',
            requestType: 'feature',
            targetRepo: 'console',
            description: 'Improve touch targets\nAdd larger buttons for mobile.',
            savedAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ]}
        draftCount={1}
        recentlyDeletedDrafts={[]}
        recentlyDeletedCount={0}
        editingDraftId={null}
        confirmDeleteDraft={null}
        showClearAllDrafts={false}
        onSetActiveTab={vi.fn()}
        onRestoreDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
        onPermanentlyDeleteDraft={vi.fn()}
        onRestoreDeletedDraft={vi.fn()}
        onEmptyRecentlyDeleted={vi.fn()}
        onSetConfirmDeleteDraft={vi.fn()}
        onSetShowClearAllDrafts={vi.fn()}
        onClearAllDrafts={vi.fn()}
        showToast={vi.fn()}
      />
    )

    expect(screen.getByText(/drafts\.savedDrafts/i)).toBeInTheDocument()
    expect(screen.getByText(/Improve touch targets/)).toBeInTheDocument()
  })
})
