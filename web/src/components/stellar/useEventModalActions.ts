import { useState, useEffect } from 'react'
import type { StellarNotification } from '../../types/stellar'
import { useStellar } from '../../hooks/useStellar'
import { useToast } from '../ui/Toast'
import { copyToClipboard } from '../../lib/clipboard'
import { getErrorMessage } from './EventModal.utils'

type ModalView = 'overview' | 'investigate'
type ConfirmAction = 'resolve' | 'dismiss' | null

interface UseEventModalActionsOptions {
  liveNotification: StellarNotification
  investigationCopyText: string
  onClose: () => void
}

export function useEventModalActions({
  liveNotification,
  investigationCopyText,
  onClose,
}: UseEventModalActionsOptions) {
  const {
    activity,
    investigateNotification,
    dismissNotification,
    startSolve,
  } = useStellar()
  const { showToast } = useToast()

  const [view, setView] = useState<ModalView>('overview')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [investigationSummary, setInvestigationSummary] = useState(liveNotification.investigationSummary || '')
  const [dismissalReason, setDismissalReason] = useState(liveNotification.dismissalReason || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setView('overview')
    setConfirmAction(null)
    setInvestigationSummary(liveNotification.investigationSummary || '')
    setDismissalReason(liveNotification.dismissalReason || '')
  }, [liveNotification.id, liveNotification.dismissalReason, liveNotification.investigationSummary])

  const handleCopyDetails = async () => {
    const copied = await copyToClipboard(investigationCopyText)
    showToast(copied ? 'Investigation details copied' : 'Failed to copy investigation details', copied ? 'success' : 'error')
  }

  const handleMarkInvestigating = async () => {
    setIsSubmitting(true)
    try {
      await investigateNotification(liveNotification.id, investigationSummary.trim() || undefined)
      showToast('Event marked as investigating', 'info')
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to mark event as investigating'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResolve = async () => {
    setIsSubmitting(true)
    try {
      await startSolve(liveNotification.id)
      showToast('Attempt started in AI mission', 'success')
      onClose()
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to start AI mission'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDismiss = async () => {
    setIsSubmitting(true)
    try {
      await dismissNotification(liveNotification.id, dismissalReason.trim() || undefined)
      showToast('Event removed from escalated list', 'success')
      onClose()
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to remove event'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    activity,
    view,
    setView,
    confirmAction,
    setConfirmAction,
    investigationSummary,
    setInvestigationSummary,
    dismissalReason,
    setDismissalReason,
    isSubmitting,
    handleCopyDetails,
    handleMarkInvestigating,
    handleResolve,
    handleDismiss,
  }
}
