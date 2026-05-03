import { useState, useEffect, useContext } from 'react'
import { AlertsContext } from '../contexts/AlertsContext'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants'
import type {
  Alert,
  AlertRule,
  AlertStats,
  SlackWebhook } from '../types/alerts'

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
  } catch (e: unknown) {
    console.error(`Failed to load ${key} from localStorage:`, e)
  }
  return defaultValue
}

// Save to localStorage
function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e: unknown) {
    console.error(`Failed to save ${key} to localStorage:`, e)
  }
}

// Default empty stats returned when AlertsProvider is absent
const _defaultAlertStats: AlertStats = { total: 0, firing: 0, resolved: 0, critical: 0, warning: 0, info: 0, acknowledged: 0 }

// Fully-populated safe AlertRule returned by the no-provider createRule fallback
const _emptyAlertRule: AlertRule = {
  id: '',
  name: '',
  description: '',
  enabled: false,
  condition: { type: 'custom' },
  severity: 'info',
  channels: [],
  aiDiagnose: false,
  createdAt: '',
  updatedAt: '' }

// Hook for managing alert rules - uses shared context
export function useAlertRules() {
  const context = useContext(AlertsContext)
  if (!context) {
    return {
      rules: [] as AlertRule[],
      createRule: (() => ({ ..._emptyAlertRule })) as unknown as (rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>) => AlertRule,
      updateRule: (_id: string, _updates: Partial<AlertRule>) => {},
      deleteRule: (_id: string) => {},
      toggleRule: (_id: string) => {} }
  }
  const { rules, createRule, updateRule, deleteRule, toggleRule } = context

  return {
    rules,
    createRule,
    updateRule,
    deleteRule,
    toggleRule }
}

// Hook for managing Slack webhooks
export function useSlackWebhooks() {
  const [webhooks, setWebhooks] = useState<SlackWebhook[]>(() =>
    loadFromStorage<SlackWebhook[]>(SLACK_WEBHOOKS_KEY, [])
  )

  useEffect(() => {
    saveToStorage(SLACK_WEBHOOKS_KEY, webhooks)
  }, [webhooks])

  const addWebhook = (name: string, webhookUrl: string, channel?: string) => {
    const webhook: SlackWebhook = {
      id: generateId(),
      name,
      webhookUrl,
      channel,
      createdAt: new Date().toISOString() }
    setWebhooks(prev => [...prev, webhook])
    return webhook
  }

  const removeWebhook = (id: string) => {
    setWebhooks(prev => prev.filter(w => w.id !== id))
  }

  return {
    webhooks,
    addWebhook,
    removeWebhook }
}

// Hook for managing alerts - uses shared context
export function useAlerts() {
  const context = useContext(AlertsContext)
  if (!context) {
    return {
      alerts: [] as Alert[],
      activeAlerts: [] as Alert[],
      acknowledgedAlerts: [] as Alert[],
      stats: _defaultAlertStats,
      acknowledgeAlert: () => {},
      acknowledgeAlerts: () => {},
      resolveAlert: () => {},
      deleteAlert: () => {},
      runAIDiagnosis: (() => null) as (alertId: string) => Promise<string | null> | string | null,
      evaluateConditions: () => {},
      isLoadingData: false,
      dataError: null as string | null }
  }
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
    dataError } = context

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
    dataError }
}

// Hook for sending Slack notifications
export function useSlackNotification() {
  const { webhooks } = useSlackWebhooks()

  const sendNotification = async (alert: Alert, webhookId: string) => {
      const webhook = webhooks.find(w => w.id === webhookId)
      if (!webhook) {
        throw new Error('Webhook not found')
      }

      const severityEmoji = {
        critical: ':red_circle:',
        warning: ':orange_circle:',
        info: ':blue_circle:' }

      const payload = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${severityEmoji[alert.severity]} ${alert.severity.toUpperCase()}: ${alert.ruleName}` } },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Cluster:* ${alert.cluster || 'N/A'}` },
              {
                type: 'mrkdwn',
                text: `*Resource:* ${alert.resource || 'N/A'}` },
            ] },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: alert.message } },
        ] }

      if (alert.aiDiagnosis) {
        payload.blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*AI Analysis:*\n${alert.aiDiagnosis.summary}\n\n*Suggestions:*\n${alert.aiDiagnosis.suggestions.map(s => `• ${s}`).join('\n')}` } })
      }

      try {
        // Route through backend notification service (#5713, Copilot followup)
        const response = await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
          body: JSON.stringify({
            alert: {
              id: alert.id,
              ruleId: alert.ruleId || '',
              ruleName: alert.ruleName,
              severity: alert.severity,
              status: alert.status,
              message: alert.message,
              cluster: alert.cluster,
              resource: alert.resource,
            },
            channels: [{
              type: 'slack',
              enabled: true,
              config: { webhookUrl: webhook.webhookUrl },
            }],
          }),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => '')
          throw new Error(`Notification send failed (${response.status}): ${errText}`)
        }
        return true
      } catch (error: unknown) {
        console.error('Failed to send Slack notification:', error)
        throw error
      }
    }

  return { sendNotification }
}
