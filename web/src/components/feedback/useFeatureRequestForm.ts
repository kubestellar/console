import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'
import { useFeedbackDrafts } from '../../hooks/useFeedbackDrafts'
import type { FeedbackDraft } from '../../hooks/useFeedbackDrafts'
import type { RequestType, TargetRepo } from '../../hooks/useFeatureRequests'
import {
  MIN_DRAFT_LENGTH,
  SUCCESS_DISPLAY_MS,
  EMPTY_FILE_SIZE_BYTES,
} from './FeatureRequestTypes'
import type { TabType, ScreenshotItem, SuccessState } from './FeatureRequestTypes'

// ── Draft restoration helpers ─────────────────────────────────────────────────

const DRAFT_ATTACHMENT_INDEX_OFFSET = 1
const FIRST_CHARACTER_INDEX = 0
const DATA_URI_PART_LIMIT = 2
const DATA_URI_PREFIX = 'data:'
const DATA_URI_BASE64_MARKER = ';base64'
const DEFAULT_DRAFT_ATTACHMENT_MIME_TYPE = 'image/png'
const DEFAULT_DRAFT_ATTACHMENT_EXTENSION = 'png'

function getDraftAttachmentMediaType(mimeType: string): ScreenshotItem['mediaType'] {
  return mimeType.startsWith('video/') ? 'video' : 'image'
}

function getDraftAttachmentFilename(index: number, mimeType: string): string {
  const extension = mimeType.split('/').pop() || DEFAULT_DRAFT_ATTACHMENT_EXTENSION
  return `draft-screenshot-${index + DRAFT_ATTACHMENT_INDEX_OFFSET}.${extension}`
}

function createEmptyDraftAttachment(index: number, mimeType: string): File {
  return new File([], getDraftAttachmentFilename(index, mimeType), { type: mimeType })
}

function restoreDraftAttachment(preview: string, index: number): ScreenshotItem {
  if (!preview.startsWith(DATA_URI_PREFIX)) {
    return {
      file: createEmptyDraftAttachment(index, DEFAULT_DRAFT_ATTACHMENT_MIME_TYPE),
      preview,
      mediaType: 'image',
    }
  }

  const [header, encodedBody] = preview.split(',', DATA_URI_PART_LIMIT)
  const mimeType = header.match(/:(.*?)(;|$)/)?.[1] || DEFAULT_DRAFT_ATTACHMENT_MIME_TYPE
  const mediaType = getDraftAttachmentMediaType(mimeType)

  if (!header.includes(DATA_URI_BASE64_MARKER) || !encodedBody) {
    return { file: createEmptyDraftAttachment(index, mimeType), preview, mediaType }
  }

  try {
    const binary = atob(encodedBody)
    const bytes = Uint8Array.from(binary, char => char.codePointAt(FIRST_CHARACTER_INDEX) ?? EMPTY_FILE_SIZE_BYTES)
    return {
      file: new File([bytes], getDraftAttachmentFilename(index, mimeType), { type: mimeType }),
      preview,
      mediaType,
    }
  } catch {
    return { file: createEmptyDraftAttachment(index, mimeType), preview, mediaType }
  }
}

// ── Hook interface ────────────────────────────────────────────────────────────

export interface FeatureRequestFormState {
  // Form fields
  requestType: RequestType
  setRequestType: (v: RequestType) => void
  targetRepo: TargetRepo
  setTargetRepo: (v: TargetRepo) => void
  description: string
  setDescription: (v: string) => void
  error: string | null
  setError: (v: string | null) => void
  success: SuccessState | null
  setSuccess: (v: SuccessState | null) => void
  screenshots: ScreenshotItem[]
  setScreenshots: (v: ScreenshotItem[]) => void
  isPreviewFullscreen: boolean
  setIsPreviewFullscreen: (v: boolean) => void
  previewImageSrc: string | null
  setPreviewImageSrc: (v: string | null) => void
  editingDraftId: string | null
  setEditingDraftId: (v: string | null) => void
  hasUnsavedSubmitContent: boolean
  // Draft state (for DraftsTab)
  drafts: FeedbackDraft[]
  draftCount: number
  recentlyDeletedDrafts: FeedbackDraft[]
  recentlyDeletedCount: number
  confirmDeleteDraft: string | null
  setConfirmDeleteDraft: (v: string | null) => void
  showClearAllDrafts: boolean
  setShowClearAllDrafts: (v: boolean) => void
  permanentlyDeleteDraft: (id: string) => void
  restoreDeletedDraft: (id: string) => void
  clearAllDrafts: () => void
  emptyRecentlyDeleted: () => void
  showToast: ReturnType<typeof useToast>['showToast']
  // Handlers
  handleSaveDraft: () => boolean
  handleRestoreDraft: (draft: FeedbackDraft) => void
  handleDeleteDraft: (id: string) => void
  handleSubmitSuccess: (result: SuccessState) => void
  resetForm: (opts: { initialRequestType?: RequestType }) => void
}

interface UseFeatureRequestFormProps {
  isOpen: boolean
  initialRequestType?: RequestType
  initialContext?: { cardTitle: string; cardType: string }
  onSetActiveTab: (tab: TabType) => void
  onRefreshRequests: () => void
  onRefreshNotifications: () => void
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFeatureRequestForm({
  isOpen,
  initialRequestType,
  initialContext,
  onSetActiveTab,
  onRefreshRequests,
  onRefreshNotifications,
}: UseFeatureRequestFormProps): FeatureRequestFormState {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const {
    drafts, draftCount, recentlyDeletedDrafts, recentlyDeletedCount,
    saveDraft, deleteDraft, permanentlyDeleteDraft, restoreDeletedDraft,
    clearAllDrafts, emptyRecentlyDeleted,
  } = useFeedbackDrafts()

  // Form fields
  const [requestType, setRequestType] = useState<RequestType>(initialRequestType || 'bug')
  const [targetRepo, setTargetRepo] = useState<TargetRepo>('console')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([])
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false)
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState<string | null>(null)
  const [showClearAllDrafts, setShowClearAllDrafts] = useState(false)

  // Sync requestType when modal opens with a new initialRequestType
  useEffect(() => {
    if (isOpen && initialRequestType) {
      setRequestType(initialRequestType)
    }
  }, [isOpen, initialRequestType])

  // Pre-fill description when opened from a card's bug button (only once on open)
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current && initialContext) {
      const bugExample = `Card: ${initialContext.cardTitle} (${initialContext.cardType})\n\nDescribe the bug:\n`
      setDescription(bugExample)
      setRequestType('bug')
    }
    prevOpenRef.current = isOpen
  }, [isOpen, initialContext])

  // Clear the success display timeout when the component unmounts
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

  const hasUnsavedSubmitContent = !success && (description.trim() !== '' || screenshots.length > 0)

  const handleSaveDraft = useCallback((): boolean => {
    if (description.trim().length < MIN_DRAFT_LENGTH) {
      showToast('Draft is too short to save', 'error')
      return false
    }
    const screenshotDataURIs = screenshots.map(s => s.preview)
    const id = saveDraft(
      { requestType, targetRepo, description, screenshots: screenshotDataURIs },
      editingDraftId || undefined,
    )
    if (id) {
      setEditingDraftId(id)
      showToast(editingDraftId ? 'Draft updated' : 'Draft saved', 'success')
      return true
    }
    return false
  }, [description, screenshots, requestType, targetRepo, editingDraftId, saveDraft, showToast])

  const handleRestoreDraft = useCallback((draft: FeedbackDraft) => {
    setRequestType(draft.requestType)
    setTargetRepo(draft.targetRepo)
    setDescription(draft.description)
    setEditingDraftId(draft.id)
    const restoredScreenshots = (draft.screenshots || []).map(restoreDraftAttachment)
    const invalidCount = restoredScreenshots.filter(({ file }) => file.size === EMPTY_FILE_SIZE_BYTES).length
    setScreenshots(restoredScreenshots)
    onSetActiveTab('submit')
    showToast(
      invalidCount > EMPTY_FILE_SIZE_BYTES
        ? t('drafts.restoreRequiresReattach', 'Draft loaded, but one or more attachments must be re-attached before submitting')
        : t('drafts.loadedIntoEditor', 'Draft loaded into editor'),
      invalidCount > EMPTY_FILE_SIZE_BYTES ? 'error' : 'success',
    )
  }, [onSetActiveTab, showToast, t])

  const handleDeleteDraft = useCallback((id: string) => {
    deleteDraft(id)
    if (editingDraftId === id) {
      setEditingDraftId(null)
    }
    setConfirmDeleteDraft(null)
    showToast('Draft deleted', 'success')
  }, [deleteDraft, editingDraftId, showToast])

  const handleSubmitSuccess = useCallback((result: SuccessState) => {
    setSuccess(result)
    if (editingDraftId) {
      deleteDraft(editingDraftId)
      setEditingDraftId(null)
    }
    successTimeoutRef.current = setTimeout(() => {
      successTimeoutRef.current = null
      setDescription('')
      setRequestType('bug')
      setTargetRepo('console')
      setSuccess(null)
      setScreenshots([])
      onSetActiveTab('updates')
      onRefreshRequests()
      onRefreshNotifications()
    }, SUCCESS_DISPLAY_MS)
  }, [editingDraftId, deleteDraft, onSetActiveTab, onRefreshRequests, onRefreshNotifications])

  const resetForm = useCallback((opts: { initialRequestType?: RequestType }) => {
    setDescription('')
    setRequestType(opts.initialRequestType || 'bug')
    setTargetRepo('console')
    setError(null)
    setSuccess(null)
    setScreenshots([])
    setEditingDraftId(null)
  }, [])

  return {
    requestType, setRequestType,
    targetRepo, setTargetRepo,
    description, setDescription,
    error, setError,
    success, setSuccess,
    screenshots, setScreenshots,
    isPreviewFullscreen, setIsPreviewFullscreen,
    previewImageSrc, setPreviewImageSrc,
    editingDraftId, setEditingDraftId,
    hasUnsavedSubmitContent,
    drafts, draftCount,
    recentlyDeletedDrafts, recentlyDeletedCount,
    confirmDeleteDraft, setConfirmDeleteDraft,
    showClearAllDrafts, setShowClearAllDrafts,
    permanentlyDeleteDraft, restoreDeletedDraft,
    clearAllDrafts, emptyRecentlyDeleted,
    showToast,
    handleSaveDraft,
    handleRestoreDraft,
    handleDeleteDraft,
    handleSubmitSuccess,
    resetForm,
  }
}
