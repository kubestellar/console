import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { MIN_PERCEIVED_DELAY_MS } from '../../lib/constants/network'
import { getDemoNotifications } from './demoData'
import type { Notification } from './types'
import { isDemoUser, CACHE_TTL_MS } from './utils'

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const pollingRef = useRef<number | null>(null)

  useEffect(() => {
    isDemoUser().then(setIsDemoMode)
  }, [])

  const getUnreadCountForRequest = useCallback((featureRequestId: string): number => {
    return notifications.filter(notification => notification.feature_request_id === featureRequestId && !notification.read).length
  }, [notifications])

  const markRequestNotificationsAsRead = async (featureRequestId: string) => {
    const unreadForRequest = notifications.filter(notification => notification.feature_request_id === featureRequestId && !notification.read)
    if (unreadForRequest.length === 0) return

    if (isDemoMode) {
      const demoState = getDemoNotifications()
      for (let index = 0; index < demoState.length; index += 1) {
        if (demoState[index].feature_request_id === featureRequestId) {
          demoState[index] = { ...demoState[index], read: true }
        }
      }
      setNotifications(prev => prev.map(notification => notification.feature_request_id === featureRequestId ? { ...notification, read: true } : notification))
      setUnreadCount(prev => Math.max(0, prev - unreadForRequest.length))
      return
    }

    await Promise.all(unreadForRequest.map(notification => api.post(`/api/notifications/${notification.id}/read`)))
    setNotifications(prev => prev.map(notification => notification.feature_request_id === featureRequestId ? { ...notification, read: true } : notification))
    setUnreadCount(prev => Math.max(0, prev - unreadForRequest.length))
  }

  const loadNotifications = useCallback(async () => {
    if (isDemoMode) {
      const demoData = [...getDemoNotifications()]
      setNotifications(demoData)
      setUnreadCount(demoData.filter(notification => !notification.read).length)
      return
    }

    try {
      const { data } = await api.get<Notification[]>('/api/notifications')
      const list = Array.isArray(data) ? data : []
      setNotifications(list)
      setUnreadCount(list.filter(notification => !notification.read).length)
    } catch {
      // backend may be unavailable
    }
  }, [isDemoMode])

  const loadUnreadCount = useCallback(async () => {
    if (isDemoMode) {
      setUnreadCount(getDemoNotifications().filter(notification => !notification.read).length)
      return
    }

    try {
      const { data } = await api.get<{ count: number }>('/api/notifications/unread-count')
      setUnreadCount(data.count)
    } catch {
      // backend may be unavailable
    }
  }, [isDemoMode])

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    await loadNotifications()
    setIsLoading(false)
  }, [loadNotifications])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (isDemoMode) return undefined

    pollingRef.current = window.setInterval(() => {
      loadNotifications()
    }, CACHE_TTL_MS)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [isDemoMode, loadNotifications])

  const markAsRead = async (id: string) => {
    const notification = notifications.find(item => item.id === id)
    if (!notification || notification.read) return

    setNotifications(prev => prev.map(item => item.id === id ? { ...item, read: true } : item))
    setUnreadCount(prev => Math.max(0, prev - 1))

    if (isDemoMode) {
      const demoState = getDemoNotifications()
      const index = demoState.findIndex(item => item.id === id)
      if (index !== -1) {
        demoState[index] = { ...demoState[index], read: true }
      }
      return
    }

    try {
      await api.post(`/api/notifications/${id}/read`)
    } catch {
      setNotifications(prev => prev.map(item => item.id === id ? { ...item, read: false } : item))
      setUnreadCount(prev => prev + 1)
    }
  }

  const markAllAsRead = async () => {
    const hasUnreadNotifications = notifications.some(notification => !notification.read)
    if (!hasUnreadNotifications) return

    const previousNotifications = notifications.map(notification => ({ ...notification }))
    const previousCount = unreadCount

    setNotifications(prev => prev.map(notification => ({ ...notification, read: true })))
    setUnreadCount(0)

    if (isDemoMode) {
      const demoState = getDemoNotifications()
      for (let index = 0; index < demoState.length; index += 1) {
        demoState[index] = { ...demoState[index], read: true }
      }
      return
    }

    try {
      await api.post('/api/notifications/read-all')
    } catch {
      setNotifications(previousNotifications)
      setUnreadCount(previousCount)
    }
  }

  const refresh = async () => {
    setIsRefreshing(true)
    const minDelay = new Promise(resolve => setTimeout(resolve, MIN_PERCEIVED_DELAY_MS))
    await Promise.all([loadAll(), minDelay])
    setIsRefreshing(false)
  }

  return {
    notifications,
    unreadCount,
    isLoading,
    isRefreshing,
    loadNotifications,
    loadUnreadCount,
    markAsRead,
    markAllAsRead,
    refresh,
    getUnreadCountForRequest,
    markRequestNotificationsAsRead,
  }
}
