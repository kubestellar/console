import { useEffect } from 'react'
import { safeRemove, safeSetJSON } from '../../lib/safeLocalStorage'

const DRAFT_KEY = 'feedback-modal-draft'

interface DraftState {
  type: 'bug' | 'feature'
  title: string
  description: string
}

interface UseFeedbackDraftOptions {
  type: 'bug' | 'feature'
  title: string
  description: string
  onRestore: (draft: DraftState) => void
}

export function useFeedbackDraft({ type, title, description, onRestore }: UseFeedbackDraftOptions) {
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const draft: DraftState = JSON.parse(saved)
        onRestore(draft)
      }
    } catch {
      // ignore malformed draft
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (title || description) {
      safeSetJSON(DRAFT_KEY, { type, title, description })
    } else {
      safeRemove(DRAFT_KEY)
    }
  }, [type, title, description])
}

export function clearFeedbackDraft() {
  safeRemove(DRAFT_KEY)
}
