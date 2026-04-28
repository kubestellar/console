/**
 * useFeedbackDrafts — manages multiple draft bug reports / feature requests
 * in localStorage so users can save work-in-progress and return later.
 *
 * Each draft is stored as a JSON entry under DRAFTS_STORAGE_KEY.
 * Drafts include the request type, target repo, description text, and a
 * human-readable title extracted from the first line of the description.
 */

import { useState, useEffect } from 'react'
import type { RequestType, TargetRepo } from './useFeatureRequests'

/** localStorage key for the drafts array */
const DRAFTS_STORAGE_KEY = 'feedback-drafts'

/** Maximum number of drafts a user can store */
const MAX_DRAFTS = 20

/** Minimum description length to allow saving a draft (chars) */
const MIN_DRAFT_LENGTH = 5

/** Characters to show in a truncated preview */
const PREVIEW_TRUNCATE_LENGTH = 120

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
function saveDrafts(drafts: FeedbackDraft[]): void {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // localStorage full or unavailable — silently fail
  }
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
  const [drafts, setDrafts] = useState<FeedbackDraft[]>(() => loadDrafts())

  // Keep in-memory state in sync if another tab modifies localStorage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === DRAFTS_STORAGE_KEY) {
        setDrafts(loadDrafts())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
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

    // Compute the new drafts array from the current state snapshot
    const prev = loadDrafts()
    let updated: FeedbackDraft[]
    let newId: string | null = existingId || null

    if (existingId) {
      // Update existing draft
      updated = prev.map(d =>
        d.id === existingId
          ? { ...d, ...draft, updatedAt: new Date().toISOString() }
          : d
      )
    } else {
      // Create new draft
      if (prev.length >= MAX_DRAFTS) {
        // Drop the oldest draft to make room
        updated = prev.slice(1)
      } else {
        updated = [...prev]
      }
      const newDraft: FeedbackDraft = {
        id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        ...draft,
        savedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString() }
      updated.push(newDraft)
      newId = newDraft.id
    }

    // Persist to localStorage BEFORE updating React state
    saveDrafts(updated)
    setDrafts(updated)

    return newId
  }

  /** Delete a draft by id */
  const deleteDraft = (id: string) => {
    const prev = loadDrafts()
    const updated = prev.filter(d => d.id !== id)
    // Persist to localStorage BEFORE updating React state
    saveDrafts(updated)
    setDrafts(updated)
  }

  /** Delete all drafts */
  const clearAllDrafts = () => {
    saveDrafts([])
    setDrafts([])
  }

  return {
    drafts,
    draftCount: drafts.length,
    saveDraft,
    deleteDraft,
    clearAllDrafts,
    MAX_DRAFTS,
    MIN_DRAFT_LENGTH }
}
