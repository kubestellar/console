import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useDashboardHealth, type DashboardHealthInfo } from './useDashboardHealth'

/** Valid initial sections for Console Studio */
export type StudioInitialSection = 'cards' | 'dashboards' | 'collections'

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
  openAddCardModal: (section?: StudioInitialSection) => void
  closeAddCardModal: () => void

  /** Which section Console Studio should open to */
  studioInitialSection: StudioInitialSection | undefined

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

const DashboardContext = createContext<DashboardContextType | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false)
  const [studioInitialSection, setStudioInitialSection] = useState<StudioInitialSection | undefined>(undefined)
  const [pendingOpenAddCardModal, setPendingOpenAddCardModalState] = useState(false)
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false)
  const [pendingRestoreCard, setPendingRestoreCardState] = useState<PendingRestoreCard | null>(null)

  const health = useDashboardHealth()

  const openAddCardModal = useCallback((section?: StudioInitialSection) => {
    setStudioInitialSection(section)
    setIsAddCardModalOpen(true)
  }, [])

  const closeAddCardModal = useCallback(() => {
    setIsAddCardModalOpen(false)
    setStudioInitialSection(undefined)
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

  return (
    <DashboardContext.Provider
      value={{
        isAddCardModalOpen,
        openAddCardModal,
        closeAddCardModal,
        studioInitialSection,
        pendingOpenAddCardModal,
        setPendingOpenAddCardModal,
        isTemplatesModalOpen,
        openTemplatesModal,
        closeTemplatesModal,
        pendingRestoreCard,
        setPendingRestoreCard,
        clearPendingRestoreCard,
        health,
      }}
    >
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboardContext() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboardContext must be used within a DashboardProvider')
  }
  return context
}

// Optional hook that doesn't throw if used outside provider
// Useful for components that might be rendered outside the dashboard
export function useDashboardContextOptional() {
  return useContext(DashboardContext)
}
