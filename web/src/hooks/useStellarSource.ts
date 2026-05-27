import { useCallback, useEffect, useRef, useState } from 'react'
import { getNextBatchTime, resolveStellarBatchIntervalMs } from '../components/stellar/lib/time'
import { STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS } from '../lib/constants/storage'
import { safeGetItem, safeSetItem } from '../lib/utils/localStorage'
import { stellarApi } from '../services/stellar'
import type { ProviderSession, StellarAction, StellarActivity, StellarNotification, StellarObservation, StellarOperationalState, StellarSolve, StellarSolveProgress, StellarTask, StellarWatch } from '../types/stellar'

export const STELLAR_ACTIVITY_LIMIT = 200
export const STELLAR_DEFAULT_FETCH_LIMIT = 50
export const STELLAR_RECONNECT_BASE_MS = 1000
export const STELLAR_RECONNECT_MAX_MS = 30000
export const STELLAR_TOKEN_POLL_INTERVAL_MS = 100
export const STELLAR_TOKEN_POLL_MAX_ATTEMPTS = 30
export const STELLAR_MISSION_TRIGGER_EVENT = 'stellar:mission_trigger'

export interface StellarMissionTriggerPayload {
  solveId: string
  eventId: string
  cluster: string
  namespace: string
  workload: string
  reason: string
  message: string
  title: string
  prompt: string
}
export interface CatchUpState { summary: string; kind: string; highlights?: string[] }

function hasStellarAuthCredentials(): boolean {
  if (localStorage.getItem('token')) return true
  if (localStorage.getItem('kc-has-session') === 'true') return true
  return false
}
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
function shouldHideNotification(notification: StellarNotification): boolean {
  return notification.read || notification.status === 'resolved' || notification.status === 'dismissed'
}
function mergeNotificationUpdate(items: StellarNotification[], updated: StellarNotification): StellarNotification[] {
  const remaining = (items || []).filter(item => item.id !== updated.id)
  return shouldHideNotification(updated) ? remaining : sortNotificationsByCreatedAt([updated, ...remaining])
}
function getStoredStellarBatchIntervalMs(): number {
  return resolveStellarBatchIntervalMs(safeGetItem(STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS))
}

export function useStellarSource() {
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
  const [providerSession, setProviderSession] = useState<ProviderSession | null>(() => {
    try {
      const persisted = localStorage.getItem('kc_selected_agent')
      if (persisted && persisted !== 'none') return { provider: persisted, model: '', source: 'user-default' as const, isCli: true }
    } catch {}
    return null
  })
  const [solves, setSolves] = useState<StellarSolve[]>([])
  const [solveProgress, setSolveProgress] = useState<Record<string, StellarSolveProgress>>({})
  const [activity, setActivity] = useState<StellarActivity[]>([])
  const esRef = useRef<EventSource | null>(null)
  const reconnectRef = useRef<() => void>(() => {})
  const reconnectDelay = useRef(STELLAR_RECONNECT_BASE_MS)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokenPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [batchIntervalMs, setBatchIntervalMsState] = useState(() => getStoredStellarBatchIntervalMs())
  const batchIntervalMsRef = useRef(batchIntervalMs)
  const [nextBatchAtMs, setNextBatchAtMs] = useState(() => getNextBatchTime(batchIntervalMs))
  const [isBatchRefreshing, setIsBatchRefreshing] = useState(false)
  const batchRefreshInFlightRef = useRef(false)

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'kc_selected_agent') {
        const agent = event.newValue
        if (agent && agent !== 'none') setProviderSession({ provider: agent, model: '', source: 'user-default' as const, isCli: true })
        return
      }
      if (event.key !== STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS) return
      const storedIntervalMs = resolveStellarBatchIntervalMs(event.newValue)
      batchIntervalMsRef.current = storedIntervalMs
      setBatchIntervalMsState(storedIntervalMs)
      setNextBatchAtMs(getNextBatchTime(storedIntervalMs))
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])
  useEffect(() => {
    batchIntervalMsRef.current = batchIntervalMs
  }, [batchIntervalMs])

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
    if (results[0].status === 'fulfilled') setState(results[0].value)
    if (results[1].status === 'fulfilled') setNotifications(sortNotificationsByCreatedAt(results[1].value || []))
    if (results[2].status === 'fulfilled') setPendingActions(results[2].value || [])
    if (results[3].status === 'fulfilled') setTasks((results[3].value || []).slice().sort((a, b) => a.priority - b.priority))
    if (results[4].status === 'fulfilled') setWatches(results[4].value || [])
    if (results[5].status === 'fulfilled') setSolves(results[5].value || [])
    if (results[6].status === 'fulfilled') setActivity(results[6].value || [])
    const failures = results.filter(result => result.status === 'rejected')
    if (failures.length > 0) console.warn('stellar: refreshState partial failure —', failures.length, 'of 7 calls failed')
  }, [setNotifications])
  const scheduleNextBatch = useCallback((intervalMs = batchIntervalMsRef.current) => {
    setNextBatchAtMs(getNextBatchTime(intervalMs))
  }, [])
  const refreshBatch = useCallback(async () => {
    if (batchRefreshInFlightRef.current) return
    batchRefreshInFlightRef.current = true
    setIsBatchRefreshing(true)
    try {
      await refreshState()
    } catch (err) {
      console.warn('stellar: batch refresh failed:', err)
    } finally {
      batchRefreshInFlightRef.current = false
      setIsBatchRefreshing(false)
      scheduleNextBatch()
    }
  }, [refreshState, scheduleNextBatch])
  const setBatchIntervalMs = useCallback((intervalMs: number) => {
    const nextIntervalMs = resolveStellarBatchIntervalMs(intervalMs)
    batchIntervalMsRef.current = nextIntervalMs
    setBatchIntervalMsState(nextIntervalMs)
    safeSetItem(STORAGE_KEY_STELLAR_BATCH_INTERVAL_MS, String(nextIntervalMs))
    setNextBatchAtMs(getNextBatchTime(nextIntervalMs))
  }, [])
  const runBatchNow = useCallback(async () => {
    await refreshBatch()
  }, [refreshBatch])

  const connectSSE = useCallback(() => {
    esRef.current?.close()
    const es = new EventSource('/api/stellar/stream', { withCredentials: true })
    const on = <T,>(eventName: string, handler: (payload: T) => void) => {
      es.addEventListener(eventName, event => {
        const payload = parseStellarEvent<T>(event, eventName)
        if (payload) handler(payload)
      })
    }
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
      reconnectTimerRef.current = setTimeout(() => reconnectRef.current(), delay)
    }
    on<StellarNotification>('notification', notif => {
      if (notif.read) return
      setNotifications(prev => (prev.some(item => item.id === notif.id) ? prev : sortNotificationsByCreatedAt([notif, ...prev])))
      if (notif.type !== 'event' || notif.severity !== 'critical') return
      setSolveProgress(prev => prev[notif.id] ? prev : {
        ...prev,
        [notif.id]: { solveId: 'pending', eventId: notif.id, step: 'reading', message: 'Auto-solve triggered — Stellar is investigating…', actionsTaken: 0, status: 'running' },
      })
      stellarApi.startSolve(notif.id).catch(err => {
        console.warn('stellar: auto-solve for critical event failed:', notif.id, err)
        setSolveProgress(prev => {
          const copy = { ...prev }
          delete copy[notif.id]
          return copy
        })
      })
    })
    on<{ clustersWatching: string[]; unreadCount: number; pendingActionCount: number }>('state', payload => {
      setState(prev => (prev ? { ...prev, clustersWatching: payload.clustersWatching } : prev))
    })
    on<{ id: string; status: string }>('action_updated', payload => {
      setPendingActions(prev => prev.filter(action => !(action.id === payload.id && payload.status !== 'pending_approval')))
    })
    on<{ id: string; summary: string; suggest?: string }>('observation', payload => {
      setNudge({ id: payload.id, summary: payload.summary, suggest: payload.suggest, ts: new Date().toISOString() })
      stellarApi.getWatches().then(setWatches).catch(() => {})
    })
    on<{ notifications?: StellarNotification[]; watches?: StellarWatch[]; pendingActions?: StellarAction[]; operationalState?: StellarOperationalState }>('initial_batch', batch => {
      if (batch.notifications) setNotifications(sortNotificationsByCreatedAt(batch.notifications))
      if (batch.watches) setWatches(batch.watches)
      if (batch.pendingActions) setPendingActions(batch.pendingActions)
      if (batch.operationalState) setState(batch.operationalState)
    })
    on<StellarWatch[]>('watches', updated => setWatches(updated || []))
    on<StellarWatch>('watch_update', updated => setWatches(prev => prev.map(watch => watch.id === updated.id ? updated : watch)))
    es.addEventListener('watch_created', () => { stellarApi.getWatches().then(setWatches).catch(() => {}) })
    on<StellarAction>('action_update', updated => {
      setPendingActions(prev => {
        const exists = prev.some(action => action.id === updated.id)
        if (updated.status === 'pending_approval') return exists ? prev.map(action => action.id === updated.id ? updated : action) : [updated, ...prev]
        return prev.filter(action => action.id !== updated.id)
      })
    })
    on<{ dedupKey: string; body: string }>('notification_update', payload => {
      setNotifications(prev => prev.map(notification => notification.dedupeKey === payload.dedupKey ? { ...notification, body: payload.body } : notification))
    })
    on<StellarNotification>('notification_replace', payload => setNotifications(prev => mergeNotificationUpdate(prev, payload)))
    on<{ solveId: string; eventId: string }>('solve_started', payload => {
      setSolveProgress(prev => ({
        ...prev,
        [payload.eventId]: { solveId: payload.solveId, eventId: payload.eventId, step: 'reading', message: 'Solve started — Stellar is on it.', actionsTaken: 0, status: 'running' },
      }))
      stellarApi.listSolves().then(setSolves).catch(() => {})
    })
    on<StellarSolveProgress>('solve_progress', payload => setSolveProgress(prev => ({ ...prev, [payload.eventId]: payload })))
    on<{ solveId: string; eventId: string; status: string; summary: string }>('solve_complete', payload => {
      setSolveProgress(prev => {
        const copy = { ...prev }
        delete copy[payload.eventId]
        return copy
      })
      stellarApi.listSolves().then(setSolves).catch(() => {})
      stellarApi.listActivity(STELLAR_ACTIVITY_LIMIT).then(setActivity).catch(() => {})
    })
    on<{ id: string }>('action_bumped', payload => {
      setPendingActions(prev => {
        const idx = prev.findIndex(action => action.id === payload.id)
        if (idx < 0) return prev
        const next = prev.slice()
        const [bumped] = next.splice(idx, 1)
        return [bumped, ...next]
      })
    })
    on<StellarActivity>('activity', entry => {
      setActivity(prev => (prev.some(item => item.id === entry.id) ? prev : [entry, ...prev].slice(0, STELLAR_ACTIVITY_LIMIT)))
    })
    es.addEventListener('digest_fired', () => { stellarApi.listSolves().then(setSolves).catch(() => {}) })
    on<CatchUpState>('catchup', payload => setCatchUp(payload))
    on<{ content: string; period: string }>('digest', digest => {
      setNudge({ id: crypto.randomUUID(), summary: digest.content, ts: new Date().toISOString() })
    })
    on<StellarMissionTriggerPayload>('mission_trigger', payload => {
      window.dispatchEvent(new CustomEvent(STELLAR_MISSION_TRIGGER_EVENT, { detail: payload }))
    })
  }, [setNotifications])

  useEffect(() => {
    reconnectRef.current = connectSSE
  }, [connectSSE])
  useEffect(() => {
    if (batchTimeoutRef.current) clearTimeout(batchTimeoutRef.current)
    const delayMs = Math.max(0, nextBatchAtMs - Date.now())
    batchTimeoutRef.current = setTimeout(() => { void refreshBatch() }, delayMs)
    return () => {
      if (!batchTimeoutRef.current) return
      clearTimeout(batchTimeoutRef.current)
      batchTimeoutRef.current = null
    }
  }, [nextBatchAtMs, refreshBatch])
  useEffect(() => {
    const waitForToken = () => new Promise<void>(resolve => {
      if (hasStellarAuthCredentials()) {
        resolve()
        return
      }
      let attempts = 0
      tokenPollRef.current = setInterval(() => {
        attempts++
        if (!hasStellarAuthCredentials() && attempts <= STELLAR_TOKEN_POLL_MAX_ATTEMPTS) return
        if (tokenPollRef.current) {
          clearInterval(tokenPollRef.current)
          tokenPollRef.current = null
        }
        resolve()
      }, STELLAR_TOKEN_POLL_INTERVAL_MS)
    })
    const initialize = async () => {
      await waitForToken()
      if (!hasStellarAuthCredentials()) {
        return
      }
      try {
        await refreshState()
      } catch (err) {
        console.warn('stellar: init failed:', err)
      }
      scheduleNextBatch()
      connectSSE()
    }
    void initialize()
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (tokenPollRef.current) {
        clearInterval(tokenPollRef.current)
        tokenPollRef.current = null
      }
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current)
        batchTimeoutRef.current = null
      }
      esRef.current?.close()
    }
  }, [connectSSE, refreshState, scheduleNextBatch])

  const unreadCount = notifications.filter(item => !item.read).length
  const acknowledgeNotification = useCallback(async (id: string) => {
    const removed = notificationsRef.current.find(notification => notification.id === id) || null
    setNotifications(prev => prev.filter(notification => notification.id !== id))
    try {
      await stellarApi.acknowledgeNotification(id)
    } catch (error) {
      if (removed) setNotifications(prev => (prev.some(item => item.id === removed.id) ? prev : sortNotificationsByCreatedAt([removed, ...prev])))
      throw error
    }
  }, [setNotifications])
  const dismissAllNotifications = useCallback(async () => {
    const snapshot = notificationsRef.current.slice()
    setNotifications([])
    if (snapshot.length === 0) return
    const results = await Promise.allSettled(snapshot.map(notification => stellarApi.acknowledgeNotification(notification.id)))
    const failedIds = new Set<string>()
    results.forEach((result, index) => {
      if (result.status === 'rejected') failedIds.add(snapshot[index].id)
    })
    if (failedIds.size === 0) return
    const failedItems = snapshot.filter(notification => failedIds.has(notification.id))
    setNotifications(prev => sortNotificationsByCreatedAt([...(prev || []), ...failedItems]))
    throw new Error('Failed to dismiss some notifications')
  }, [setNotifications])
  const investigateNotification = useCallback(async (id: string, investigationSummary?: string) => {
    const previous = notificationsRef.current.find(notification => notification.id === id) || null
    if (previous) {
      const optimisticUpdatedAt = new Date().toISOString()
      setNotifications(prev => prev.map(notification => notification.id === id
        ? { ...notification, status: 'investigating', investigationSummary, updatedAt: optimisticUpdatedAt, read: false }
        : notification))
    }
    try {
      const updated = await stellarApi.investigateNotification(id, investigationSummary)
      setNotifications(prev => mergeNotificationUpdate(prev, updated))
      return updated
    } catch (error) {
      if (previous) setNotifications(prev => mergeNotificationUpdate(prev, previous))
      throw error
    }
  }, [setNotifications])
  const resolveNotification = useCallback(async (id: string, resolutionNote?: string) => {
    const previous = notificationsRef.current.find(notification => notification.id === id) || null
    setNotifications(prev => prev.filter(notification => notification.id !== id))
    try {
      const updated = await stellarApi.resolveNotification(id, resolutionNote)
      setNotifications(prev => mergeNotificationUpdate(prev, updated))
      return updated
    } catch (error) {
      if (previous) setNotifications(prev => mergeNotificationUpdate(prev, previous))
      throw error
    }
  }, [setNotifications])
  const dismissNotification = useCallback(async (id: string, dismissalReason?: string) => {
    const previous = notificationsRef.current.find(notification => notification.id === id) || null
    setNotifications(prev => prev.filter(notification => notification.id !== id))
    try {
      const updated = await stellarApi.dismissNotification(id, dismissalReason)
      setNotifications(prev => mergeNotificationUpdate(prev, updated))
      return updated
    } catch (error) {
      if (previous) setNotifications(prev => mergeNotificationUpdate(prev, previous))
      throw error
    }
  }, [setNotifications])
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
    setTasks(prev => prev.filter(task => task.id !== id || (status !== 'done' && status !== 'dismissed')))
    try {
      await stellarApi.updateTaskStatus(id, status)
    } catch (error) {
      setTasks(previous)
      throw error
    }
  }, [tasks])
  const createTask = useCallback(async (title: string, description = '', source = 'user', options?: { dueAt?: string; priority?: number }) => {
    const created = await stellarApi.createTask({ title: title.trim(), description, source, priority: options?.priority ?? 5, dueAt: options?.dueAt })
    setTasks(prev => ([created, ...prev]).sort((a, b) => a.priority - b.priority))
    return created
  }, [])
  const dismissNudge = useCallback(() => setNudge(null), [])
  const resolveWatch = useCallback(async (id: string) => {
    setWatches(prev => prev.filter(watch => watch.id !== id))
    try {
      await stellarApi.resolveWatch(id)
    } catch {
      stellarApi.getWatches().then(setWatches).catch(() => {})
    }
  }, [])
  const dismissWatch = useCallback(async (id: string) => {
    setWatches(prev => prev.filter(watch => watch.id !== id))
    try {
      await stellarApi.dismissWatch(id)
    } catch {
      stellarApi.getWatches().then(setWatches).catch(() => {})
    }
  }, [])
  const snoozeWatch = useCallback(async (id: string, minutes: number) => {
    try {
      await stellarApi.snoozeWatch(id, minutes)
    } catch {}
  }, [])
  const dismissCatchUp = useCallback(() => setCatchUp(null), [])
  const startSolve = useCallback(async (eventID: string) => {
    setSolveProgress(prev => ({
      ...prev,
      [eventID]: { solveId: 'pending', eventId: eventID, step: 'reading', message: 'Starting…', actionsTaken: 0, status: 'running' },
    }))
    try {
      return await stellarApi.startSolve(eventID)
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
    isConnected, connectionError, state, notifications, unreadCount, pendingActions, tasks, watches, nudge, catchUp, providerSession,
    setProviderSession, acknowledgeNotification, dismissAllNotifications, investigateNotification, resolveNotification, dismissNotification,
    approveAction, rejectAction, updateTaskStatus, createTask, dismissNudge, resolveWatch, dismissWatch, snoozeWatch, dismissCatchUp,
    refreshState, batchIntervalMs, setBatchIntervalMs, nextBatchAtMs, isBatchRefreshing, runBatchNow, solves, solveProgress, startSolve, activity,
  }
}
export type StellarSourceValue = ReturnType<typeof useStellarSource>
