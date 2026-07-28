import { useEffect, useRef, useState } from 'react'
import { Box, FileText, History, Info, Stethoscope } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { useHelmActions } from '../../../hooks/useHelmActions'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'
import { AIActionBar, useModalAI } from '../../modals'
import {
  ACTION_FEEDBACK_CLEAR_MS,
  HelmActionFeedbackBanner,
  HelmAiPanel,
  HelmConfirmActionBanner,
  HelmHeader,
  HelmOverviewPanel,
  HelmReleaseHistoryTable,
  HelmResourcesPanel,
  HelmTabs,
  HelmValuesPanel,
  buildHelmAIContext,
  getStatusStyle,
  parseHelmResources,
  type ConfirmActionState,
  type HelmHistory,
  type HelmHistoryRaw,
  type HelmRelease,
  type ParsedResource,
  type Props,
  type TabType,
} from './helm-release-drilldown'

export function HelmReleaseDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const releaseName = data.release as string
  const chartName = data.chart as string | undefined
  const chartVersion = data.chartVersion as string | undefined
  const appVersion = data.appVersion as string | undefined
  const releaseStatus = (data.status as string) || 'unknown'
  const releaseRevision = data.revision as string | undefined

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToDeployment, drillToService } = useDrillDownActions()
  const { close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()
  const { runHelm } = useDrillDownWebSocket(cluster)

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [releaseInfo, setReleaseInfo] = useState<HelmRelease | null>(null)
  const [releaseValues, setReleaseValues] = useState<string | null>(null)
  const [valuesLoading, setValuesLoading] = useState(false)
  const [releaseHistory, setReleaseHistory] = useState<HelmHistory[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [releaseResources, setReleaseResources] = useState<string | null>(null)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null)
  const actionFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedFieldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedRef = useRef(false)

  const { rollback, uninstall, isLoading: helmActionLoading } = useHelmActions()
  const { resourceContext, issues } = buildHelmAIContext({ releaseName, cluster, namespace, releaseStatus })

  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: { chartName, chartVersion, appVersion, releaseRevision },
  })

  useEffect(() => {
    return () => {
      if (actionFeedbackTimeoutRef.current) clearTimeout(actionFeedbackTimeoutRef.current)
      if (copiedFieldTimeoutRef.current) clearTimeout(copiedFieldTimeoutRef.current)
    }
  }, [])

  const fetchReleaseInfo = async () => {
    if (!agentConnected) return
    try {
      const output = await runHelm(['status', releaseName, '-n', namespace, '-o', 'json'])
      if (!output) return
      let info
      try {
        info = JSON.parse(output)
      } catch {
        setReleaseInfo(null)
        return
      }
      setReleaseInfo({
        name: info.name,
        namespace: info.namespace,
        revision: String(info.version || releaseRevision || '1'),
        updated: info.info?.last_deployed || '',
        status: info.info?.status || releaseStatus,
        chart: info.chart?.metadata?.name || chartName || '',
        app_version: info.chart?.metadata?.appVersion || appVersion || '',
      })
    } catch {
      // Ignore parse errors
    }
  }

  const fetchValues = async () => {
    if (!agentConnected || releaseValues) return
    setValuesLoading(true)
    try {
      const output = await runHelm(['get', 'values', releaseName, '-n', namespace, '-o', 'yaml'])
      setReleaseValues(output || 'No custom values configured')
    } catch {
      setReleaseValues('Error fetching values')
    }
    setValuesLoading(false)
  }

  const fetchHistory = async (force = false) => {
    if (!agentConnected || (releaseHistory && !force)) return
    setHistoryLoading(true)
    try {
      const output = await runHelm(['history', releaseName, '-n', namespace, '-o', 'json'])
      if (!output) return
      let history
      try {
        history = JSON.parse(output)
      } catch {
        setReleaseHistory([])
        return
      }
      setReleaseHistory(history.map((h: HelmHistoryRaw) => ({
        revision: h.revision,
        updated: h.updated,
        status: h.status,
        chart: h.chart,
        app_version: h.app_version,
        description: h.description,
      })))
    } catch {
      setReleaseHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const fetchResources = async () => {
    if (!agentConnected || releaseResources) return
    setResourcesLoading(true)
    try {
      const output = await runHelm(['get', 'manifest', releaseName, '-n', namespace])
      setReleaseResources(output || 'No resources found')
    } catch {
      setReleaseResources('Error fetching resources')
    }
    setResourcesLoading(false)
  }

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    const loadData = async () => {
      await fetchReleaseInfo()
      await Promise.all([fetchHistory(), fetchValues()])
    }
    loadData()
  }, [agentConnected, fetchReleaseInfo, fetchHistory, fetchValues])

  useEffect(() => {
    if (activeTab === 'resources' && !releaseResources && !resourcesLoading) {
      fetchResources()
    }
  }, [activeTab, releaseResources, resourcesLoading, fetchResources])

  const handleCopy = (field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    if (copiedFieldTimeoutRef.current) clearTimeout(copiedFieldTimeoutRef.current)
    copiedFieldTimeoutRef.current = setTimeout(() => {
      setCopiedField(null)
      copiedFieldTimeoutRef.current = null
    }, UI_FEEDBACK_TIMEOUT_MS)
  }

  const handleRollback = async (revision: number) => {
    const result = await rollback({ release: releaseName, namespace, cluster, revision })
    setConfirmAction(null)
    setActionFeedback({ success: result.success, message: result.message })
    if (actionFeedbackTimeoutRef.current) clearTimeout(actionFeedbackTimeoutRef.current)
    actionFeedbackTimeoutRef.current = setTimeout(() => {
      setActionFeedback(null)
      actionFeedbackTimeoutRef.current = null
    }, ACTION_FEEDBACK_CLEAR_MS)
    if (result.success) {
      fetchReleaseInfo()
      fetchHistory(true)
    }
  }

  const handleUninstall = async () => {
    const result = await uninstall({ release: releaseName, namespace, cluster })
    setConfirmAction(null)
    setActionFeedback({ success: result.success, message: result.message })
    if (actionFeedbackTimeoutRef.current) clearTimeout(actionFeedbackTimeoutRef.current)
    actionFeedbackTimeoutRef.current = setTimeout(() => {
      setActionFeedback(null)
      actionFeedbackTimeoutRef.current = null
    }, ACTION_FEEDBACK_CLEAR_MS)
  }

  const handleDiagnose = () => {
    const prompt = `Analyze this Helm release "${releaseName}" in namespace "${namespace}".

Release Details:
- Name: ${releaseName}
- Chart: ${chartName || releaseInfo?.chart || 'Unknown'}
- Version: ${chartVersion || 'Unknown'}
- App Version: ${appVersion || releaseInfo?.app_version || 'Unknown'}
- Status: ${releaseStatus}
- Revision: ${releaseRevision || releaseInfo?.revision || 'Unknown'}

Please:
1. Check the release health — status, values, and resource state.
2. Tell me what you found, then ask:
   - "Should I apply a fix or upgrade?"
   - "Show me the full analysis first"
3. If I say go ahead, apply and verify. Then ask:
   - "Should I check other Helm releases?"
   - "All done"`

    closeDrillDown()
    startMission({
      title: `Diagnose Helm: ${releaseName}`,
      description: 'Analyze Helm release health and configuration',
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'HelmRelease',
        name: releaseName,
        namespace,
        cluster,
        chart: chartName || releaseInfo?.chart,
        status: releaseStatus,
      },
    })
  }

  const handleParsedResourceClick = (resource: ParsedResource) => {
    if (resource.kind === 'Deployment') {
      drillToDeployment(cluster, resource.namespace, resource.name)
    } else if (resource.kind === 'Service') {
      drillToService(cluster, resource.namespace, resource.name)
    }
  }

  const statusStyle = getStatusStyle(releaseStatus)
  const parsedResources = releaseResources ? parseHelmResources(releaseResources, namespace) : []
  const tabs = [
    { id: 'overview' as const, label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'values' as const, label: t('drilldown.tabs.values'), icon: FileText },
    { id: 'history' as const, label: t('drilldown.tabs.history'), icon: History },
    { id: 'resources' as const, label: t('drilldown.tabs.resources'), icon: Box },
    { id: 'ai' as const, label: t('drilldown.tabs.aiAnalysis'), icon: Stethoscope },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      <HelmHeader
        cluster={cluster}
        namespace={namespace}
        releaseStatus={releaseStatus}
        statusStyle={statusStyle}
        drillToNamespace={drillToNamespace}
        drillToCluster={drillToCluster}
      />

      <div className="px-6 pb-4">
        <AIActionBar
          resource={resourceContext}
          actions={defaultAIActions}
          onAction={handleAIAction}
          issueCount={issues.length}
          compact={false}
        />
      </div>

      <HelmActionFeedbackBanner actionFeedback={actionFeedback} />
      <HelmConfirmActionBanner
        confirmAction={confirmAction}
        releaseName={releaseName}
        namespace={namespace}
        helmActionLoading={helmActionLoading}
        onCancel={() => setConfirmAction(null)}
        onConfirmRollback={handleRollback}
        onConfirmUninstall={handleUninstall}
      />

      <HelmTabs activeTab={activeTab} tabs={tabs} onSelectTab={setActiveTab} />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <HelmOverviewPanel
            releaseName={releaseName}
            chartName={chartName}
            chartVersion={chartVersion}
            appVersion={appVersion}
            releaseInfo={releaseInfo}
            releaseRevision={releaseRevision}
            releaseHistory={releaseHistory}
            parsedResources={parsedResources}
            onResourceClick={handleParsedResourceClick}
            onShowMoreResources={() => setActiveTab('resources')}
            helmActionLoading={helmActionLoading}
            onConfirmUninstall={() => setConfirmAction({ type: 'uninstall', label: `Uninstall ${releaseName}` })}
          />
        )}

        {activeTab === 'values' && (
          <HelmValuesPanel
            releaseValues={releaseValues}
            valuesLoading={valuesLoading}
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">{t('drilldown.helm.releaseHistory')}</h4>
            <HelmReleaseHistoryTable
              historyLoading={historyLoading}
              releaseHistory={releaseHistory}
              releaseInfo={releaseInfo}
              releaseRevision={releaseRevision}
              helmActionLoading={helmActionLoading}
              onConfirmRollback={(revision) => setConfirmAction({ type: 'rollback', label: `Rollback to #${revision}`, revision })}
            />
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">{t('drilldown.helm.manifestResources')}</h4>
            <HelmResourcesPanel
              resourcesLoading={resourcesLoading}
              parsedResources={parsedResources}
              onResourceClick={handleParsedResourceClick}
            />
          </div>
        )}

        {activeTab === 'ai' && (
          <HelmAiPanel
            isAgentConnected={isAgentConnected}
            aiAnalysisLoading={aiAnalysisLoading}
            aiAnalysis={aiAnalysis}
            onDiagnose={handleDiagnose}
          />
        )}
      </div>
    </div>
  )
}
