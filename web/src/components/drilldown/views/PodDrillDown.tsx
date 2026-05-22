import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Box, Layers, Loader2, RefreshCw, Server, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { safeLazy } from '../../../lib/safeLazy'
import { cn } from '../../../lib/cn'
import { copyToClipboard } from '../../../lib/clipboard'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { useApiKeyCheck, ApiKeyPromptModal } from '../../cards/console-missions/shared'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useBackendHealth } from '../../../hooks/useBackendHealth'
import { useAsyncData } from '../../../hooks/useAsyncData'
import { PodStatusSection } from './PodStatusSection'
import { PodLogsSection } from './PodLogsSection'
import { PodEventsSection } from './PodEventsSection'
import { PodYamlSection } from './PodYamlSection'
import { PodLabelsProvider } from './pod-drilldown/PodLabelsContext'
import { computeKeyValueDiffMap } from './pod-drilldown/helpers'
import { getIssueSeverity, PodAiAnalysis, PodDeleteSection, setPodCache, type TabType } from './pod-drilldown'
import { safeSet, usePodData } from './PodDrillDown.hooks'
import { usePodActions } from './PodDrillDown.actions'
import { useContainerNames, usePodTabs } from './PodDrillDown.tabs'

const PodExecTerminal = safeLazy(() => import('../../terminal/PodExecTerminal'), 'default')
const PodLabelsTab = safeLazy(() => import('./pod-drilldown/PodLabelsTab'), 'PodLabelsTab')
const PodRelatedTab = safeLazy(() => import('./pod-drilldown/PodRelatedTab'), 'PodRelatedTab')
const PodOutputTab = safeLazy(() => import('./pod-drilldown/PodOutputTab'), 'PodOutputTab')

const DIAGNOSIS_SUMMARY_KEYS = {
  'crash-loop': 'drilldown.diagnosis.summaries.crashLoop',
  'oom-killed': 'drilldown.diagnosis.summaries.oomKilled',
  'image-pull': 'drilldown.diagnosis.summaries.imagePull',
  'config-error': 'drilldown.diagnosis.summaries.configError',
  'probe-failure': 'drilldown.diagnosis.summaries.probeFailure',
  unknown: 'drilldown.diagnosis.summaries.unknown',
} as const

const DIAGNOSIS_STEP_KEYS = {
  'crash-loop': ['drilldown.diagnosis.steps.checkLogs', 'drilldown.diagnosis.steps.verifyCommand', 'drilldown.diagnosis.steps.ensureLongRunningProcess'],
  'oom-killed': ['drilldown.diagnosis.steps.checkMemoryUsage', 'drilldown.diagnosis.steps.raiseMemoryLimit', 'drilldown.diagnosis.steps.inspectRecentChanges'],
  'image-pull': ['drilldown.diagnosis.steps.verifyImageReference', 'drilldown.diagnosis.steps.checkRegistryAccess', 'drilldown.diagnosis.steps.confirmImageExists'],
  'config-error': ['drilldown.diagnosis.steps.inspectPodEvents', 'drilldown.diagnosis.steps.verifyReferencedConfig', 'drilldown.diagnosis.steps.reviewPodSpec'],
  'probe-failure': ['drilldown.diagnosis.steps.checkProbeConfiguration', 'drilldown.diagnosis.steps.verifyAppStartup', 'drilldown.diagnosis.steps.reviewRecentDeployments'],
  unknown: ['drilldown.diagnosis.steps.checkLogs', 'drilldown.diagnosis.steps.inspectPodEvents', 'drilldown.diagnosis.steps.reviewPodSpec'],
} as const

function TabLoadingFallback() {
  return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent border-t-primary" /></div>
}

export function PodDrillDown({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation()
  const { isConnected: agentConnected } = useLocalAgent()
  const { status: backendStatus, inCluster } = useBackendHealth()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt, errorMessage } = useApiKeyCheck()
  const { drillToNamespace, drillToCluster, drillToDeployment, drillToReplicaSet, drillToConfigMap, drillToSecret, drillToServiceAccount, drillToPVC } = useDrillDownActions()
  const { TABS } = usePodTabs()

  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const podName = data.pod as string
  const passedLabels = data.labels as Record<string, string> | undefined
  const passedAnnotations = data.annotations as Record<string, string> | undefined
  const backendActionUnavailable = inCluster && backendStatus === 'disconnected'
  const backendUnavailableMessage = t('drilldown.status.backendUnavailableActions')

  const podData = usePodData({ cluster, namespace, podName, data, agentConnected, backendActionUnavailable, backendUnavailableMessage })
  const [activeTab, setActiveTab] = useState<TabType>((data.tab as TabType) || 'overview')
  const [labels, setLabels] = useState<Record<string, string> | null>(podData.cache.labels || null)
  const [annotations, setAnnotations] = useState<Record<string, string> | null>(podData.cache.annotations || null)
  const [showAllLabels, setShowAllLabels] = useState(false)
  const [showAllAnnotations, setShowAllAnnotations] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const cachedOwnerChain = podData.cache.ownerChain || []

  const actions = usePodActions({
    cluster,
    namespace,
    podName,
    status: podData.status,
    restarts: podData.restarts,
    issues: podData.issues,
    agentConnected,
    backendActionUnavailable,
    backendUnavailableMessage,
    labels,
    annotations,
    ownerChain: cachedOwnerChain,
    openTrackedWs: podData.openTrackedWs,
    parseWsMessage: podData.parseWsMessage,
  })

  const ownerChain = actions.relatedResources
  const isManagedPod = ownerChain.some(owner => ['ReplicaSet', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job'].includes(owner.kind))
  const containerNames = useContainerNames(podData.yamlOutput)
  const aiAnalysisFetcher = useCallback(
    () => podData.aiAnalysisFetcher(labels, annotations, podData.issues),
    [podData.aiAnalysisFetcher, labels, annotations, podData.issues],
  )
  const { data: aiAnalysis, loading: aiAnalysisLoading, error: aiAnalysisError, refetch: refetchAiAnalysis } = useAsyncData(aiAnalysisFetcher, [aiAnalysisFetcher], {
    initialData: podData.cache.aiAnalysis || null,
    enabled: false,
  })

  const fetchAiAnalysis = useCallback(async () => {
    if (backendActionUnavailable || !agentConnected || aiAnalysisLoading) return
    await refetchAiAnalysis()
  }, [backendActionUnavailable, agentConnected, aiAnalysisLoading, refetchAiAnalysis])

  const handleRepairPod = useCallback(() => actions.handleRepairPod(checkKeyAndRun), [actions, checkKeyAndRun])
  const saveLabels = useCallback(() => actions.saveLabels(setLabels), [actions])
  const saveAnnotations = useCallback(() => actions.saveAnnotations(setAnnotations), [actions])
  const filteredDisplayIssues = useMemo(() => podData.issues.filter(issue => issue.toLowerCase() !== podData.status?.toLowerCase()), [podData.issues, podData.status])
  const labelDiffByKey = useMemo(() => computeKeyValueDiffMap(labels, actions.pendingLabelChanges), [labels, actions.pendingLabelChanges])
  const annotationDiffByKey = useMemo(() => computeKeyValueDiffMap(annotations, actions.pendingAnnotationChanges), [annotations, actions.pendingAnnotationChanges])
  const diagnosisEvidence = useMemo(() => {
    if (!podData.podDiagnosis) return []
    const items: string[] = []
    if (podData.podDiagnosis.currentStateReason) items.push(t('drilldown.diagnosis.evidence.currentStateReason', { reason: podData.podDiagnosis.currentStateReason }))
    if (podData.podDiagnosis.lastExitReason && podData.podDiagnosis.exitCode) items.push(t('drilldown.diagnosis.evidence.lastExitReasonWithCode', { reason: podData.podDiagnosis.lastExitReason, code: podData.podDiagnosis.exitCode }))
    else if (podData.podDiagnosis.lastExitReason) items.push(t('drilldown.diagnosis.evidence.lastExitReason', { reason: podData.podDiagnosis.lastExitReason }))
    if (podData.podDiagnosis.lastExitMessage) items.push(t('drilldown.diagnosis.evidence.lastExitMessage', { message: podData.podDiagnosis.lastExitMessage }))
    if (podData.podDiagnosis.warningEvent) items.push(t('drilldown.diagnosis.evidence.warningEvent', { event: podData.podDiagnosis.warningEvent }))
    if (podData.podDiagnosis.logSnippet) items.push(t('drilldown.diagnosis.evidence.logSnippet', { snippet: podData.podDiagnosis.logSnippet }))
    if (items.length === 0 && podData.reason) items.push(t('drilldown.diagnosis.evidence.reportedReason', { reason: podData.reason }))
    if (items.length === 0 && podData.status) items.push(t('drilldown.diagnosis.evidence.reportedStatus', { status: podData.status }))
    return items
  }, [podData.podDiagnosis, podData.reason, podData.status, t])

  const handleCopy = useCallback((field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), UI_FEEDBACK_TIMEOUT_MS)
  }, [])

  useEffect(() => {
    if (passedLabels) setLabels(passedLabels)
    if (passedAnnotations) setAnnotations(passedAnnotations)
  }, [passedLabels, passedAnnotations])

  useEffect(() => {
    if (!podData.describeOutput || (labels && annotations)) return
    const labelsMatch = podData.describeOutput.match(/Labels:\s*([\s\S]*?)(?=Annotations:|$)/i)
    const annotationsMatch = podData.describeOutput.match(/Annotations:\s*([\s\S]*?)(?=Status:|Controlled By:|$)/i)
    if (labelsMatch && !labels) {
      const parsed: Record<string, string> = Object.create(null) as Record<string, string>
      labelsMatch[1].trim().split('\n').forEach(line => {
        const [key, ...valueParts] = line.trim().split('=')
        if (key && key !== '<none>') safeSet(parsed, key, valueParts.join('='))
      })
      if (Object.keys(parsed).length > 0) setLabels(parsed)
    }
    if (annotationsMatch && !annotations) {
      const parsed: Record<string, string> = Object.create(null) as Record<string, string>
      annotationsMatch[1].trim().split('\n').forEach(line => {
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          const key = line.substring(0, colonIdx).trim()
          const value = line.substring(colonIdx + 1).trim()
          if (key && key !== '<none>') safeSet(parsed, key, value)
        }
      })
      if (Object.keys(parsed).length > 0) setAnnotations(parsed)
    }
  }, [podData.describeOutput, labels, annotations])

  useEffect(() => {
    if (!agentConnected || podData.hasLoadedRef.current) return
    podData.hasLoadedRef.current = true
    let cancelled = false
    const forceRefresh = podData.shouldAutoRefreshRef.current
    const loadData = async () => {
      await Promise.all([(forceRefresh || !podData.podStatusOutput) && podData.fetchPodStatus(forceRefresh), (forceRefresh || !podData.eventsOutput) && podData.fetchEvents(forceRefresh)].filter(Boolean))
      if (cancelled) return
      await Promise.all([(forceRefresh || ownerChain.length === 0) && actions.fetchRelatedResources(forceRefresh), (forceRefresh || !podData.describeOutput) && podData.fetchDescribe(forceRefresh)].filter(Boolean))
      if (cancelled) return
      await Promise.all([(forceRefresh || !podData.logsOutput) && podData.fetchLogs(forceRefresh), (forceRefresh || !podData.yamlOutput) && podData.fetchYaml(forceRefresh)].filter(Boolean))
    }
    void loadData()
    return () => { cancelled = true }
  }, [agentConnected, actions, ownerChain.length, podData])

  useEffect(() => {
    setPodCache(cluster, namespace, podName, {
      describeOutput: podData.describeOutput || undefined,
      logsOutput: podData.logsOutput || undefined,
      eventsOutput: podData.eventsOutput || undefined,
      yamlOutput: podData.yamlOutput || undefined,
      podStatusOutput: podData.podStatusOutput || undefined,
      aiAnalysis: aiAnalysis || undefined,
      labels: labels || undefined,
      annotations: annotations || undefined,
      configMaps: actions.configMaps.length > 0 ? actions.configMaps : undefined,
      secrets: actions.secrets.length > 0 ? actions.secrets : undefined,
      pvcs: actions.pvcs.length > 0 ? actions.pvcs : undefined,
      serviceAccount: actions.serviceAccount || undefined,
      ownerChain: ownerChain.length > 0 ? ownerChain : undefined,
      fetchedAt: Date.now(),
    })
  }, [cluster, namespace, podName, podData.describeOutput, podData.logsOutput, podData.eventsOutput, podData.yamlOutput, podData.podStatusOutput, aiAnalysis, labels, annotations, actions.configMaps, actions.secrets, actions.pvcs, actions.serviceAccount, ownerChain])

  const refreshAll = useCallback(async () => {
    if (!agentConnected) return
    setIsRefreshing(true)
    try {
      await Promise.all([podData.fetchPodStatus(true), podData.fetchDescribe(true), podData.fetchLogs(true), podData.fetchEvents(true), podData.fetchYaml(true), actions.fetchRelatedResources(true)])
    } finally {
      setIsRefreshing(false)
    }
  }, [agentConnected, podData, actions])

  return (
    <div className="-m-6 flex flex-col">
      <div className="px-6 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <button onClick={() => drillToNamespace(cluster, namespace)} className="group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 py-2 min-h-11 transition-all hover:border-purple-500/30 hover:bg-purple-500/10"><Layers className="h-4 w-4 text-purple-400" /><span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span><span className="font-mono text-purple-400 transition-colors group-hover:text-purple-300">{namespace}</span><svg className="h-3 w-3 text-purple-400/70 transition-colors group-hover:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
            <button onClick={() => drillToCluster(cluster)} className="group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 py-2 min-h-11 transition-all hover:border-blue-500/30 hover:bg-blue-500/10"><Server className="h-4 w-4 text-blue-400" /><span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span><ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" /><svg className="h-3 w-3 text-blue-400/70 transition-colors group-hover:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
            {podData.restarts > 0 && <div className="flex items-center gap-2"><Box className="h-4 w-4 text-yellow-400" /><span className="text-muted-foreground">{t('drilldown.fields.restarts')}</span><span className="font-mono text-yellow-400">{podData.restarts}</span></div>}
          </div>
          {agentConnected && <button onClick={refreshAll} disabled={isRefreshing} className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 min-h-11 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50" title={t('drilldown.actions.refreshAllPodData')}><RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} /><span className="text-sm">{isRefreshing ? t('common.refreshing') : t('common.refresh')}</span></button>}
        </div>
      </div>

      <div className="border-b border-border px-6"><div className="flex gap-1">{TABS.map(tab => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors min-h-11', activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')}><Icon className="h-4 w-4" />{tab.label}</button> })}</div></div>

      <div className="space-y-6 p-6">
        {activeTab === 'overview' && <div className="space-y-6">
          <PodStatusSection agentConnected={agentConnected} podName={podName} namespace={namespace} output={podData.podStatusOutput} loading={podData.podStatusLoading} error={podData.podStatusError} fetchingLabel={t('drilldown.status.fetchingPodStatus')} />
          <div>{podData.issues.length > 0 ? <div className="space-y-3">{filteredDisplayIssues.length > 0 && <div className="flex flex-wrap gap-2">{filteredDisplayIssues.map((issue, i) => { const severity = getIssueSeverity(issue); const bgColor = severity === 'critical' ? 'bg-red-500/20 text-red-400' : severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'; return <span key={i} className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', bgColor)}><AlertTriangle className="h-3.5 w-3.5" />{issue}</span> })}</div>}</div> : (podData.podStatusLoading || podData.describeLoading || podData.eventsLoading) ? <div className="rounded-lg border border-border bg-secondary/30 p-4 text-center"><div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><p className="text-muted-foreground">{t('drilldown.status.analyzingPodHealth')}</p></div></div> : <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-center"><p className="font-medium text-green-400">{t('drilldown.status.podHealthy')}</p><p className="mt-1 text-xs text-muted-foreground">{t('drilldown.empty.noIssuesDetected')}</p></div>}</div>
          {podData.podDiagnosis && podData.issues.length > 0 && <div className="space-y-4 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4"><div className="flex items-start justify-between gap-4"><div className="space-y-1"><div className="flex items-center gap-2 text-orange-300"><AlertTriangle className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">{t('drilldown.diagnosis.title')}</span></div><h3 className="text-sm font-semibold text-foreground">{t(DIAGNOSIS_SUMMARY_KEYS[podData.podDiagnosis.kind])}</h3><p className="text-sm text-muted-foreground">{t('drilldown.diagnosis.subtitle')}</p></div>{(podData.podDiagnosis.lastExitReason || podData.podDiagnosis.exitCode) && <div className="rounded-lg border border-orange-500/30 bg-background/60 px-3 py-2 text-right"><div className="text-[11px] uppercase tracking-wide text-orange-300">{t('drilldown.diagnosis.lastExit')}</div><div className="font-mono text-sm text-foreground">{podData.podDiagnosis.lastExitReason || t('drilldown.diagnosis.unknownExit')}{podData.podDiagnosis.exitCode ? ` · ${t('drilldown.diagnosis.exitCode', { code: podData.podDiagnosis.exitCode })}` : ''}</div></div>}</div><div className="grid gap-4 lg:grid-cols-2"><div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('drilldown.diagnosis.evidenceTitle')}</h4><ul className="space-y-2 text-sm text-foreground">{diagnosisEvidence.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" /><span>{item}</span></li>)}</ul></div><div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('drilldown.diagnosis.nextStepsTitle')}</h4><ul className="space-y-2 text-sm text-foreground">{DIAGNOSIS_STEP_KEYS[podData.podDiagnosis.kind].map(stepKey => <li key={stepKey} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" /><span>{t(stepKey)}</span></li>)}</ul></div></div><div className="flex flex-wrap gap-2"><button onClick={() => setActiveTab('logs')} className="rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">{t('drilldown.actions.viewLogs')}</button><button onClick={() => setActiveTab('events')} className="rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">{t('drilldown.actions.viewEvents')}</button><button onClick={() => setActiveTab('yaml')} className="rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">{t('drilldown.diagnosis.reviewSpec')}</button>{agentConnected && actions.canDeletePod && isManagedPod && <button onClick={() => actions.setShowDeletePodConfirm(true)} disabled={actions.deletingPod} className={cn('rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-200 transition-colors hover:bg-orange-500/20', actions.deletingPod && 'opacity-50 cursor-not-allowed')}>{actions.deletingPod ? <><Loader2 className="inline w-3 h-3 animate-spin mr-1" />{t('common.deleting')}</> : t('drilldown.actions.restartResource')}</button>}</div></div>}
          {podData.eventsOutput && <div><div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Zap className="h-4 w-4 text-yellow-400" />{t('drilldown.tabs.recentEvents')}</h3><button onClick={() => setActiveTab('events')} className="rounded-lg bg-primary px-3 py-2 min-h-11 text-xs font-medium text-primary-foreground hover:bg-primary/90">View all</button></div><pre className="max-h-32 overflow-x-auto overflow-y-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground">{podData.eventsOutput.includes('No resources found') ? `No events found for pod ${podName}` : podData.eventsOutput.split('\n').slice(0, 6).join('\n')}</pre></div>}
        </div>}

        {activeTab === 'labels' && <Suspense fallback={<TabLoadingFallback />}><PodLabelsProvider describeLoading={podData.describeLoading} agentConnected={agentConnected} copiedField={copiedField} showAllLabels={showAllLabels} setShowAllLabels={setShowAllLabels} editingLabels={actions.editingLabels} setEditingLabels={actions.setEditingLabels} pendingLabelChanges={actions.pendingLabelChanges} newLabelKey={actions.newLabelKey} setNewLabelKey={actions.setNewLabelKey} newLabelValue={actions.newLabelValue} setNewLabelValue={actions.setNewLabelValue} labelSaving={actions.labelSaving} labelError={actions.labelError} handleLabelChange={actions.handleLabelChange} handleLabelRemove={actions.handleLabelRemove} undoLabelChange={actions.undoLabelChange} saveLabels={saveLabels} cancelLabelEdit={actions.cancelLabelEdit} showAllAnnotations={showAllAnnotations} setShowAllAnnotations={setShowAllAnnotations} editingAnnotations={actions.editingAnnotations} setEditingAnnotations={actions.setEditingAnnotations} pendingAnnotationChanges={actions.pendingAnnotationChanges} newAnnotationKey={actions.newAnnotationKey} setNewAnnotationKey={actions.setNewAnnotationKey} newAnnotationValue={actions.newAnnotationValue} setNewAnnotationValue={actions.setNewAnnotationValue} annotationSaving={actions.annotationSaving} annotationError={actions.annotationError} handleAnnotationChange={actions.handleAnnotationChange} handleAnnotationRemove={actions.handleAnnotationRemove} undoAnnotationChange={actions.undoAnnotationChange} saveAnnotations={saveAnnotations} cancelAnnotationEdit={actions.cancelAnnotationEdit} handleCopy={handleCopy} labelDiffByKey={labelDiffByKey} annotationDiffByKey={annotationDiffByKey}><PodLabelsTab labels={labels} annotations={annotations} /></PodLabelsProvider></Suspense>}

        {activeTab === 'related' && <Suspense fallback={<TabLoadingFallback />}><PodRelatedTab podName={podName} namespace={namespace} cluster={cluster} agentConnected={agentConnected} relatedLoading={actions.relatedLoading} ownerChain={ownerChain} configMaps={actions.configMaps} secrets={actions.secrets} pvcs={actions.pvcs} serviceAccount={actions.serviceAccount} fetchRelatedResources={actions.fetchRelatedResources} drillToDeployment={drillToDeployment} drillToReplicaSet={drillToReplicaSet} drillToConfigMap={drillToConfigMap} drillToSecret={drillToSecret} drillToServiceAccount={drillToServiceAccount} drillToPVC={drillToPVC} /></Suspense>}

        {activeTab === 'describe' && <Suspense fallback={<TabLoadingFallback />}><PodOutputTab output={podData.describeOutput} loading={podData.describeLoading} agentConnected={agentConnected} error={podData.describeError} copyField="describe" copiedField={copiedField} kubectlComment={`# kubectl describe pod ${podName} -n ${namespace}`} loadingMessage={t('drilldown.status.runningDescribe')} notConnectedMessage={t('drilldown.empty.connectAgentDescribe')} emptyMessage={t('drilldown.empty.failedFetchDescribe')} handleCopy={handleCopy} onRefresh={() => podData.fetchDescribe(true)} /></Suspense>}
        {activeTab === 'logs' && <Suspense fallback={<TabLoadingFallback />}><PodLogsSection podName={podName} namespace={namespace} output={podData.logsOutput} loading={podData.logsLoading} agentConnected={agentConnected} error={podData.logsError} copiedField={copiedField} loadingMessage={t('drilldown.status.fetchingLogs')} notConnectedMessage={t('drilldown.empty.connectAgentLogs')} emptyMessage={t('drilldown.empty.noLogsAvailable')} handleCopy={handleCopy} onRefresh={() => podData.fetchLogs(true)} /></Suspense>}
        {activeTab === 'exec' && <div className="h-[500px] overflow-hidden rounded-lg border border-border"><Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading terminal…</div>}><PodExecTerminal cluster={cluster} namespace={namespace} pod={podName} containers={containerNames} defaultContainer={containerNames[0]} /></Suspense></div>}
        {activeTab === 'events' && <Suspense fallback={<TabLoadingFallback />}><PodEventsSection namespace={namespace} podName={podName} output={podData.eventsOutput} loading={podData.eventsLoading} agentConnected={agentConnected} error={podData.eventsError} copiedField={copiedField} loadingMessage={t('drilldown.status.fetchingEvents')} notConnectedMessage={t('drilldown.empty.connectAgentEvents')} emptyMessage={t('drilldown.empty.noEventsFound', { resource: 'pod' })} handleCopy={handleCopy} onRefresh={() => podData.fetchEvents(true)} /></Suspense>}
        {activeTab === 'yaml' && <Suspense fallback={<TabLoadingFallback />}><PodYamlSection podName={podName} namespace={namespace} output={podData.yamlOutput} loading={podData.yamlLoading} agentConnected={agentConnected} error={podData.yamlError} copiedField={copiedField} loadingMessage={t('drilldown.status.fetchingYaml')} notConnectedMessage={t('drilldown.empty.connectAgentYaml')} emptyMessage={t('drilldown.empty.failedFetchYaml')} handleCopy={handleCopy} onRefresh={() => podData.fetchYaml(true)} /></Suspense>}
      </div>

      {agentConnected && podData.issues.length > 0 && <div className="border-t border-border bg-card">{backendActionUnavailable && <div className="px-4 pt-4"><div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{backendUnavailableMessage}</span></div></div>}<Suspense fallback={<TabLoadingFallback />}><PodAiAnalysis aiAnalysis={aiAnalysis} aiAnalysisLoading={aiAnalysisLoading} aiAnalysisError={aiAnalysisError} actionsDisabled={backendActionUnavailable} actionsDisabledReason={backendUnavailableMessage} fetchAiAnalysis={() => { void fetchAiAnalysis() }} handleRepairPod={handleRepairPod} /></Suspense><PodDeleteSection podName={podName} agentConnected={agentConnected} backendUnavailable={backendActionUnavailable} backendUnavailableReason={backendUnavailableMessage} canDeletePod={actions.canDeletePod} deletingPod={actions.deletingPod} deleteError={actions.deleteError} showDeletePodConfirm={actions.showDeletePodConfirm} setShowDeletePodConfirm={actions.setShowDeletePodConfirm} isManagedPod={isManagedPod} handleDeletePod={actions.handleDeletePod} /></div>}

      <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} errorMessage={errorMessage} fallbackContent={podData.eventsOutput && !podData.eventsOutput.includes('No resources found') ? <div><p className="mb-1.5 text-xs font-medium text-foreground">Pod Events (non-AI troubleshooting):</p><pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap text-[10px] text-muted-foreground">{podData.eventsOutput.split('\n').slice(0, 10).join('\n')}</pre></div> : null} />
    </div>
  )
}
