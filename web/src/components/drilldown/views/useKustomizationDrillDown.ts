import { useState, useEffect, useRef } from 'react'
import type { Condition } from '../../../types/mcs'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { useModalAI, type ResourceContext } from '../../modals'

export type KustomizationTabType = 'overview' | 'resources' | 'conditions' | 'ai'

export interface AppliedResource {
  kind: string
  name: string
  namespace?: string
  apiVersion?: string
}

interface InventoryEntryRaw {
  id?: string
  v?: string
}

interface KustomizationData {
  cluster: string
  namespace: string
  kustomizationName: string
  kustomizationStatus: string
  sourceRef?: { kind?: string; name?: string }
  path?: string
  interval?: string
  lastAppliedRevision?: string
  suspended?: boolean
}

/**
 * Data-fetching state, effects, and derived values for KustomizationDrillDown.
 * Pure UI rendering lives in KustomizationDrillDown.parts.tsx / KustomizationDrillDown.tsx.
 */
export function useKustomizationDrillDown(kustomization: KustomizationData) {
  const {
    cluster, namespace, kustomizationName, kustomizationStatus,
    sourceRef, path, interval, lastAppliedRevision, suspended,
  } = kustomization

  const { isConnected: agentConnected } = useLocalAgent()
  const { close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [activeTab, setActiveTab] = useState<KustomizationTabType>('overview')
  const [appliedResources, setAppliedResources] = useState<AppliedResource[] | null>(null)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [conditions, setConditions] = useState<Condition[] | null>(null)
  const [conditionsLoading, setConditionsLoading] = useState(false)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)

  const resourceContext: ResourceContext = {
    kind: 'Custom',
    name: kustomizationName,
    cluster,
    namespace,
    status: kustomizationStatus,
  }

  const hasIssues = kustomizationStatus.toLowerCase() === 'failed' ||
    kustomizationStatus.toLowerCase() === 'false' ||
    suspended === true
  const issues = hasIssues
    ? [{ name: kustomizationName, message: suspended ? 'Kustomization suspended' : `Status: ${kustomizationStatus}`, severity: 'warning' }]
    : []

  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      path,
      sourceRef,
      lastAppliedRevision,
      suspended,
    },
  })

  const fetchDetails = async () => {
    if (!agentConnected || appliedResources) return
    setResourcesLoading(true)
    setConditionsLoading(true)
    try {
      const output = await runKubectl([
        'get', 'kustomization', kustomizationName, '-n', namespace, '-o', 'json',
      ])
      if (output) {
        let ks
        try {
          ks = JSON.parse(output)
        } catch {
          setAppliedResources([])
          setConditions([])
          return
        }
        const inventory = ks.status?.inventory?.entries || []
        setAppliedResources(inventory.map((entry: InventoryEntryRaw) => {
          // Parse inventory entry format: namespace_name_group_kind
          const parts = entry.id?.split('_') || []
          return {
            namespace: parts[0] || undefined,
            name: parts[1] || entry.id || 'Unknown',
            kind: parts[3] || 'Unknown',
            apiVersion: entry.v || undefined,
          }
        }))

        const conds = ks.status?.conditions || []
        setConditions(conds.map((c: Condition) => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
          lastTransitionTime: c.lastTransitionTime,
        })))
      }
    } catch {
      setAppliedResources([])
      setConditions([])
    }
    setResourcesLoading(false)
    setConditionsLoading(false)
  }

  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    fetchDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentConnected])

  const handleDiagnose = () => {
    const readyCondition = conditions?.find(c => c.type === 'Ready')
    const prompt = `Analyze this Flux Kustomization "${kustomizationName}" in namespace "${namespace}".

Kustomization Details:
- Name: ${kustomizationName}
- Status: ${kustomizationStatus}
- Suspended: ${suspended ? 'Yes' : 'No'}
- Path: ${path || '/'}
- Source: ${sourceRef?.kind || 'Unknown'}/${sourceRef?.name || 'Unknown'}
- Interval: ${interval || 'Unknown'}
- Last Applied Revision: ${lastAppliedRevision || 'None'}

${readyCondition ? `
Ready Condition:
- Status: ${readyCondition.status}
- Reason: ${readyCondition.reason || 'Unknown'}
- Message: ${readyCondition.message || 'None'}
` : ''}

Applied Resources: ${appliedResources?.length || 0}

Please:
1. Assess the kustomization health — sync status, conditions, and dependencies.
2. Tell me what you found, then ask:
   - "Should I fix the reconciliation issues?"
   - "Show me more details first"
3. If I say fix it, apply and verify. Then ask:
   - "Should I check related Flux resources?"
   - "All done"`

    closeDrillDown() // Close panel so mission sidebar is visible
    startMission({
      title: `Diagnose Kustomization: ${kustomizationName}`,
      description: `Analyze Flux Kustomization health and sync status`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'Kustomization',
        name: kustomizationName,
        namespace,
        cluster,
        status: kustomizationStatus,
        sourceRef,
        path,
      },
    })
  }

  return {
    activeTab, setActiveTab,
    appliedResources, resourcesLoading,
    conditions, conditionsLoading,
    aiAnalysis, aiAnalysisLoading,
    resourceContext, issues,
    defaultAIActions, handleAIAction, isAgentConnected,
    handleDiagnose,
  }
}
