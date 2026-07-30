import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { getNextBatchTime, STELLAR_DEFAULT_BATCH_INTERVAL_MS } from '../components/stellar/lib/time'
import { useStellarSource, type StellarSourceValue } from './useStellarSource'

export {
  STELLAR_MISSION_TRIGGER_EVENT,
  STELLAR_TOKEN_POLL_INTERVAL_MS,
  STELLAR_TOKEN_POLL_MAX_ATTEMPTS,
  type CatchUpState,
  type StellarMissionTriggerPayload,
} from './useStellarSource'

const StellarContext = createContext<StellarSourceValue | null>(null)

export function StellarProvider({ children }: { children: ReactNode }) {
  const source = useStellarSource()
  const value = useMemo(() => source, [
    source.isConnected,
    source.connectionError,
    source.state,
    source.notifications,
    source.unreadCount,
    source.pendingActions,
    source.tasks,
    source.watches,
    source.nudge,
    source.catchUp,
    source.providerSession,
    source.setProviderSession,
    source.acknowledgeNotification,
    source.dismissAllNotifications,
    source.investigateNotification,
    source.resolveNotification,
    source.dismissNotification,
    source.approveAction,
    source.rejectAction,
    source.updateTaskStatus,
    source.createTask,
    source.dismissNudge,
    source.resolveWatch,
    source.dismissWatch,
    source.snoozeWatch,
    source.dismissCatchUp,
    source.refreshState,
    source.batchIntervalMs,
    source.setBatchIntervalMs,
    source.nextBatchAtMs,
    source.isBatchRefreshing,
    source.runBatchNow,
    source.solves,
    source.solveProgress,
    source.startSolve,
    source.activity,
  ])

  return <StellarContext.Provider value={value}>{children}</StellarContext.Provider>
}

export function useStellar(): StellarSourceValue {
  const ctx = useContext(StellarContext)
  if (ctx) return ctx
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStellarFallback()
}

function useStellarFallback(): StellarSourceValue {
  return useMemo(() => ({
    isConnected: false,
    connectionError: null,
    state: null,
    notifications: [],
    unreadCount: 0,
    pendingActions: [],
    tasks: [],
    watches: [],
    nudge: null,
    catchUp: null,
    providerSession: null,
    setProviderSession: () => {},
    acknowledgeNotification: async () => {},
    dismissAllNotifications: async () => {},
    investigateNotification: async () => ({} as never),
    resolveNotification: async () => ({} as never),
    dismissNotification: async () => ({} as never),
    approveAction: async () => {},
    rejectAction: async () => {},
    updateTaskStatus: async () => {},
    createTask: async () => ({} as never),
    dismissNudge: () => {},
    resolveWatch: async () => {},
    dismissWatch: async () => {},
    snoozeWatch: async () => {},
    dismissCatchUp: () => {},
    refreshState: async () => {},
    batchIntervalMs: STELLAR_DEFAULT_BATCH_INTERVAL_MS,
    setBatchIntervalMs: () => {},
    nextBatchAtMs: getNextBatchTime(STELLAR_DEFAULT_BATCH_INTERVAL_MS),
    isBatchRefreshing: false,
    runBatchNow: async () => {},
    solves: [],
    solveProgress: {},
    startSolve: async () => ({}) as never,
    activity: [],
  }), [])
}
