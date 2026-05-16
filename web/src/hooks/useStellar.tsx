import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { stellarApi } from '../services/stellar'
import type { ProviderSession, StellarAction, StellarActivity, StellarNotification, StellarObservation, StellarOperationalState, StellarSolve, StellarSolveProgress, StellarTask, StellarWatch } from '../types/stellar'

const STELLAR_ACTIVITY_LIMIT = 200

const STELLAR_DEFAULT_FETCH_LIMIT = 50
const STELLAR_RECONNECT_BASE_MS = 1000
const STELLAR_RECONNECT_MAX_MS = 30000

function parseStellarEvent<T>(event: Event, eventName: string): T | null {
  try {
    return JSON.parse((event as MessageEvent).data) as T
  } catch (err) {
    console.warn(`stellar: malformed ${eventName} event JSON`, err)
    return null
  }
}

function sortNotificationsByCreatedAt(items: StellarNotification[]): StellarNotification[] {
  return (items || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface CatchUpState {
  summary: string
  kind: string
}

function useStellarSource() {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [state, setState] = useState<StellarOperationalState | null>(null)
  const [notifications, setNotificationsRaw] = useState<StellarNotification[]>([])
  const notificationsRef = useRef<StellarNotification[]>([])
  const setNotifications = useCallback((updater: StellarNotification[] | ((prev: StellarNotification[]) => StellarNotification[])) => {
    setNotificationsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      notificationsRef.current = next
      return next
    })
  }, [])
  const [pendingActions, setPendingActions] = useState<StellarAction[]>([])
  const [tasks, setTasks] = useState<StellarTask[]>([])
  const [watches, setWatches] = useState<StellarWatch[]>([])
  const [nudge, setNudge] = useState<StellarObservation | null>(null)
  const [catchUp, setCatchUp] = useState<CatchUpState | null>(null)
  const [providerSession, setProviderSession] = useState<ProviderSession | null>(null)
  const [solves, setSolves] = useState<StellarSolve[]>([])
  const [solveProgress, setSolveProgress] = useState<Record<string, StellarSolveProgress>>({})
  const [activity, setActivity] = useState<StellarActivity[]>([])
  const esRef = useRef<EventSource | null>(null)
  const reconnectRef = useRef<() => void>(() => {})
  const reconnectDelay = useRef(STELLAR_RECONNECT_BASE_MS)

  const refreshState = useCallback(async () => {
    const results = await Promise.allSettled([
      stellarApi.getState(),
      stellarApi.getNotifications(STELLAR_DEFAULT_FETCH_LIMIT, true),
      stellarApi.getActions('pending_approval', STELLAR_DEFAULT_FETCH_LIMIT),
      stellarApi.getTasks(),
      stellarApi.getWatches(),
      stellarApi.listSolves(),
      stellarApi.listActivity(STELLAR_ACTIVITY_LIMIT),
    ])

    // Apply results only if they succeeded — partial failure must not crash the hook
    if (results[0].status === 'fulfilled') setState(results[0].value)
    if (results[1].status === 'fulfilled') setNotifications(sortNotificationsByCreatedAt(results[1].value || []))
    if (results[2].status === 'fulfilled') setPendingActions(results[2].value || [])
    if (results[3].status === 'fulfilled') setTasks((results[3].value || []).slice().sort((a, b) => a.priority - b.priority))
    if (results[4].status === 'fulfilled') setWatches(results[4].value || [])
    if (results[5].status === 'fulfilled') setSolves(results[5].value || [])
    if (results[6].status === 'fulfilled') setActivity(results[6].value || [])

    const failures = results.filter(r => r.status === 'rejected')
    if (failures.length > 0) {
      console.warn('stellar: refreshState partial failure —', failures.length, 'of 7 calls failed')
    }
  }, [])

  const connectSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
    }
    const es = new EventSource('/api/stellar/stream', { withCredentials: true })
    esRef.current = es
    es.onopen = () => {
      setIsConnected(true)
      setConnectionError(null)
      reconnectDelay.current = STELLAR_RECONNECT_BASE_MS
    }
    es.onerror = () => {
      setIsConnected(false)
      es.close()
      const delay = Math.min(reconnectDelay.current, STELLAR_RECONNECT_MAX_MS)
      reconnectDelay.current = Math.min(delay * 2, STELLAR_RECONNECT_MAX_MS)
      setTimeout(() => reconnectRef.current(), delay)
    }
    es.addEventListener('notification', (e) => {
      const notif = parseStellarEvent<StellarNotification>(e, 'notification')
      if (!notif || notif.read) {
        return
      }
      setNotifications(prev => (prev.some(n => n.id === notif.id) ? prev : sortNotificationsByCreatedAt([notif, ...prev])))
    })
    es.addEventListener('state', (e) => {
      const payload = parseStellarEvent<{ clustersWatching: string[]; unreadCount: number; pendingActionCount: number }>(e, 'state')
      if (!payload) {
        return
      }
      setState(prev => prev ? { ...prev, clustersWatching: payload.clustersWatching } : prev)
    })
    es.addEventListener('action_updated', (e) => {
      const payload = parseStellarEvent<{ id: string; status: string }>(e, 'action_updated')
      if (!payload) {
        return
      }
      setPendingActions(prev => prev.filter(a => !(a.id === payload.id && payload.status !== 'pending_approval')))
    })
    es.addEventListener('observation', (e) => {
      const payload = parseStellarEvent<{ id: string; summary: string; suggest?: string }>(e, 'observation')
      if (!payload) {
        return
      }
      setNudge({
        id: payload.id,
        summary: payload.summary,
        suggest: payload.suggest,
        ts: new Date().toISOString(),
      })
      // Refresh watches when observer fires — lastUpdate may have changed
      stellarApi.getWatches().then(setWatches).catch(() => {/* ignore */})
    })
    es.addEventListener('initial_batch', (e) => {
      const batch = parseStellarEvent<{
        notifications?: StellarNotification[]
        watches?: StellarWatch[]
        pendingActions?: StellarAction[]
        operationalState?: StellarOperationalState
      }>(e, 'initial_batch')
      if (!batch) {
        return
      }
      if (batch.notifications) setNotifications(sortNotificationsByCreatedAt(batch.notifications))
      if (batch.watches) setWatches(batch.watches)
      if (batch.pendingActions) setPendingActions(batch.pendingActions)
      if (batch.operationalState) setState(batch.operationalState)
    })
    es.addEventListener('watches', (e) => {
      const updated = parseStellarEvent<StellarWatch[]>(e, 'watches')
      if (!updated) {
        return
      }
      setWatches(updated || [])
    })
    es.addEventListener('watch_update', (e) => {
      const updated = parseStellarEvent<StellarWatch>(e, 'watch_update')
      if (!updated) {
        return
      }
      setWatches(prev => prev.map(w => w.id === updated.id ? updated : w))
    })
    es.addEventListener('watch_created', () => {
      stellarApi.getWatches().then(setWatches).catch(() => {/* ignore */})
    })
    es.addEventListener('action_update', (e) => {
      const updated = parseStellarEvent<StellarAction>(e, 'action_update')
      if (!updated) {
        return
      }
      setPendingActions(prev => {
        const exists = prev.some(a => a.id === updated.id)
        if (updated.status === 'pending_approval') {
          return exists ? prev.map(a => a.id === updated.id ? updated : a) : [updated, ...prev]
        }
        return prev.filter(a => a.id !== updated.id)
      })
    })
    es.addEventListener('notification_update', (e) => {
      const payload = parseStellarEvent<{ dedupKey: string; body: string }>(e, 'notification_update')
      if (!payload) {
        return
      }
      setNotifications(prev => prev.map(n =>
        n.dedupeKey === payload.dedupKey ? { ...n, body: payload.body } : n
      ))
    })
    es.addEventListener('solve_started', (e) => {
      const payload = parseStellarEvent<{ solveId: string; eventId: string }>(e, 'solve_started')
      if (!payload) {
        return
      }
      setSolveProgress(prev => ({
        ...prev,
        [payload.eventId]: {
          solveId: payload.solveId, eventId: payload.eventId,
          step: 'reading', message: 'Solve started — Stellar is on it.', actionsTaken: 0, status: 'running',
        },
      }))
      stellarApi.listSolves().then(setSolves).catch(() => { /* ignore */ })
    })
    es.addEventListener('solve_progress', (e) => {
      const payload = parseStellarEvent<StellarSolveProgress>(e, 'solve_progress')
      if (!payload) {
        return
      }
      setSolveProgress(prev => ({ ...prev, [payload.eventId]: payload }))
    })
    es.addEventListener('solve_complete', (e) => {
      const payload = parseStellarEvent<{ solveId: string; eventId: string; status: string; summary: string }>(e, 'solve_complete')
      if (!payload) {
        return
      }
      setSolveProgress(prev => {
        const copy = { ...prev }
        delete copy[payload.eventId]
        return copy
      })
      // Refetch solves so the terminal state lands.
      stellarApi.listSolves().then(setSolves).catch(() => { /* ignore */ })
    })
    es.addEventListener('action_bumped', (e) => {
      const payload = parseStellarEvent<{ id: string }>(e, 'action_bumped')
      if (!payload) {
        return
      }
      // Refresh pending actions order — they may have been re-bumped.
      setPendingActions(prev => {
        const idx = prev.findIndex(a => a.id === payload.id)
        if (idx < 0) return prev
        const next = prev.slice()
        const [bumped] = next.splice(idx, 1)
        return [bumped, ...next]
      })
    })
    es.addEventListener('activity', (e) => {
      const entry = parseStellarEvent<StellarActivity>(e, 'activity')
      if (!entry) {
        return
      }
      setActivity(prev => {
        if (prev.some(a => a.id === entry.id)) return prev
        return [entry, ...prev].slice(0, STELLAR_ACTIVITY_LIMIT)
      })
    })
    es.addEventListener('digest_fired', () => {
      // Refetch solves so the digest's underlying numbers are visible.
      stellarApi.listSolves().then(setSolves).catch(() => { /* ignore */ })
    })
    es.addEventListener('catchup', (e) => {
      const catchup = parseStellarEvent<{ summary: string; kind: string }>(e, 'catchup')
      if (!catchup) {
        return
      }
      setCatchUp(catchup)
    })
    es.addEventListener('digest', (e) => {
      const digest = parseStellarEvent<{ content: string; period: string }>(e, 'digest')
      if (!digest) {
        return
      }
      // Treat scheduled digest as a high-priority proactive nudge
      setNudge({ id: crypto.randomUUID(), summary: digest.content, ts: new Date().toISOString() })
    })
  }, [])

  useEffect(() => {
    reconnectRef.current = connectSSE
  }, [connectSSE])

  useEffect(() => {
    const waitForToken = (): Promise<void> => {
      return new Promise((resolve) => {
        if (localStorage.getItem('token') || document.cookie.includes('kc_auth')) {
          resolve()
          return
        }
        let attempts = 0
        const interval = setInterval(() => {
          attempts++
          if (localStorage.getItem('token') || document.cookie.includes('kc_auth') || attempts > 30) {
            clearInterval(interval)
            resolve()
          }
        }, 100)
      })
    }

    const initialize = async () => {
      await waitForToken()

      try {
        await refreshState()
      } catch (err) {
        console.warn('stellar: init failed:', err)
      }
      
      // Always connect SSE — even if init failed or cancelled by HMR
      connectSSE()
    }

    void initialize()

    return () => {
      esRef.current?.close()
    }
  }, []) // Empty deps — run once on mount, never re-run

  const unreadCount = useMemo(() => notifications.filter(item => !item.read).length, [notifications])

  const acknowledgeNotification = useCallback(async (id: string) => {
    // Snapshot the item before removal so we can restore on failure.
    // Read from the ref to avoid depending on React's setState batch timing.
    const removed = notificationsRef.current.find(n => n.id === id) || null
    setNotifications(prev => prev.filter(n => n.id !== id))
    try {
      await stellarApi.acknowledgeNotification(id)
    } catch (error) {
      if (removed) {
        setNotifications(prev => (
          prev.some(item => item.id === removed.id)
            ? prev
            : sortNotificationsByCreatedAt([removed, ...prev])
        ))
      }
      throw error
    }
  }, [])

  const dismissAllNotifications = useCallback(async () => {
    // Read current notifications from ref for reliable access regardless of
    // React batch timing.
    const snapshot = notificationsRef.current.slice()
    setNotifications([])
    if (snapshot.length === 0) {
      return
    }

    const results = await Promise.allSettled(
      snapshot.map(notification => stellarApi.acknowledgeNotification(notification.id)),
    )
    const failedIds = new Set<string>()
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        failedIds.add(snapshot[index].id)
      }
    })

    if (failedIds.size > 0) {
      const failedItems = snapshot.filter(notification => failedIds.has(notification.id))
      setNotifications(prev => sortNotificationsByCreatedAt([...(prev || []), ...failedItems]))
      throw new Error('Failed to dismiss some notifications')
    }
  }, [])

  const approveAction = useCallback(async (id: string, confirmToken?: string) => {
    await stellarApi.approveAction(id, confirmToken)
    setPendingActions(prev => prev.filter(action => action.id !== id))
  }, [])

  const rejectAction = useCallback(async (id: string, reason: string) => {
    await stellarApi.rejectAction(id, reason)
    setPendingActions(prev => prev.filter(action => action.id !== id))
  }, [])

  const updateTaskStatus = useCallback(async (id: string, status: string) => {
    const previous = tasks
    setTasks(prev => prev.filter(task => {
      if (task.id !== id) return true
      return status !== 'done' && status !== 'dismissed'
    }))
    try {
      await stellarApi.updateTaskStatus(id, status)
    } catch (error) {
      setTasks(previous)
      throw error
    }
  }, [tasks])

  const createTask = useCallback(async (
    title: string,
    description = '',
    source = 'user',
    options?: { dueAt?: string; priority?: number },
  ) => {
    const created = await stellarApi.createTask({
      title: title.trim(),
      description,
      source,
      priority: options?.priority ?? 5,
      dueAt: options?.dueAt,
    })
    setTasks(prev => ([created, ...prev]).sort((a, b) => a.priority - b.priority))
    return created
  }, [])

  const dismissNudge = useCallback(() => setNudge(null), [])

  const resolveWatch = useCallback(async (id: string) => {
    // Optimistic remove
    setWatches(prev => prev.filter(w => w.id !== id))
    try {
      await stellarApi.resolveWatch(id)
    } catch {
      // Restore on failure
      stellarApi.getWatches().then(setWatches).catch(() => {/* ignore */})
    }
  }, [])

  const dismissWatch = useCallback(async (id: string) => {
    setWatches(prev => prev.filter(w => w.id !== id))
    try {
      await stellarApi.dismissWatch(id)
    } catch {
      stellarApi.getWatches().then(setWatches).catch(() => {/* ignore */})
    }
  }, [])

  const snoozeWatch = useCallback(async (id: string, minutes: number) => {
    try {
      await stellarApi.snoozeWatch(id, minutes)
    } catch {
      // non-fatal
    }
  }, [])

  const dismissCatchUp = useCallback(() => setCatchUp(null), [])

  const startSolve = useCallback(async (eventID: string) => {
    // Optimistically flip the event into "solving" mode before the server
    // confirms — feels instant, the SSE solve_started will replace this.
    setSolveProgress(prev => ({
      ...prev,
      [eventID]: {
        solveId: 'pending', eventId: eventID,
        step: 'reading', message: 'Starting…', actionsTaken: 0, status: 'running',
      },
    }))
    try {
      const result = await stellarApi.startSolve(eventID)
      return result
    } catch (err) {
      setSolveProgress(prev => {
        const copy = { ...prev }
        delete copy[eventID]
        return copy
      })
      throw err
    }
  }, [])

  return {
    isConnected,
    connectionError,
    state,
    notifications,
    unreadCount,
    pendingActions,
    tasks,
    watches,
    nudge,
    catchUp,
    providerSession,
    setProviderSession,
    acknowledgeNotification,
    dismissAllNotifications,
    approveAction,
    rejectAction,
    updateTaskStatus,
    createTask,
    dismissNudge,
    resolveWatch,
    dismissWatch,
    snoozeWatch,
    dismissCatchUp,
    refreshState,
    solves,
    solveProgress,
    startSolve,
    activity,
  }
}

// ---------------------------------------------------------------------------
// Provider + context-consuming useStellar.
//
// Previously each component that called useStellar() opened its own SSE
// connection and held its own state. That broke toast delivery on pages that
// didn't mount the Stellar page itself — events arrived at one instance, the
// toast bridge held a different empty state. Hoisting to a Provider in App.tsx
// gives the whole app one connection, one state, and matches the
// MissionProvider / AlertsProvider pattern.
// ---------------------------------------------------------------------------

type StellarContextValue = ReturnType<typeof useStellarSource>

const StellarContext = createContext<StellarContextValue | null>(null)

export function StellarProvider({ children }: { children: ReactNode }) {
  const value = useStellarSource()
  return <StellarContext.Provider value={value}>{children}</StellarContext.Provider>
}

// useStellar consumes the provider value. Called outside a StellarProvider it
// returns a no-op fallback so a stray component doesn't crash the page; in
// practice every page renders under <StellarProvider /> mounted in App.tsx.
export function useStellar(): StellarContextValue {
  const ctx = useContext(StellarContext)
  if (ctx) return ctx
  // Fallback so the app stays renderable if a component is mounted outside the
  // provider (e.g., in a Storybook isolation test). Returning useStellarSource()
  // here would open a stray SSE; instead return zeroed state.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStellarFallback()
}

function useStellarFallback(): StellarContextValue {
  // Stable empty value. Wrapped in a hook so it shows up in the React DevTools
  // hook list and can be traced when something forgets the provider.
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
    solves: [],
    solveProgress: {},
    startSolve: async () => ({}) as never,
    activity: [],
  }), [])
}
