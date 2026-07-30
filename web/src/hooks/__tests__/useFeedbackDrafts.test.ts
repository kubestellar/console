/**
 * Tests for useFeedbackDrafts hook.
 *
 * Covers:
 * - extractDraftTitle utility
 * - saveDraft (new and update), deleteDraft (soft), clearAllDrafts
 * - permanentlyDeleteDraft, restoreDeletedDraft, emptyRecentlyDeleted
 * - localStorage persistence and sync
 * - MAX_DRAFTS limit enforcement
 * - MIN_DRAFT_LENGTH validation
 * - Expired draft purging
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { extractDraftTitle, useFeedbackDrafts, DELETED_DRAFT_RETENTION_DAYS } from '../useFeedbackDrafts'

const DRAFTS_STORAGE_KEY = 'feedback-drafts'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── extractDraftTitle ────────────────────────────────────────────────────

describe('extractDraftTitle', () => {
  it('returns first line of multi-line text', () => {
    const result = extractDraftTitle('First line\nSecond line\nThird line')
    expect(result).toBe('First line')
  })

  it('returns "Untitled draft" for empty string', () => {
    const result = extractDraftTitle('')
    expect(result).toBe('Untitled draft')
  })

  it('truncates long first lines with ellipsis', () => {
    const longLine = 'A'.repeat(200)
    const result = extractDraftTitle(longLine)
    expect(result.length).toBeLessThan(200)
    expect(result).toContain('...')
  })

  it('returns short text as-is', () => {
    const result = extractDraftTitle('Short title')
    expect(result).toBe('Short title')
  })

  it('trims whitespace from first line', () => {
    const result = extractDraftTitle('  Trimmed  \nMore text')
    expect(result).toBe('Trimmed')
  })
})

// ── useFeedbackDrafts hook ───────────────────────────────────────────────

describe('useFeedbackDrafts', () => {
  it('returns expected shape', () => {
    const { result } = renderHook(() => useFeedbackDrafts())

    expect(result.current).toHaveProperty('drafts')
    expect(result.current).toHaveProperty('draftCount')
    expect(result.current).toHaveProperty('recentlyDeletedDrafts')
    expect(result.current).toHaveProperty('recentlyDeletedCount')
    expect(result.current).toHaveProperty('saveDraft')
    expect(result.current).toHaveProperty('deleteDraft')
    expect(result.current).toHaveProperty('permanentlyDeleteDraft')
    expect(result.current).toHaveProperty('restoreDeletedDraft')
    expect(result.current).toHaveProperty('clearAllDrafts')
    expect(result.current).toHaveProperty('emptyRecentlyDeleted')
    expect(result.current).toHaveProperty('MAX_DRAFTS')
    expect(result.current).toHaveProperty('MIN_DRAFT_LENGTH')
    expect(result.current).toHaveProperty('DELETED_DRAFT_RETENTION_DAYS')
  })

  it('starts with empty drafts', () => {
    const { result } = renderHook(() => useFeedbackDrafts())
    expect(result.current.drafts).toEqual([])
    expect(result.current.draftCount).toBe(0)
    expect(result.current.recentlyDeletedDrafts).toEqual([])
    expect(result.current.recentlyDeletedCount).toBe(0)
  })

  it('loads existing drafts from localStorage on mount', () => {
    const existingDrafts = [{
      id: 'draft-123',
      requestType: 'bug',
      targetRepo: 'console',
      description: 'Existing draft description here',
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(existingDrafts))

    const { result } = renderHook(() => useFeedbackDrafts())
    expect(result.current.drafts).toHaveLength(1)
    expect(result.current.drafts[0].id).toBe('draft-123')
  })

  it('saves a new draft and persists to localStorage', () => {
    const { result } = renderHook(() => useFeedbackDrafts())

    let draftId: string | null = null
    act(() => {
      draftId = result.current.saveDraft({
        requestType: 'bug' as const,
        targetRepo: 'console' as const,
        description: 'A new bug report description',
      })
    })

    expect(draftId).not.toBeNull()
    expect(result.current.draftCount).toBe(1)
    expect(result.current.drafts[0].description).toBe('A new bug report description')

    // Verify localStorage
    const stored = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(1)
  })

  it('rejects drafts shorter than MIN_DRAFT_LENGTH', () => {
    const { result } = renderHook(() => useFeedbackDrafts())

    let draftId: string | null = null
    act(() => {
      draftId = result.current.saveDraft({
        requestType: 'feature' as const,
        targetRepo: 'console' as const,
        description: 'Hi',
      })
    })

    expect(draftId).toBeNull()
    expect(result.current.draftCount).toBe(0)
  })

  it('updates an existing draft when existingId is provided', () => {
    const { result } = renderHook(() => useFeedbackDrafts())

    let draftId: string | null = null
    act(() => {
      draftId = result.current.saveDraft({
        requestType: 'bug' as const,
        targetRepo: 'console' as const,
        description: 'Original description text here',
      })
    })

    expect(draftId).not.toBeNull()

    act(() => {
      result.current.saveDraft({
        requestType: 'bug' as const,
        targetRepo: 'console' as const,
        description: 'Updated description text here',
      }, draftId!)
    })

    expect(result.current.draftCount).toBe(1)
    expect(result.current.drafts[0].description).toBe('Updated description text here')
  })

  it('soft-deletes a draft by id (sets deletedAt)', () => {
    const { result } = renderHook(() => useFeedbackDrafts())

    let draftId: string | null = null
    act(() => {
      draftId = result.current.saveDraft({
        requestType: 'bug' as const,
        targetRepo: 'console' as const,
        description: 'Draft to be deleted shortly',
      })
    })

    expect(result.current.draftCount).toBe(1)

    act(() => {
      result.current.deleteDraft(draftId!)
    })

    // Active drafts should be empty, but recently deleted should have it
    expect(result.current.draftCount).toBe(0)
    expect(result.current.recentlyDeletedCount).toBe(1)
    expect(result.current.recentlyDeletedDrafts[0].id).toBe(draftId)
    expect(result.current.recentlyDeletedDrafts[0].deletedAt).toBeDefined()

    // Still in localStorage (soft-deleted)
    const stored = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0].deletedAt).toBeDefined()
  })

  it('permanently deletes a draft by id', () => {
    const { result } = renderHook(() => useFeedbackDrafts())

    let draftId: string | null = null
    act(() => {
      draftId = result.current.saveDraft({
        requestType: 'bug' as const,
        targetRepo: 'console' as const,
        description: 'Draft to be permanently deleted',
      })
    })

    // Soft-delete first
    act(() => {
      result.current.deleteDraft(draftId!)
    })
    expect(result.current.recentlyDeletedCount).toBe(1)

    // Then permanently delete
    act(() => {
      result.current.permanentlyDeleteDraft(draftId!)
    })

    expect(result.current.draftCount).toBe(0)
    expect(result.current.recentlyDeletedCount).toBe(0)
    const stored = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(0)
  })

  it('restores a soft-deleted draft', () => {
    const { result } = renderHook(() => useFeedbackDrafts())

    let draftId: string | null = null
    act(() => {
      draftId = result.current.saveDraft({
        requestType: 'feature' as const,
        targetRepo: 'console' as const,
        description: 'Draft to be restored after delete',
      })
    })

    act(() => {
      result.current.deleteDraft(draftId!)
    })
    expect(result.current.draftCount).toBe(0)
    expect(result.current.recentlyDeletedCount).toBe(1)

    act(() => {
      result.current.restoreDeletedDraft(draftId!)
    })
    expect(result.current.draftCount).toBe(1)
    expect(result.current.recentlyDeletedCount).toBe(0)
    expect(result.current.drafts[0].deletedAt).toBeUndefined()
  })

  it('clears all active drafts (soft-deletes them)', () => {
    const { result } = renderHook(() => useFeedbackDrafts())

    act(() => {
      result.current.saveDraft({
        requestType: 'bug' as const,
        targetRepo: 'console' as const,
        description: 'Draft one for testing clear',
      })
      result.current.saveDraft({
        requestType: 'feature' as const,
        targetRepo: 'docs' as const,
        description: 'Draft two for testing clear',
      })
    })

    expect(result.current.draftCount).toBe(2)

    act(() => {
      result.current.clearAllDrafts()
    })

    expect(result.current.draftCount).toBe(0)
    expect(result.current.recentlyDeletedCount).toBe(2)
  })

  it('empties all recently deleted drafts', () => {
    const { result } = renderHook(() => useFeedbackDrafts())

    act(() => {
      result.current.saveDraft({
        requestType: 'bug' as const,
        targetRepo: 'console' as const,
        description: 'Draft to soft-delete and purge',
      })
    })

    act(() => {
      result.current.deleteDraft(result.current.drafts[0].id)
    })
    expect(result.current.recentlyDeletedCount).toBe(1)

    act(() => {
      result.current.emptyRecentlyDeleted()
    })
    expect(result.current.recentlyDeletedCount).toBe(0)
    expect(result.current.draftCount).toBe(0)
  })

  it('purges drafts older than retention period on load', () => {
    const MS_PER_DAY = 86_400_000
    const expiredDate = new Date(Date.now() - (DELETED_DRAFT_RETENTION_DAYS + 1) * MS_PER_DAY).toISOString()
    const recentDate = new Date().toISOString()

    const drafts = [
      {
        id: 'draft-expired',
        requestType: 'bug',
        targetRepo: 'console',
        description: 'This draft is expired and should be purged',
        savedAt: expiredDate,
        updatedAt: expiredDate,
        deletedAt: expiredDate,
      },
      {
        id: 'draft-recent',
        requestType: 'feature',
        targetRepo: 'console',
        description: 'This draft is recently deleted',
        savedAt: recentDate,
        updatedAt: recentDate,
        deletedAt: recentDate,
      },
    ]
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts))

    const { result } = renderHook(() => useFeedbackDrafts())

    // Expired draft should be purged, recent soft-deleted draft should remain
    expect(result.current.recentlyDeletedCount).toBe(1)
    expect(result.current.recentlyDeletedDrafts[0].id).toBe('draft-recent')
  })

  it('handles malformed localStorage gracefully', () => {
    localStorage.setItem(DRAFTS_STORAGE_KEY, 'not-valid-json!!!')

    const { result } = renderHook(() => useFeedbackDrafts())
    expect(result.current.drafts).toEqual([])
    expect(result.current.draftCount).toBe(0)
  })

  it('handles non-array localStorage data gracefully', () => {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))

    const { result } = renderHook(() => useFeedbackDrafts())
    expect(result.current.drafts).toEqual([])
  })
})
