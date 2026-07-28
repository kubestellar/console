import { useState, useRef, useCallback } from 'react'
import type { RequestType } from '../../hooks/useFeatureRequests'
import type { TabType, SuccessState } from './FeatureRequestTypes'

interface UseFeatureRequestCloseProps {
  initialTab?: TabType
  initialRequestType?: RequestType
  onClose: () => void
  isSubmitting: boolean
  hasUnsavedSubmitContent: boolean
  success: SuccessState | null
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  handleSaveDraft: () => boolean
  resetForm: (opts: { initialRequestType?: RequestType }) => void
}

export interface FeatureRequestCloseHandlers {
  showDiscardConfirm: boolean
  setShowDiscardConfirm: (v: boolean) => void
  pendingTabSwitch: TabType | null
  setPendingTabSwitch: (tab: TabType | null) => void
  handleClose: () => void
  forceClose: () => void
  handleSaveAndClose: () => void
  handleTabChange: (nextTab: TabType) => void
  handleDiscardAndSwitchTab: () => void
  handleSaveDraftAndSwitchTab: () => void
}

export function useFeatureRequestClose({
  initialTab,
  initialRequestType,
  onClose,
  isSubmitting,
  hasUnsavedSubmitContent,
  success,
  activeTab,
  setActiveTab,
  handleSaveDraft,
  resetForm,
}: UseFeatureRequestCloseProps): FeatureRequestCloseHandlers {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [pendingTabSwitch, setPendingTabSwitch] = useState<TabType | null>(null)

  // Stable refs so callbacks don't depend on every prop change, avoiding
  // excessive re-registration of keydown listeners in BaseModal.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const isSubmittingRef = useRef(isSubmitting)
  isSubmittingRef.current = isSubmitting
  const showDiscardRef = useRef(showDiscardConfirm)
  showDiscardRef.current = showDiscardConfirm
  const pendingTabSwitchRef = useRef(pendingTabSwitch)
  pendingTabSwitchRef.current = pendingTabSwitch
  const hasUnsavedSubmitContentRef = useRef(hasUnsavedSubmitContent)
  hasUnsavedSubmitContentRef.current = hasUnsavedSubmitContent
  const successRef = useRef(success)
  successRef.current = success

  const forceClose = useCallback(() => {
    // Reset dialog flags first so a stale ref can't re-open them.
    setShowDiscardConfirm(false)
    setPendingTabSwitch(null)
    resetForm({ initialRequestType })
    setActiveTab(initialTab || 'submit')
    onCloseRef.current()
  }, [initialRequestType, initialTab, resetForm, setActiveTab])

  const handleSaveAndClose = useCallback(() => {
    if (handleSaveDraft()) {
      forceClose()
    }
  }, [handleSaveDraft, forceClose])

  const handleClose = useCallback(() => {
    if (isSubmittingRef.current) return
    if (pendingTabSwitchRef.current) {
      setPendingTabSwitch(null)
      return
    }
    // If the discard dialog is already visible, a second close attempt (Esc)
    // should act as Discard rather than reopening the same dialog.
    if (showDiscardRef.current) {
      forceClose()
      return
    }
    // Issue 9358: after a successful submission the content has been filed as
    // a GitHub issue — it is not "unsaved". Close without prompting.
    if (successRef.current) {
      forceClose()
      return
    }
    if (hasUnsavedSubmitContentRef.current) {
      setShowDiscardConfirm(true)
      return
    }
    forceClose()
  }, [forceClose])

  const handleTabChange = useCallback((nextTab: TabType) => {
    if (nextTab === activeTab) return
    if (activeTab === 'submit' && nextTab !== 'submit' && hasUnsavedSubmitContent) {
      setPendingTabSwitch(nextTab)
      return
    }
    setActiveTab(nextTab)
  }, [activeTab, hasUnsavedSubmitContent, setActiveTab])

  const handleDiscardAndSwitchTab = useCallback(() => {
    if (!pendingTabSwitch) return
    setPendingTabSwitch(null)
    setActiveTab(pendingTabSwitch)
  }, [pendingTabSwitch, setActiveTab])

  const handleSaveDraftAndSwitchTab = useCallback(() => {
    if (!pendingTabSwitch) return
    if (handleSaveDraft()) {
      setPendingTabSwitch(null)
      setActiveTab(pendingTabSwitch)
    }
  }, [handleSaveDraft, pendingTabSwitch, setActiveTab])

  return {
    showDiscardConfirm, setShowDiscardConfirm,
    pendingTabSwitch, setPendingTabSwitch,
    handleClose,
    forceClose,
    handleSaveAndClose,
    handleTabChange,
    handleDiscardAndSwitchTab,
    handleSaveDraftAndSwitchTab,
  }
}
