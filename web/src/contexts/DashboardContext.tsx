import { useState, useCallback, useMemo, type ReactNode } from 'react'
import { useDashboardHealth, type DashboardHealthInfo } from '../hooks/useDashboardHealth'
import { createStateContext } from './createStateContext'

/**
 * Dashboard Context
 *
 * Category: transient UI state.
 * Coordinates Console Studio modal visibility and cross-route restore state.
 */

/** Valid initial sections for Console Studio */
export type StudioInitialSection = 'cards' | 'dashboards' | 'collections' | 'widgets'

// Card to be restored from history
export interface PendingRestoreCard {
  cardType: string
  cardTitle?: string
  config: Record<string, unknown>
  dashboardId?: string
}

interface DashboardContextType {
  // Add Card Modal state
  isAddCardModalOpen: boolean
  openAddCardModal: (section?: StudioInitialSection, widgetCardType?: string) => void
  closeAddCardModal: () => void

  /** Which section Console Studio should open to */
  studioInitialSection: StudioInitialSection | undefined
  /** Pre-selected widget card type (when opening Studio from card menu "Export as Widget") */
  studioWidgetCardType: string | undefined

  // Pending open flag - for triggering modal after navigation
  pendingOpenAddCardModal: boolean
  setPendingOpenAddCardModal: (pending: boolean) => void

  // Templates Modal state (also can be triggered from sidebar)
  isTemplatesModalOpen: boolean
  openTemplatesModal: () => void
  closeTemplatesModal: () => void

  // Card restoration from history
  pendingRestoreCard: PendingRestoreCard | null
  setPendingRestoreCard: (card: PendingRestoreCard | null) => void
  clearPendingRestoreCard: () => void

  // Aggregated health status
  health: DashboardHealthInfo
}

const {
  Context: DashboardContext,
  useRequiredStateContext: useDashboardContext,
  useOptionalStateContext: useDashboardContextOptional,
} = createStateContext<DashboardContextType>({ name: 'Dashboard' })

export { DashboardContext, useDashboardContext, useDashboardContextOptional }

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false)
  const [studioInitialSection, setStudioInitialSection] = useState<StudioInitialSection | undefined>(undefined)
  const [studioWidgetCardType, setStudioWidgetCardType] = useState<string | undefined>(undefined)
  const [pendingOpenAddCardModal, setPendingOpenAddCardModalState] = useState(false)
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false)
  const [pendingRestoreCard, setPendingRestoreCardState] = useState<PendingRestoreCard | null>(null)

  const health = useDashboardHealth()

  const openAddCardModal = useCallback((section?: StudioInitialSection, widgetCardType?: string) => {
    setStudioInitialSection(section)
    setStudioWidgetCardType(widgetCardType)
    setIsAddCardModalOpen(true)
  }, [])

  const closeAddCardModal = useCallback(() => {
    setIsAddCardModalOpen(false)
    setStudioInitialSection(undefined)
    setStudioWidgetCardType(undefined)
  }, [])

  const setPendingOpenAddCardModal = useCallback((pending: boolean) => {
    setPendingOpenAddCardModalState(pending)
  }, [])

  const openTemplatesModal = useCallback(() => {
    setIsTemplatesModalOpen(true)
  }, [])

  const closeTemplatesModal = useCallback(() => {
    setIsTemplatesModalOpen(false)
  }, [])

  const setPendingRestoreCard = useCallback((card: PendingRestoreCard | null) => {
    setPendingRestoreCardState(card)
  }, [])

  const clearPendingRestoreCard = useCallback(() => {
    setPendingRestoreCardState(null)
  }, [])

  const value = useMemo(() => ({
    isAddCardModalOpen,
    openAddCardModal,
    closeAddCardModal,
    studioInitialSection,
    studioWidgetCardType,
    pendingOpenAddCardModal,
    setPendingOpenAddCardModal,
    isTemplatesModalOpen,
    openTemplatesModal,
    closeTemplatesModal,
    pendingRestoreCard,
    setPendingRestoreCard,
    clearPendingRestoreCard,
    health,
  }), [
    isAddCardModalOpen,
    openAddCardModal,
    closeAddCardModal,
    studioInitialSection,
    studioWidgetCardType,
    pendingOpenAddCardModal,
    setPendingOpenAddCardModal,
    isTemplatesModalOpen,
    openTemplatesModal,
    closeTemplatesModal,
    pendingRestoreCard,
    setPendingRestoreCard,
    clearPendingRestoreCard,
    health,
  ])

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  )
}
