import { createContext, useContext, type KeyboardEvent, type ReactNode } from 'react'
import type { Card } from './dashboardUtils'

export interface DashboardCardActionsContextValue {
  handleConfigureCard: (card: Card) => void
  handleRemoveCard: (cardId: string) => void
  handleWidthChange: (cardId: string, newWidth: number) => void
  handleHeightChange: (cardId: string, newHeight: number) => void
  isRefreshing?: boolean
  triggerRefresh?: () => void
  lastUpdated?: Date | null
  handleGridKeyDown?: (e: KeyboardEvent) => void
  registerCardRef?: (cardId: string, el: HTMLElement | null) => void
  registerExpandTrigger?: (cardId: string, expand: () => void) => void
  handleInsertAfter?: (index: number) => void
}

const DashboardCardActionsContext = createContext<DashboardCardActionsContextValue | null>(null)

interface DashboardCardActionsProviderProps {
  value: DashboardCardActionsContextValue
  children: ReactNode
}

export function DashboardCardActionsProvider({ value, children }: DashboardCardActionsProviderProps) {
  return (
    <DashboardCardActionsContext.Provider value={value}>
      {children}
    </DashboardCardActionsContext.Provider>
  )
}

export function useDashboardCardActions() {
  const context = useContext(DashboardCardActionsContext)
  if (!context) {
    throw new Error('useDashboardCardActions must be used within DashboardCardActionsProvider')
  }
  return context
}
