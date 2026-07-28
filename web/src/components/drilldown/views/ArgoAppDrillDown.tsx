import { useEffect, useRef, useState } from 'react'
import { Box, GitCommit, History, Info, RefreshCw, Stethoscope } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { useArgoCDTriggerSync } from '../../../hooks/useArgoCD'
import { cn } from '../../../lib/cn'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'
import { AIActionBar, useModalAI } from '../../modals'
import {
  ArgoAiTab,
  ArgoDiffTab,
  ArgoGitOpsTab,
  ArgoHeader,
  ArgoOverviewTab,
  ArgoResourcesTab,
  ArgoSyncHistoryPanel,
  buildArgoAIContext,
  getHealthStatusStyle,
  getSyncStatusStyle,
  type ArgoResource,
  type ArgoResourceRaw,
  type Props,
  type SyncHistory,
  type SyncHistoryRaw,
  type TabType,
} from './argo-app-drilldown'

export function ArgoAppDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const appName = data.app as string
  const syncStatus = (data.syncStatus as string) || 'Unknown'
  const healthStatus = (data.healthStatus as string) || 'Unknown'
  const repoURL = data.repoURL as string | undefined
  const targetRevision = data.targetRevision as string | undefined
  const path = data.path as string | undefined
  const project = data.project as string | undefined

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment, drillToService } = useDrillDownActions()
  const { close: closeDrillDown } = useDrillDown()
  const { startMission } = useMissions()
  const { triggerSync, isSyncing, lastResult: syncResult } = useArgoCDTriggerSync()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [appResources, setAppResources] = useState<ArgoResource[] | null>(null)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [syncHistory, setSyncHistory] = useState<SyncHistory[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [diffOutput, setDiffOutput] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const copiedFieldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)
  const hasLoadedRef = useRef(false)
  const restartTimestamp = new Date().toISOString()

  const { resourceContext, issues } = buildArgoAIContext({
    appName,
    cluster,
    namespace,
    syncStatus,
    healthStatus,
  })

  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      repoURL,
      targetRevision,
      path,
      project,
    },
  })

  const fetchResources = async () => {
    if (!agentConnected || appResources) return
    setResourcesLoading(true)
    try {
      const output = await runKubectl(['get', 'application.argoproj.io', appName, '-n', namespace, '-o', 'json'])
      if (output) {
        let app
        try {
          app = JSON.parse(output)
        } catch {
          setAppResources([])
          return
        }
        const resources = app.status?.resources || []
        setAppResources(resources.map((r: ArgoResourceRaw) => ({
          kind: r.kind,
          name: r.name,
          namespace: r.namespace || namespace,
          status: r.status,
          health: r.health?.status,
          syncWave: r.syncWave,
        })))
      }
    } catch {
      setAppResources([])
    }
    setResourcesLoading(false)
  }

  const fetchHistory = async () => {
    if (!agentConnected || syncHistory) return
    setHistoryLoading(true)
    try {
      const output = await runKubectl(['get', 'application.argoproj.io', appName, '-n', namespace, '-o', 'json'])
      if (output) {
        let app
        try {
          app = JSON.parse(output)
        } catch {
          setSyncHistory([])
          return
        }
        const history = app.status?.history || []
        setSyncHistory(history.map((h: SyncHistoryRaw) => ({
          revision: h.revision?.substring(0, 7) || 'Unknown',
          deployedAt: h.deployedAt,
          status: h.deployStartedAt ? 'Deployed' : 'Unknown',
          message: h.source?.repoURL,
        })).reverse())
      }
    } catch {
      setSyncHistory([])
    }
    setHistoryLoading(false)
  }

  const fetchDiff = async () => {
    if (!agentConnected || diffOutput) return
    setDiffLoading(true)
    try {
      const output = await runKubectl(['get', 'application.argoproj.io', appName, '-n', namespace, '-o', 'yaml'])
      setDiffOutput(output || 'No diff available')
    } catch {
      setDiffOutput('Error fetching diff')
    }
    setDiffLoading(false)
  }

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    const loadData = async () => {
      await Promise.all([fetchResources(), fetchHistory()])
    }
    loadData()
  }, [agentConnected, fetchResources, fetchHistory])

  useEffect(() => {
    if (activeTab === 'diff' && !diffOutput && !diffLoading) {
      fetchDiff()
    }
  }, [activeTab, diffOutput, diffLoading, fetchDiff])

  useEffect(() => {
    return () => {
      if (copiedFieldTimeoutRef.current) {
        clearTimeout(copiedFieldTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = (field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    if (copiedFieldTimeoutRef.current) {
      clearTimeout(copiedFieldTimeoutRef.current)
    }
    copiedFieldTimeoutRef.current = setTimeout(() => {
      setCopiedField(null)
      copiedFieldTimeoutRef.current = null
    }, UI_FEEDBACK_TIMEOUT_MS)
  }

  const handleDiagnose = () => {
    const prompt = `Analyze this ArgoCD application "${appName}" in namespace "${namespace}".

Application Details:
- Name: ${appName}
- Project: ${project || 'default'}
- Sync Status: ${syncStatus}
- Health Status: ${healthStatus}
- Repository: ${repoURL || 'Unknown'}
- Target Revision: ${targetRevision || 'HEAD'}
- Path: ${path || '/'}

Please:
1. Assess the application health — sync status, conditions, and resource state.
2. Tell me what you found, then ask:
   - "Should I fix the sync/health issues?"
   - "Should I trigger a manual sync?"
   - "Show me more details first"
3. If I pick an action, apply and verify. Then ask:
   - "Should I check other ArgoCD apps?"
   - "All done"`

    closeDrillDown()
    startMission({
      title: `Diagnose ArgoApp: ${appName}`,
      description: 'Analyze ArgoCD application health and sync status',
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'ArgoApplication',
        name: appName,
        namespace,
        cluster,
        syncStatus,
        healthStatus,
      },
    })
  }

  const handleResourceClick = (resource: ArgoResource) => {
    if (resource.kind === 'Deployment') {
      drillToDeployment(cluster, resource.namespace, resource.name)
    } else if (resource.kind === 'Service') {
      drillToService(cluster, resource.namespace, resource.name)
    } else if (resource.kind === 'Pod') {
      drillToPod(cluster, resource.namespace, resource.name)
    }
  }

  const syncStyle = getSyncStatusStyle(syncStatus)
  const healthStyle = getHealthStatusStyle(healthStatus)
  const tabs: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview'), icon: Info },
    { id: 'resources', label: t('drilldown.tabs.resources'), icon: Box },
    { id: 'history', label: t('drilldown.tabs.history'), icon: History },
    { id: 'diff', label: t('drilldown.tabs.manifest'), icon: GitCommit },
    { id: 'gitops', label: t('drilldown.argoApp.gitopsRestartTab'), icon: RefreshCw },
    { id: 'ai', label: t('drilldown.tabs.aiAnalysis'), icon: Stethoscope },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      <ArgoHeader
        cluster={cluster}
        namespace={namespace}
        syncStatus={syncStatus}
        healthStatus={healthStatus}
        syncStyle={syncStyle}
        healthStyle={healthStyle}
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

      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <ArgoOverviewTab
            appName={appName}
            project={project}
            targetRevision={targetRevision}
            repoURL={repoURL}
            path={path}
            syncStatus={syncStatus}
            healthStatus={healthStatus}
            syncStyle={syncStyle}
            healthStyle={healthStyle}
            appResources={appResources}
            syncHistory={syncHistory}
            onResourceClick={handleResourceClick}
            onShowMoreResources={() => setActiveTab('resources')}
          />
        )}

        {activeTab === 'resources' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Managed Resources ({appResources?.length || 0})</h4>
            <ArgoResourcesTab
              resourcesLoading={resourcesLoading}
              appResources={appResources}
              onResourceClick={handleResourceClick}
            />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Sync History</h4>
            <ArgoSyncHistoryPanel historyLoading={historyLoading} syncHistory={syncHistory} />
          </div>
        )}

        {activeTab === 'diff' && (
          <ArgoDiffTab
            diffOutput={diffOutput}
            diffLoading={diffLoading}
            copiedField={copiedField}
            onCopy={handleCopy}
          />
        )}

        {activeTab === 'gitops' && (
          <ArgoGitOpsTab
            appName={appName}
            namespace={namespace}
            syncStatus={syncStatus}
            isSyncing={isSyncing}
            syncResult={syncResult}
            copiedField={copiedField}
            restartTimestamp={restartTimestamp}
            onTriggerSync={triggerSync}
            onCopy={handleCopy}
          />
        )}

        {activeTab === 'ai' && (
          <ArgoAiTab
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
