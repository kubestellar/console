import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stellarApi } from '../services/stellar'
import type { ProviderSession, StellarAction, StellarNotification, StellarOperationalState } from '../types/stellar'

const STELLAR_DEFAULT_FETCH_LIMIT = 50
const STELLAR_RECONNECT_BASE_MS = 1000
const STELLAR_RECONNECT_MAX_MS = 30000

export function useStellar() {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [state, setState] = useState<StellarOperationalState | null>(null)
  const [notifications, setNotifications] = useState<StellarNotification[]>([])
  const [pendingActions, setPendingActions] = useState<StellarAction[]>([])
  const [providerSession, setProviderSession] = useState<ProviderSession | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const reconnectRef = useRef<() => void>(() => {})
  const reconnectDelay = useRef(STELLAR_RECONNECT_BASE_MS)

  const refreshState = useCallback(async () => {
    const [nextState, nextNotifications, nextActions] = await Promise.all([
      stellarApi.getState(),
      stellarApi.getNotifications(STELLAR_DEFAULT_FETCH_LIMIT),
      stellarApi.getActions('pending_approval', STELLAR_DEFAULT_FETCH_LIMIT),
    ])
    setState(nextState)
    setNotifications((nextNotifications || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    setPendingActions(nextActions || [])
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
      setNotifications(prev => (prev.some(n => n.id === notif.id) ? prev : [notif, ...prev]))
    })
    es.addEventListener('state', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { clustersWatching: string[]; unreadCount: number; pendingActionCount: number }
      setState(prev => prev ? { ...prev, clustersWatching: payload.clustersWatching } : prev)
    })
    es.addEventListener('action_updated', (e) => {
      const payload = JSON.parse((e as MessageEvent).data) as { id: string; status: string }
      setPendingActions(prev => prev.filter(a => !(a.id === payload.id && payload.status !== 'pending_approval')))
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
    const previous = notifications
    // Remove the notification from local state immediately so it disappears
    setNotifications(prev => prev.filter(n => n.id !== id))
    try {
      await stellarApi.acknowledgeNotification(id)
    } catch (error) {
      setNotifications(previous)
      throw error
    }
  }, [notifications])

  const approveAction = useCallback(async (id: string, confirmToken?: string) => {
    await stellarApi.approveAction(id, confirmToken)
    setPendingActions(prev => prev.filter(action => action.id !== id))
  }, [])

  const rejectAction = useCallback(async (id: string, reason: string) => {
    await stellarApi.rejectAction(id, reason)
    setPendingActions(prev => prev.filter(action => action.id !== id))
  }, [])

  return {
    isConnected,
    connectionError,
    state,
    notifications,
    unreadCount,
    pendingActions,
    providerSession,
    setProviderSession,
    acknowledgeNotification,
    approveAction,
    rejectAction,
    refreshState,
  }
}
