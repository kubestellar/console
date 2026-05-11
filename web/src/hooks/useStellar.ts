import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stellarApi } from '../services/stellar'
import type { ProviderSession, StellarAction, StellarNotification, StellarObservation, StellarOperationalState, StellarTask, StellarWatch } from '../types/stellar'

const STELLAR_DEFAULT_FETCH_LIMIT = 50
const STELLAR_RECONNECT_BASE_MS = 1000
const STELLAR_RECONNECT_MAX_MS = 30000

function sortNotificationsByCreatedAt(items: StellarNotification[]): StellarNotification[] {
  return (items || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface CatchUpState {
  summary: string
  kind: string
}

export function useStellar() {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [state, setState] = useState<StellarOperationalState | null>(null)
  const [notifications, setNotifications] = useState<StellarNotification[]>([])
  const [pendingActions, setPendingActions] = useState<StellarAction[]>([])
  const [tasks, setTasks] = useState<StellarTask[]>([])
  const [watches, setWatches] = useState<StellarWatch[]>([])
  const [nudge, setNudge] = useState<StellarObservation | null>(null)
  const [catchUp, setCatchUp] = useState<CatchUpState | null>(null)
  const [providerSession, setProviderSession] = useState<ProviderSession | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const reconnectRef = useRef<() => void>(() => {})
  const reconnectDelay = useRef(STELLAR_RECONNECT_BASE_MS)

  const refreshState = useCallback(async () => {
    const [nextState, nextNotifications, nextActions, nextTasks, nextWatches] = await Promise.all([
      stellarApi.getState(),
      stellarApi.getNotifications(STELLAR_DEFAULT_FETCH_LIMIT, true),
      stellarApi.getActions('pending_approval', STELLAR_DEFAULT_FETCH_LIMIT),
      stellarApi.getTasks(),
      stellarApi.getWatches(),
    ])
    setState(nextState)
    setNotifications(sortNotificationsByCreatedAt(nextNotifications || []))
    setPendingActions(nextActions || [])
    setTasks((nextTasks || []).slice().sort((a, b) => a.priority - b.priority))
    setWatches(nextWatches || [])
  }, [])

  const connectSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
    }
    const es = new EventSource('/api/stellar/stream')
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
      const notif: StellarNotification = JSON.parse((e as MessageEvent).data)
      if (notif.read) {
        return
      }
      setNotifications(prev => (prev.some(n => n.id === notif.id) ? prev : sortNotificationsByCreatedAt([notif, ...prev])))
    })
    es.addEventListener('state', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { clustersWatching: string[]; unreadCount: number; pendingActionCount: number }
      setState(prev => prev ? { ...prev, clustersWatching: payload.clustersWatching } : prev)
    })
    es.addEventListener('action_updated', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { id: string; status: string }
      setPendingActions(prev => prev.filter(a => !(a.id === payload.id && payload.status !== 'pending_approval')))
    })
    es.addEventListener('observation', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { id: string; summary: string; suggest?: string }
      setNudge({
        id: payload.id,
        summary: payload.summary,
        suggest: payload.suggest,
        ts: new Date().toISOString(),
      })
      // Refresh watches when observer fires — lastUpdate may have changed
      stellarApi.getWatches().then(setWatches).catch(() => {/* ignore */})
    })
    es.addEventListener('watches', (e) => {
      const updated: StellarWatch[] = JSON.parse((e as MessageEvent).data)
      setWatches(updated || [])
    })
    es.addEventListener('watch_created', () => {
      stellarApi.getWatches().then(setWatches).catch(() => {/* ignore */})
    })
    es.addEventListener('catchup', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { summary: string; kind: string }
      setCatchUp(d)
    })
    es.addEventListener('digest', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { content: string; period: string }
      // Treat scheduled digest as a high-priority proactive nudge
      setNudge({ id: crypto.randomUUID(), summary: d.content, ts: new Date().toISOString() })
    })
  }, [])

  useEffect(() => {
    reconnectRef.current = connectSSE
  }, [connectSSE])

  useEffect(() => {
    const initialize = async () => {
      await refreshState()
      connectSSE()
    }

    void initialize()

    return () => {
      esRef.current?.close()
    }
  }, [refreshState, connectSSE])

  const unreadCount = useMemo(() => notifications.filter(item => !item.read).length, [notifications])

  const acknowledgeNotification = useCallback(async (id: string) => {
    let removed: StellarNotification | null = null
    // Remove immediately so dismiss feels instant.
    setNotifications(prev => {
      removed = prev.find(n => n.id === id) || null
      return prev.filter(n => n.id !== id)
    })
    try {
      await stellarApi.acknowledgeNotification(id)
    } catch (error) {
      if (removed) {
        const itemToRestore: StellarNotification = removed
        setNotifications(prev => (
          prev.some(item => item.id === itemToRestore.id)
            ? prev
            : sortNotificationsByCreatedAt([itemToRestore, ...prev])
        ))
      }
      throw error
    }
  }, [])

  const dismissAllNotifications = useCallback(async () => {
    let snapshot: StellarNotification[] = []
    setNotifications(prev => {
      snapshot = prev.slice()
      return []
    })
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

  const createTask = useCallback(async (title: string, description = '', source = 'user') => {
    const created = await stellarApi.createTask({
      title: title.trim(),
      description,
      source,
      priority: 5,
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
  }
}
