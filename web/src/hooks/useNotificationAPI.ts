import { useState } from 'react'
import { Alert, AlertChannel } from '../types/alerts'
import { BACKEND_DEFAULT_URL, STORAGE_KEY_AUTH_TOKEN } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

const API_BASE = import.meta.env.VITE_API_BASE_URL || BACKEND_DEFAULT_URL

interface TestNotificationRequest {
  type: 'slack' | 'email' | 'webhook' | 'pagerduty' | 'opsgenie'
  config: Record<string, unknown>
}

interface SendAlertNotificationRequest {
  alert: Alert
  channels: AlertChannel[]
}

export function useNotificationAPI() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getAuthHeaders = () => {
    const token = localStorage.getItem(STORAGE_KEY_AUTH_TOKEN)
    return {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(token && { Authorization: `Bearer ${token}` }) }
  }

  const testNotification = async (type: 'slack' | 'email' | 'webhook' | 'pagerduty' | 'opsgenie', config: Record<string, unknown>) => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${API_BASE}/api/notifications/test`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ type, config } as TestNotificationRequest),
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to test notification')
        }

        return data
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to test notification'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    }

  const sendAlertNotification = async (alert: Alert, channels: AlertChannel[]) => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${API_BASE}/api/notifications/send`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ alert, channels } as SendAlertNotificationRequest),
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to send notification')
        }

        return data
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to send notification'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    }

  return {
    testNotification,
    sendAlertNotification,
    isLoading,
    error }
}
