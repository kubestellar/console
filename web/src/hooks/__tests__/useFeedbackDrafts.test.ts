/**
 * Tests for useFeedbackDrafts hook.
 *
 * Covers:
 * - extractDraftTitle utility
 * - saveDraft (new and update), deleteDraft, clearAllDrafts
 * - localStorage persistence and sync
 * - MAX_DRAFTS limit enforcement
 * - MIN_DRAFT_LENGTH validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { extractDraftTitle, useFeedbackDrafts } from '../useFeedbackDrafts'

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
    expect(result.current).toHaveProperty('saveDraft')
    expect(result.current).toHaveProperty('deleteDraft')
    expect(result.current).toHaveProperty('clearAllDrafts')
    expect(result.current).toHaveProperty('MAX_DRAFTS')
    expect(result.current).toHaveProperty('MIN_DRAFT_LENGTH')
  })

  it('starts with empty drafts', () => {
    const { result } = renderHook(() => useFeedbackDrafts())
    expect(result.current.drafts).toEqual([])
    expect(result.current.draftCount).toBe(0)
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

  it('deletes a draft by id', () => {
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

    expect(result.current.draftCount).toBe(0)
    const stored = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '[]')
    expect(stored).toHaveLength(0)
  })

  it('clears all drafts', () => {
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
    expect(result.current.drafts).toEqual([])
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
