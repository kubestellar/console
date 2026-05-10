import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { stellarApi } from '../services/stellar'
import type { StellarAction, StellarMission, StellarNotification, StellarOperationalState } from '../types/stellar'

const STELLAR_REFRESH_MS = 10_000
const STELLAR_RECONNECT_BASE_MS = 1_000
const STELLAR_RECONNECT_MAX_MS = 30_000
const STELLAR_DEFAULT_FETCH_LIMIT = 50

interface StellarAskResult {
  prompt: string
  answer: string
}

export function useStellar() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [notifications, setNotifications] = useState<StellarNotification[]>([])
  const [missions, setMissions] = useState<StellarMission[]>([])
  const [pendingActions, setPendingActions] = useState<StellarAction[]>([])
  const [state, setState] = useState<StellarOperationalState | null>(null)
  const [lastAsk, setLastAsk] = useState<StellarAskResult | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(STELLAR_RECONNECT_BASE_MS)

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const [nextState, nextNotifications, nextMissions, nextActions] = await Promise.all([
        stellarApi.getState(),
        stellarApi.getNotifications(STELLAR_DEFAULT_FETCH_LIMIT),
        stellarApi.getMissions(STELLAR_DEFAULT_FETCH_LIMIT),
        stellarApi.getActions('pending_approval', STELLAR_DEFAULT_FETCH_LIMIT),
      ])
      setState(nextState)
      setNotifications((nextNotifications || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setMissions(nextMissions)
      setPendingActions(nextActions)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshAll()
    const timer = setInterval(() => {
      void refreshAll()
    }, STELLAR_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refreshAll])

  const connectStream = useCallback(() => {
    if (typeof window === 'undefined') return
    if (esRef.current) esRef.current.close()
    const source = new EventSource('/api/stellar/stream')
    source.onopen = () => {
      setIsConnected(true)
      reconnectDelayRef.current = STELLAR_RECONNECT_BASE_MS
    }
    source.addEventListener('notifications', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { items?: StellarNotification[] }
      const items = payload.items || []
      setNotifications(items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    })
    source.addEventListener('state', (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as StellarOperationalState
      setState(payload)
    })
    source.onerror = () => {
      setIsConnected(false)
      source.close()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      const nextDelay = reconnectDelayRef.current
      reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, STELLAR_RECONNECT_MAX_MS)
      reconnectTimerRef.current = setTimeout(connectStream, nextDelay)
    }
    esRef.current = source
  }, [])

  useEffect(() => {
    connectStream()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [connectStream])

  const unreadCount = useMemo(() => notifications.filter(item => !item.read).length, [notifications])
  const activeMissions = useMemo(() => missions.filter(item => item.enabled), [missions])

  const acknowledgeNotification = useCallback(async (id: string) => {
    await stellarApi.acknowledgeNotification(id)
    setNotifications(prev => prev.map(item => item.id === id ? { ...item, read: true } : item))
  }, [])

  const approveAction = useCallback(async (id: string) => {
    await stellarApi.approveAction(id)
    await refreshAll()
  }, [refreshAll])

  const rejectAction = useCallback(async (id: string, reason: string) => {
    await stellarApi.rejectAction(id, reason)
    await refreshAll()
  }, [refreshAll])

  const sendQuickAsk = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    const result = await stellarApi.ask({ prompt: trimmed })
    setLastAsk({ prompt: trimmed, answer: result.answer })
    await refreshAll()
  }, [refreshAll])

  return {
    isOpen,
    setIsOpen,
    isLoading,
    isConnected,
    notifications,
    activeMissions,
    pendingActions,
    state,
    unreadCount,
    lastAsk,
    acknowledgeNotification,
    acknowledge: acknowledgeNotification,
    approveAction,
    rejectAction,
    sendQuickAsk,
    refreshAll,
  }
}
