import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

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
  openAddCardModal: () => void
  closeAddCardModal: () => void

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
}

const DashboardContext = createContext<DashboardContextType | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false)
  const [pendingOpenAddCardModal, setPendingOpenAddCardModalState] = useState(false)
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false)
  const [pendingRestoreCard, setPendingRestoreCardState] = useState<PendingRestoreCard | null>(null)

  const openAddCardModal = useCallback(() => {
    setIsAddCardModalOpen(true)
  }, [])

  const closeAddCardModal = useCallback(() => {
    setIsAddCardModalOpen(false)
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
        pendingOpenAddCardModal,
        setPendingOpenAddCardModal,
        isTemplatesModalOpen,
        openTemplatesModal,
        closeTemplatesModal,
        pendingRestoreCard,
        setPendingRestoreCard,
        clearPendingRestoreCard,
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
