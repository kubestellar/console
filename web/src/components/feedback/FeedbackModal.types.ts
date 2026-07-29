export type FeedbackType = 'bug' | 'feature'

export interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  initialType?: FeedbackType
}

export const DRAFT_KEY = 'feedback-modal-draft'

export interface DraftState {
  type: FeedbackType
  title: string
  description: string
}
