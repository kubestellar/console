/**
 * useFeedbackDrafts — manages multiple draft bug reports / feature requests
 * in localStorage so users can save work-in-progress and return later.
 *
 * Each draft is stored as a JSON entry under DRAFTS_STORAGE_KEY.
 * Drafts include the request type, target repo, description text, and a
 * human-readable title extracted from the first line of the description.
 *
 * Deleted drafts are soft-deleted (given a `deletedAt` timestamp) and kept
 * for DELETED_DRAFT_RETENTION_DAYS before being permanently purged.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { RequestType, TargetRepo } from './useFeatureRequests'

/** localStorage key for the drafts array */
const DRAFTS_STORAGE_KEY = 'feedback-drafts'

/** Maximum number of drafts a user can store */
const MAX_DRAFTS = 20

/** Minimum description length to allow saving a draft (chars) */
const MIN_DRAFT_LENGTH = 5

/** Characters to show in a truncated preview */
const PREVIEW_TRUNCATE_LENGTH = 120

/** Number of days to retain soft-deleted drafts before permanent removal */
export const DELETED_DRAFT_RETENTION_DAYS = 30

/** Milliseconds per day — used for retention math */
const MS_PER_DAY = 86_400_000

export interface FeedbackDraft {
  /** Unique identifier (timestamp-based) */
  id: string
  /** Bug or feature */
  requestType: RequestType
  /** Console or docs */
  targetRepo: TargetRepo
  /** Full description text (first line = title) */
  description: string
  /** ISO timestamp of when the draft was saved */
  savedAt: string
  /** ISO timestamp of when the draft was last updated */
  updatedAt: string
  /**
   * Attached screenshots as base64 data URIs so they survive a full
   * reload. We can't put `File`/`Blob` objects in localStorage, but the
   * paste/drop/file-picker flow already yields data URIs via FileReader,
   * so we persist those directly. (#6102)
   */
  screenshots?: string[]
  /** ISO timestamp of when the draft was soft-deleted (undefined = active) */
  deletedAt?: string
}

/** Read drafts from localStorage, returning an empty array on failure */
function loadDrafts(): FeedbackDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as FeedbackDraft[]
  } catch {
    return []
  }
}

/** Persist drafts array to localStorage */
function persistDrafts(drafts: FeedbackDraft[]): void {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/**
 * Remove drafts whose `deletedAt` exceeds the retention window.
 * Returns a new array (or the same reference if nothing was purged).
 */
function purgeExpiredDrafts(drafts: FeedbackDraft[]): FeedbackDraft[] {
  const cutoff = Date.now() - DELETED_DRAFT_RETENTION_DAYS * MS_PER_DAY
  const filtered = drafts.filter(d => {
    if (!d.deletedAt) return true
    return new Date(d.deletedAt).getTime() > cutoff
  })
  return filtered.length === drafts.length ? drafts : filtered
}

/** Extract a short title from the first line of the description */
export function extractDraftTitle(description: string): string {
  const firstLine = description.split('\n')[0]?.trim() || 'Untitled draft'
  if (firstLine.length > PREVIEW_TRUNCATE_LENGTH) {
    return firstLine.substring(0, PREVIEW_TRUNCATE_LENGTH) + '...'
  }
  return firstLine
}

export function useFeedbackDrafts() {
  const [allDrafts, setAllDrafts] = useState<FeedbackDraft[]>(() => {
    const loaded = loadDrafts()
    const purged = purgeExpiredDrafts(loaded)
    if (purged !== loaded) persistDrafts(purged)
    return purged
  })

  // Derived lists
  const drafts = useMemo(() => (allDrafts || []).filter(d => !d.deletedAt), [allDrafts])
  const recentlyDeletedDrafts = useMemo(() => (allDrafts || []).filter(d => !!d.deletedAt), [allDrafts])

  // Keep in-memory state in sync if another tab modifies localStorage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === DRAFTS_STORAGE_KEY) {
        const loaded = loadDrafts()
        const purged = purgeExpiredDrafts(loaded)
        if (purged !== loaded) persistDrafts(purged)
        setAllDrafts(purged)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  /** Helper: persist and update state */
  const commit = useCallback((updated: FeedbackDraft[]) => {
    persistDrafts(updated)
    setAllDrafts(updated)
  }, [])

  /** Save a new draft or update an existing one. Returns the draft id. */
  const saveDraft = (
    draft: {
      requestType: RequestType
      targetRepo: TargetRepo
      description: string
      screenshots?: string[]
    },
    existingId?: string,
  ): string | null => {
    if (draft.description.trim().length < MIN_DRAFT_LENGTH) return null

    const prev = loadDrafts()
    const purged = purgeExpiredDrafts(prev)
    const activePrev = purged.filter(d => !d.deletedAt)
    let updated: FeedbackDraft[]
    let newId: string | null = existingId || null

    if (existingId) {
      updated = purged.map(d =>
        d.id === existingId
          ? { ...d, ...draft, updatedAt: new Date().toISOString() }
          : d
      )
    } else {
      if (activePrev.length >= MAX_DRAFTS) {
        // Drop the oldest active draft to make room
        const oldestActiveId = activePrev[0]?.id
        updated = purged.filter(d => d.id !== oldestActiveId)
      } else {
        updated = [...purged]
      }
      const newDraft: FeedbackDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        ...draft,
        savedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      updated.push(newDraft)
      newId = newDraft.id
    }

    commit(updated)
    return newId
  }

  /** Soft-delete a draft by id (sets deletedAt timestamp) */
  const deleteDraft = (id: string) => {
    const prev = loadDrafts()
    const updated = prev.map(d =>
      d.id === id ? { ...d, deletedAt: new Date().toISOString() } : d
    )
    commit(updated)
  }

  /** Permanently remove a draft by id */
  const permanentlyDeleteDraft = (id: string) => {
    const prev = loadDrafts()
    const updated = prev.filter(d => d.id !== id)
    commit(updated)
  }

  /** Restore a soft-deleted draft (clears deletedAt) */
  const restoreDeletedDraft = (id: string) => {
    const prev = loadDrafts()
    const updated = prev.map(d =>
      d.id === id ? { ...d, deletedAt: undefined } : d
    )
    commit(updated)
  }

  /** Soft-delete all active drafts */
  const clearAllDrafts = () => {
    const prev = loadDrafts()
    const now = new Date().toISOString()
    const updated = prev.map(d =>
      d.deletedAt ? d : { ...d, deletedAt: now }
    )
    commit(updated)
  }

  /** Permanently remove all soft-deleted drafts */
  const emptyRecentlyDeleted = () => {
    const prev = loadDrafts()
    const updated = prev.filter(d => !d.deletedAt)
    commit(updated)
  }

  return {
    drafts,
    draftCount: drafts.length,
    recentlyDeletedDrafts,
    recentlyDeletedCount: recentlyDeletedDrafts.length,
    saveDraft,
    deleteDraft,
    permanentlyDeleteDraft,
    restoreDeletedDraft,
    clearAllDrafts,
    emptyRecentlyDeleted,
    MAX_DRAFTS,
    MIN_DRAFT_LENGTH,
    DELETED_DRAFT_RETENTION_DAYS,
  }
}
