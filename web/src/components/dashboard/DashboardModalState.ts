/**
 * DashboardModalState.ts — Modal state management for dashboard.
 * Extracted from DashboardState.ts per issue #19014.
 * Manages configure card modal, widget export modal, and related UI state.
 */
import { useState, useCallback } from 'react'
import { useModalState } from '../../lib/modals'

export function useDashboardModalState() {
  const { isOpen: isConfigureCardOpen, open: openConfigureCard, close: closeConfigureCard } = useModalState()
  const { isOpen: isWidgetExportOpen, open: openWidgetExport, close: closeWidgetExport } = useModalState()

  const [addCardSearch, setAddCardSearch] = useState('')

  const handleCloseConfigureCard = useCallback(() => {
    closeConfigureCard()
  }, [closeConfigureCard])

  const handleCloseWidgetExport = useCallback(() => {
    closeWidgetExport()
  }, [closeWidgetExport])

  const handleCloseCustomizer = useCallback(() => {
    setAddCardSearch('')
  }, [])

  return {
    isConfigureCardOpen,
    openConfigureCard,
    closeConfigureCard,
    handleCloseConfigureCard,
    isWidgetExportOpen,
    openWidgetExport,
    closeWidgetExport,
    handleCloseWidgetExport,
    addCardSearch,
    setAddCardSearch,
    handleCloseCustomizer,
  }
}
