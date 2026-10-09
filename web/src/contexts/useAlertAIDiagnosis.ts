import { useEffect, useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { useMissions } from '../hooks/useMissions'
import type { Alert, AlertRule } from '../types/alerts'
import { findRunbookForCondition } from '../lib/runbooks/builtins'
import { executeRunbook } from '../lib/runbooks/executor'

type MissionsState = ReturnType<typeof useMissions>

const AI_DIAGNOSIS_PENDING_SUMMARY = 'AI is analyzing this alert...'
const AI_DIAGNOSIS_SUMMARY_MAX_CHARS = 500

interface AlertAIDiagnosisInput {
  alertsRef: MutableRefObject<Alert[]>
  rulesRef: MutableRefObject<AlertRule[]>
  startMissionRef: MutableRefObject<MissionsState['startMission']>
  allMissions: MissionsState['missions']
  setAlerts: Dispatch<SetStateAction<Alert[]>>
}

/**
 * Starts AI diagnosis missions for alerts (enriched with runbook evidence) and
 * syncs completed mission output back into each alert's aiDiagnosis summary.
 */
export function useAlertAIDiagnosis({
  alertsRef,
  rulesRef,
  startMissionRef,
  allMissions,
  setAlerts,
}: AlertAIDiagnosisInput) {
  const diagnosisInFlightRef = useRef<Set<string>>(new Set())

  const runAIDiagnosis = useCallback(async (alertId: string) => {
    const alert = alertsRef.current.find(candidate => candidate.id === alertId)
    if (!alert) return null

    if (diagnosisInFlightRef.current.has(alertId)) return null
    diagnosisInFlightRef.current.add(alertId)

    try {
      const rule = rulesRef.current.find(candidate => candidate.id === alert.ruleId)
      const conditionType = rule?.condition.type
      const runbook = conditionType ? findRunbookForCondition(conditionType) : undefined

      const basePrompt = `Please analyze this alert and provide diagnosis with suggestions:

Alert: ${alert.ruleName}
Severity: ${alert.severity}
Message: ${alert.message}
Cluster: ${alert.cluster || 'N/A'}
Resource: ${alert.resource || 'N/A'}
Details: ${JSON.stringify(alert.details, null, 2)}`

      let runbookEvidence = ''
      if (runbook) {
        try {
          const result = await executeRunbook(runbook, {
            cluster: alert.cluster,
            namespace: alert.namespace,
            resource: alert.resource,
            resourceKind: alert.resourceKind,
            alertMessage: alert.message,
          })
          if (result.enrichedPrompt) {
            runbookEvidence = `\n\n--- Runbook Evidence (${runbook.title}) ---\n${result.enrichedPrompt}`
            console.debug(`Runbook "${runbook.title}" gathered ${result.stepResults.length} evidence steps`)
          }
        } catch {
          // Silent failure - runbook is best-effort enhancement
        }
      }

      const initialPrompt = `${basePrompt}${runbookEvidence}

Please provide:
1. A summary of the issue
2. The likely root cause
3. Suggested actions to resolve this alert`

      const missionId = startMissionRef.current({
        title: `Diagnose: ${alert.ruleName}`,
        description: `Analyzing alert on ${alert.cluster || 'cluster'}`,
        type: 'troubleshoot',
        cluster: alert.cluster,
        initialPrompt,
        context: {
          alertId,
          alertType: alert.ruleName,
          details: alert.details,
          runbookId: runbook?.id,
        },
      })

      setAlerts(prev =>
        prev.map(existing =>
          existing.id === alertId
            ? {
                ...existing,
                aiDiagnosis: {
                  summary: AI_DIAGNOSIS_PENDING_SUMMARY,
                  rootCause: '',
                  suggestions: [],
                  missionId,
                  analyzedAt: new Date().toISOString(),
                },
              }
            : existing
        )
      )

      return missionId
    } finally {
      diagnosisInFlightRef.current.delete(alertId)
    }
  }, [alertsRef, rulesRef, startMissionRef, setAlerts])

  useEffect(() => {
    setAlerts(prev => {
      let changed = false
      const updated = prev.map(alert => {
        if (!alert.aiDiagnosis?.missionId) return alert
        const mission = allMissions.find(candidate => candidate.id === alert.aiDiagnosis!.missionId)
        if (!mission || mission.status !== 'completed') return alert
        const lastAssistant = [...mission.messages].reverse().find(message => message.role === 'assistant')
        if (!lastAssistant || alert.aiDiagnosis.summary !== AI_DIAGNOSIS_PENDING_SUMMARY) return alert
        changed = true
        return {
          ...alert,
          aiDiagnosis: {
            ...alert.aiDiagnosis,
            summary: lastAssistant.content.slice(0, AI_DIAGNOSIS_SUMMARY_MAX_CHARS),
            analyzedAt: new Date().toISOString(),
          },
        }
      })
      return changed ? updated : prev
    })
  }, [allMissions, setAlerts])

  return { runAIDiagnosis }
}
