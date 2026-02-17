import { useState, useCallback } from 'react'
import { Alert, AlertChannel } from '../types/alerts'
import { BACKEND_DEFAULT_URL, STORAGE_KEY_AUTH_TOKEN } from '../lib/constants'

const API_BASE = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL

interface TestNotificationRequest {
  type: 'slack' | 'email' | 'webhook'
  config: Record<string, unknown>
}

interface SendAlertNotificationRequest {
  alert: Alert
  channels: AlertChannel[]
}

export function useNotificationAPI() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem(STORAGE_KEY_AUTH_TOKEN)
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    }
  }, [])

  const testNotification = useCallback(
    async (type: 'slack' | 'email' | 'webhook', config: Record<string, unknown>) => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${API_BASE}/api/notifications/test`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ type, config } as TestNotificationRequest),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to test notification')
        }

        return data
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to test notification'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [getAuthHeaders]
  )

  const sendAlertNotification = useCallback(
    async (alert: Alert, channels: AlertChannel[]) => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${API_BASE}/api/notifications/send`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ alert, channels } as SendAlertNotificationRequest),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to send notification')
        }

        return data
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send notification'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [getAuthHeaders]
  )

  return {
    testNotification,
    sendAlertNotification,
    isLoading,
    error,
  }
}
