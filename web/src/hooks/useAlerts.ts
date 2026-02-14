import { useState, useEffect, useCallback } from 'react'
import { useAlertsContext } from '../contexts/AlertsContext'
import type {
  Alert,
  AlertRule,
  AlertStats,
  SlackWebhook,
} from '../types/alerts'

// Re-export types for convenience
export type { Alert, AlertRule, AlertStats, SlackWebhook }

// Generate unique ID
function generateId(): string {
  return `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Local storage key for webhooks (still managed separately)
const SLACK_WEBHOOKS_KEY = 'kc_slack_webhooks'

// Load from localStorage
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage:`, e)
  }
  return defaultValue
}

// Save to localStorage
function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage:`, e)
  }
}

// Hook for managing alert rules - uses shared context
export function useAlertRules() {
  const { rules, createRule, updateRule, deleteRule, toggleRule } = useAlertsContext()

  return {
    rules,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
  }
}

// Hook for managing Slack webhooks
export function useSlackWebhooks() {
  const [webhooks, setWebhooks] = useState<SlackWebhook[]>(() =>
    loadFromStorage<SlackWebhook[]>(SLACK_WEBHOOKS_KEY, [])
  )

  useEffect(() => {
    saveToStorage(SLACK_WEBHOOKS_KEY, webhooks)
  }, [webhooks])

  const addWebhook = useCallback((name: string, webhookUrl: string, channel?: string) => {
    const webhook: SlackWebhook = {
      id: generateId(),
      name,
      webhookUrl,
      channel,
      createdAt: new Date().toISOString(),
    }
    setWebhooks(prev => [...prev, webhook])
    return webhook
  }, [])

  const removeWebhook = useCallback((id: string) => {
    setWebhooks(prev => prev.filter(w => w.id !== id))
  }, [])

  return {
    webhooks,
    addWebhook,
    removeWebhook,
  }
}

// Hook for managing alerts - uses shared context
export function useAlerts() {
  const {
    alerts,
    activeAlerts,
    acknowledgedAlerts,
    stats,
    acknowledgeAlert,
    acknowledgeAlerts,
    resolveAlert,
    deleteAlert,
    runAIDiagnosis,
    evaluateConditions,
    isLoadingData,
    dataError,
  } = useAlertsContext()

  return {
    alerts,
    activeAlerts,
    acknowledgedAlerts,
    stats,
    acknowledgeAlert,
    acknowledgeAlerts,
    resolveAlert,
    deleteAlert,
    runAIDiagnosis,
    evaluateConditions,
    isLoadingData,
    dataError,
  }
}

// Hook for sending Slack notifications
export function useSlackNotification() {
  const { webhooks } = useSlackWebhooks()

  const sendNotification = useCallback(
    async (alert: Alert, webhookId: string) => {
      const webhook = webhooks.find(w => w.id === webhookId)
      if (!webhook) {
        throw new Error('Webhook not found')
      }

      const severityEmoji = {
        critical: ':red_circle:',
        warning: ':orange_circle:',
        info: ':blue_circle:',
      }

      const payload = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${severityEmoji[alert.severity]} ${alert.severity.toUpperCase()}: ${alert.ruleName}`,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Cluster:* ${alert.cluster || 'N/A'}`,
              },
              {
                type: 'mrkdwn',
                text: `*Resource:* ${alert.resource || 'N/A'}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: alert.message,
            },
          },
        ],
      }

      if (alert.aiDiagnosis) {
        payload.blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*AI Analysis:*\n${alert.aiDiagnosis.summary}\n\n*Suggestions:*\n${alert.aiDiagnosis.suggestions.map(s => `• ${s}`).join('\n')}`,
          },
        })
      }

      try {
        // Note: In production, this should go through a backend proxy to avoid CORS
        // For now, we'll just log the intended payload
        // await fetch(webhook.webhookUrl, {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(payload),
        // })
        return true
      } catch (error) {
        console.error('Failed to send Slack notification:', error)
        throw error
      }
    },
    [webhooks]
  )

  return { sendNotification }
}
