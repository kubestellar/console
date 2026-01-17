import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface DashboardContextType {
  // Add Card Modal state
  isAddCardModalOpen: boolean
  openAddCardModal: () => void
  closeAddCardModal: () => void

  // Templates Modal state (also can be triggered from sidebar)
  isTemplatesModalOpen: boolean
  openTemplatesModal: () => void
  closeTemplatesModal: () => void
}

const DashboardContext = createContext<DashboardContextType | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false)
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false)

  const openAddCardModal = useCallback(() => {
    setIsAddCardModalOpen(true)
  }, [])

  const closeAddCardModal = useCallback(() => {
    setIsAddCardModalOpen(false)
  }, [])

  const openTemplatesModal = useCallback(() => {
    setIsTemplatesModalOpen(true)
  }, [])

  const closeTemplatesModal = useCallback(() => {
    setIsTemplatesModalOpen(false)
  }, [])

  return (
    <DashboardContext.Provider
      value={{
        isAddCardModalOpen,
        openAddCardModal,
        closeAddCardModal,
        isTemplatesModalOpen,
        openTemplatesModal,
        closeTemplatesModal,
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
