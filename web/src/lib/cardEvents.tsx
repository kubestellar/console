import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react'

// ============================================================================
// Card Event Types
// ============================================================================

export interface DeployStartedPayload {
  id: string
  workload: string
  namespace: string
  sourceCluster: string
  targetClusters: string[]
  groupName?: string
  deployedBy?: string
  timestamp: number
}

export interface DeployProgressPayload {
  id: string
  cluster: string
  status: 'pending' | 'applying' | 'running' | 'failed'
  readyReplicas: number
  replicas: number
  message?: string
}

export interface DeployCompletedPayload {
  id: string
  success: boolean
  results: { cluster: string; status: string; message?: string }[]
  timestamp: number
}

export type CardEvent =
  | { type: 'deploy:started'; payload: DeployStartedPayload }
  | { type: 'deploy:progress'; payload: DeployProgressPayload }
  | { type: 'deploy:completed'; payload: DeployCompletedPayload }

export type CardEventType = CardEvent['type']

type EventCallback<T extends CardEventType> = (
  event: Extract<CardEvent, { type: T }>
) => void

// ============================================================================
// Card Event Bus
// ============================================================================

interface CardEventBus {
  publish: (event: CardEvent) => void
  subscribe: <T extends CardEventType>(type: T, callback: EventCallback<T>) => () => void
}

const CardEventContext = createContext<CardEventBus | null>(null)

export function CardEventProvider({ children }: { children: ReactNode }) {
  const subscribersRef = useRef<Map<string, Set<EventCallback<CardEventType>>>>(new Map())

  const publish = useCallback((event: CardEvent) => {
    const callbacks = subscribersRef.current.get(event.type)
    if (!callbacks) return
    for (const cb of callbacks) {
      try {
        cb(event as never)
      } catch (err) {
        console.error(`[CardEvents] Error in ${event.type} handler:`, err)
      }
    }
  }, [])

  const subscribe = useCallback(<T extends CardEventType>(
    type: T,
    callback: EventCallback<T>,
  ): (() => void) => {
    if (!subscribersRef.current.has(type)) {
      subscribersRef.current.set(type, new Set())
    }
    const callbacks = subscribersRef.current.get(type)!
    callbacks.add(callback as unknown as EventCallback<CardEventType>)

    return () => {
      callbacks.delete(callback as unknown as EventCallback<CardEventType>)
      if (callbacks.size === 0) {
        subscribersRef.current.delete(type)
      }
    }
  }, [])

  return (
    <CardEventContext.Provider value={{ publish, subscribe }}>
      {children}
    </CardEventContext.Provider>
  )
}

// ============================================================================
// Hooks
// ============================================================================

export function useCardEvents(): CardEventBus {
  const ctx = useContext(CardEventContext)
  if (!ctx) {
    // Return no-op bus when used outside provider (graceful degradation)
    return {
      publish: () => {},
      subscribe: () => () => {},
    }
  }
  return ctx
}

export function useCardPublish() {
  const { publish } = useCardEvents()
  return publish
}

export function useCardSubscribe() {
  const { subscribe } = useCardEvents()
  return subscribe
}
