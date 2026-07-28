import { useState, useCallback } from 'react'
import type { GPUReservation } from '../../hooks/useGPUReservations'

interface UseGPUReservationFormOptions {
  allReservations: GPUReservation[]
  onDelete: (id: string) => Promise<void>
  onShowToast: (msg: string, type: 'success' | 'error') => void
}

export function useGPUReservationForm({
  allReservations,
  onDelete,
  onShowToast,
}: UseGPUReservationFormOptions) {
  const [showReservationForm, setShowReservationForm] = useState(false)
  const [editingReservation, setEditingReservation] = useState<GPUReservation | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [prefillDate, setPrefillDate] = useState<string | null>(null)

  const handleDeleteReservation = async () => {
    if (!deleteConfirmId) return
    setIsDeleting(true)
    try {
      await onDelete(deleteConfirmId)
      onShowToast('GPU reservation deleted', 'success')
    } catch (err: unknown) {
      onShowToast(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setIsDeleting(false)
      setDeleteConfirmId(null)
    }
  }

  const openCreateForm = useCallback(() => {
    setEditingReservation(null)
    setShowReservationForm(true)
  }, [])

  const openEditForm = useCallback((r: GPUReservation) => {
    setEditingReservation(r)
    setShowReservationForm(true)
  }, [])

  const closeReservationForm = useCallback(() => {
    setShowReservationForm(false)
    setEditingReservation(null)
    setPrefillDate(null)
  }, [])

  const openCreateFormForDate = useCallback((dateStr: string) => {
    setPrefillDate(dateStr)
    setEditingReservation(null)
    setShowReservationForm(true)
  }, [])

  const deleteConfirmReservation = deleteConfirmId
    ? allReservations.find(r => r.id === deleteConfirmId)
    : null

  return {
    showReservationForm,
    editingReservation,
    deleteConfirmId,
    isDeleting,
    prefillDate,
    deleteConfirmReservation,
    setDeleteConfirmId,
    handleDeleteReservation,
    openCreateForm,
    openEditForm,
    closeReservationForm,
    openCreateFormForDate,
  }
}
