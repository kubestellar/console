import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { ConnectTabState } from './useConnectTabState'

const ConnectTabContext = createContext<ConnectTabState | null>(null)

interface ConnectTabProviderProps {
  state: ConnectTabState
  children: ReactNode
}

export function ConnectTabProvider({ state, children }: ConnectTabProviderProps) {
  return (
    <ConnectTabContext.Provider value={state}>
      {children}
    </ConnectTabContext.Provider>
  )
}

export function useConnectTabContext(): ConnectTabState {
  const context = useContext(ConnectTabContext)
  if (!context) {
    throw new Error('useConnectTabContext must be used within a ConnectTabProvider')
  }
  return context
}
