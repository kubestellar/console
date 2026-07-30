import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useTabKeyboardNav } from '../../../hooks/useKeyboardNav'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { useModalAI, type ResourceContext } from '../../modals'
import { copyToClipboard } from '../../../lib/clipboard'

export type AlertTabType = 'overview' | 'labels' | 'source' | 'ai'

interface AlertData {
  cluster: string
  namespace?: string
  alertName: string
  alertSeverity: string
  alertState: string
  alertMessage?: string
  alertStartsAt?: string
  alertLabels: Record<string, string>
  alertAnnotations: Record<string, string>
  alertSource?: string
}

/**
 * Data-fetching state, effects, and derived values for AlertDrillDown.
 * Pure UI rendering lives in AlertDrillDown.parts.tsx / AlertDrillDown.tsx.
 */
export function useAlertDrillDown(alert: AlertData) {
  const { t } = useTranslation()
  const {
    cluster, namespace, alertName, alertSeverity, alertState,
    alertMessage, alertStartsAt, alertLabels, alertAnnotations, alertSource,
  } = alert

  const { isConnected: agentConnected } = useLocalAgent()
  const { close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [activeTab, setActiveTab] = useState<AlertTabType>('overview')
  const [sourceRule, setSourceRule] = useState<string | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const { tabListProps, getTabProps, getTabPanelProps } = useTabKeyboardNav<AlertTabType>({
    tabs: ['overview', 'labels', 'source', 'ai'], activeTab, onChange: setActiveTab,
  })
  const mountedRef = useRef(true)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      clearTimeout(copyTimerRef.current)
    }
  }, [])

  const resourceContext: ResourceContext = useMemo(() => ({
    kind: 'Alert',
    name: alertName,
    cluster,
    namespace,
    status: alertState,
    labels: alertLabels,
  }), [alertName, cluster, namespace, alertState, alertLabels])

  const issues = useMemo(() => alertMessage
    ? [{ name: alertName, message: alertMessage, severity: alertSeverity }]
    : [], [alertMessage, alertName, alertSeverity])

  const additionalContext = useMemo(() => ({
    alertSeverity,
    alertState,
    alertAnnotations,
    alertStartsAt,
    alertSource,
  }), [alertSeverity, alertState, alertAnnotations, alertStartsAt, alertSource])

  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext,
  })

  const fetchSourceRule = useCallback(async () => {
    if (!agentConnected || sourceRule || !alertSource) return
    setSourceLoading(true)
    try {
      const output = await runKubectl([
        'get', 'prometheusrules.monitoring.coreos.com',
        '-A', '-o', 'json',
      ])
      if (!mountedRef.current) return
      if (output) {
        let rules
        try {
          rules = JSON.parse(output)
        } catch {
          setSourceRule(t('drilldown.errors.parseKubectlOutput', 'Failed to parse kubectl output'))
          return
        }
        for (const rule of rules.items || []) {
          for (const group of rule.spec?.groups || []) {
            for (const r of group.rules || []) {
              if (r.alert === alertName) {
                setSourceRule(JSON.stringify(r, null, 2))
                break
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
    if (mountedRef.current) setSourceLoading(false)
  }, [agentConnected, sourceRule, alertSource, runKubectl, alertName, t])

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    fetchSourceRule()
  }, [agentConnected, fetchSourceRule])

  const handleCopy = useCallback((field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopiedField(null), UI_FEEDBACK_TIMEOUT_MS)
  }, [])

  const handleDiagnose = useCallback(() => {
    const prompt = `Analyze this ${alertSeverity} alert "${alertName}" which is currently ${alertState}.

Alert Details:
- Name: ${alertName}
- Severity: ${alertSeverity}
- State: ${alertState}
- Message: ${alertMessage || 'No message provided'}
- Started: ${alertStartsAt || 'Unknown'}
- Source: ${alertSource || 'Unknown'}

Labels:
${Object.entries(alertLabels).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Please:
1. Investigate the alert — explain what it means and identify the root cause.
2. Tell me what you found, then ask:
   - "Should I apply the fix?"
   - "Show me the investigation details first"
3. If I say fix it, apply and verify. Then ask:
   - "Should I silence this alert or set up a preventive rule?"
   - "All done"`

    closeDrillDown() // Close panel so mission sidebar is visible
    startMission({
      title: t('drilldown.alertDetail.diagnoseMissionTitle', { alertName }),
      description: t('drilldown.alertDetail.diagnoseMissionDescription', { severity: alertSeverity }),
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'Alert',
        name: alertName,
        namespace,
        cluster,
        severity: alertSeverity,
        state: alertState,
        labels: alertLabels,
      },
    })
  }, [alertSeverity, alertName, alertState, alertMessage, alertStartsAt, alertSource, alertLabels, closeDrillDown, startMission, t, cluster, namespace])

  return {
    activeTab, setActiveTab,
    tabListProps, getTabProps, getTabPanelProps,
    sourceRule, sourceLoading,
    aiAnalysis, aiAnalysisLoading,
    copiedField, handleCopy,
    resourceContext, issues,
    defaultAIActions, handleAIAction, isAgentConnected,
    handleDiagnose,
  }
}
