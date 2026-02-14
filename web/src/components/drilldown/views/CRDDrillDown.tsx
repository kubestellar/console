import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  Package, Info, Loader2, Server, Stethoscope,
  CheckCircle, XCircle, AlertTriangle,
  FileText, Code, Database, List
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import {
  AIActionBar,
  useModalAI,
  type ResourceContext,
} from '../../modals'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'versions' | 'instances' | 'schema' | 'ai'

// CRD condition styles
const getConditionStyle = (status: string) => {
  const lower = status?.toLowerCase() || ''
  if (lower === 'true' || lower === 'established') {
    return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', icon: CheckCircle }
  }
  if (lower === 'false' || lower === 'failed') {
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', icon: XCircle }
  }
  return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', icon: AlertTriangle }
}

interface CRDVersion {
  name: string
  served: boolean
  storage: boolean
  deprecated?: boolean
  deprecationWarning?: string
}

interface CRDVersionRaw {
  name: string
  served: boolean
  storage: boolean
  deprecated?: boolean
  deprecationWarning?: string
  schema?: { openAPIV3Schema?: Record<string, unknown> }
}

interface CRDInstance {
  name: string
  namespace?: string
  creationTimestamp?: string
}

interface CRDInstanceRaw {
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
  }
}

interface CRDCondition {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
}

interface CRDConditionRaw {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
}

export function CRDDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const crdName = data.crd as string

  // Additional CRD data
  const crdGroup = data.group as string | undefined
  const crdKind = (data.kind as string) || 'Unknown'
  const crdScope = (data.scope as string) || 'Namespaced'

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToCluster, drillToNamespace } = useDrillDownActions()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [versions, setVersions] = useState<CRDVersion[] | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [instances, setInstances] = useState<CRDInstance[] | null>(null)
  const [instancesLoading, setInstancesLoading] = useState(false)
  const [conditions, setConditions] = useState<CRDCondition[] | null>(null)
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [aiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading] = useState(false)

  // Check if established
  const isEstablished = conditions?.some(c => c.type === 'Established' && c.status === 'True') ?? true

  // Resource context for AI actions
  const resourceContext: ResourceContext = {
    kind: 'CRD',
    name: crdName,
    cluster,
    status: isEstablished ? 'Established' : 'Not Established',
  }

  // Check for issues
  const hasIssues = !isEstablished
  const issues = hasIssues
    ? [{ name: crdName, message: 'CRD not established', severity: 'warning' }]
    : []

  // Use modal AI hook
  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
    additionalContext: {
      group: crdGroup,
      kind: crdKind,
      scope: crdScope,
    },
  })

  // Helper to run kubectl commands
  const runKubectl = (args: string[]): Promise<string> => {
    return new Promise((resolve) => {
      const ws = new WebSocket('ws://127.0.0.1:8585/ws')
      const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''

      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || '')
      }, 15000)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args }
        }))
      }
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId && msg.payload?.output) {
          output = msg.payload.output
        }
        clearTimeout(timeout)
        ws.close()
        resolve(output)
      }
      ws.onerror = () => {
        clearTimeout(timeout)
        ws.close()
        resolve(output || '')
      }
    })
  }

  // Fetch CRD details
  const fetchCRDDetails = async () => {
    if (!agentConnected || versions) return
    setVersionsLoading(true)
    try {
      const output = await runKubectl([
        'get', 'crd', crdName, '-o', 'json'
      ])
      if (output) {
        const crd = JSON.parse(output)
        // Get versions
        const vers = crd.spec?.versions || []
        setVersions(vers.map((v: CRDVersionRaw) => ({
          name: v.name,
          served: v.served,
          storage: v.storage,
          deprecated: v.deprecated,
          deprecationWarning: v.deprecationWarning,
        })))

        // Get conditions
        const conds = crd.status?.conditions || []
        setConditions(conds.map((c: CRDConditionRaw) => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
          lastTransitionTime: c.lastTransitionTime,
        })))

        // Get schema (from first served version)
        const servedVersion = vers.find((v: CRDVersionRaw) => v.served)
        if (servedVersion?.schema?.openAPIV3Schema) {
          setSchema(servedVersion.schema.openAPIV3Schema)
        }
      }
    } catch {
      setVersions([])
      setConditions([])
    }
    setVersionsLoading(false)
  }

  // Fetch CRD instances
  const fetchInstances = async () => {
    if (!agentConnected || instances) return
    setInstancesLoading(true)
    try {
      // Get the plural form from the CRD name (before the first dot)
      const plural = crdName.split('.')[0]
      const output = await runKubectl([
        'get', plural, '-A', '-o', 'json'
      ])
      if (output) {
        const data = JSON.parse(output)
        const items = data.items || []
        setInstances(items.slice(0, 50).map((item: CRDInstanceRaw) => ({
          name: item.metadata?.name || 'Unknown',
          namespace: item.metadata?.namespace,
          creationTimestamp: item.metadata?.creationTimestamp,
        })))
      }
    } catch {
      setInstances([])
    }
    setInstancesLoading(false)
  }

  // Fetch schema separately if needed
  const fetchSchema = async () => {
    if (!agentConnected || schema) return
    setSchemaLoading(true)
    try {
      const output = await runKubectl([
        'get', 'crd', crdName, '-o', 'json'
      ])
      if (output) {
        const crd = JSON.parse(output)
        const vers = crd.spec?.versions || []
        const servedVersion = vers.find((v: CRDVersionRaw) => v.served)
        if (servedVersion?.schema?.openAPIV3Schema) {
          setSchema(servedVersion.schema.openAPIV3Schema)
        }
      }
    } catch {
      // Schema not available
    }
    setSchemaLoading(false)
  }

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      await Promise.all([fetchCRDDetails(), fetchInstances()])
    }
    loadData()
  }, [agentConnected])

  // Start AI diagnosis
  const handleDiagnose = () => {
    const deprecatedVersions = versions?.filter(v => v.deprecated) || []
    const prompt = `Analyze this CustomResourceDefinition "${crdName}".

CRD Details:
- Name: ${crdName}
- Group: ${crdGroup || 'Unknown'}
- Kind: ${crdKind}
- Scope: ${crdScope}
- Established: ${isEstablished ? 'Yes' : 'No'}

Versions:
${versions?.map(v => `- ${v.name}: served=${v.served}, storage=${v.storage}${v.deprecated ? ' (DEPRECATED)' : ''}`).join('\n') || 'Unknown'}

${deprecatedVersions.length > 0 ? `
⚠️ Deprecated Versions Found:
${deprecatedVersions.map(v => `- ${v.name}: ${v.deprecationWarning || 'No warning message'}`).join('\n')}
` : ''}

Instances: ${instances?.length || 0} found

Please:
1. Assess the CRD health and version strategy
2. Identify deprecated versions and migration paths
3. Check for API compatibility issues
4. Analyze the schema for best practices
5. Suggest improvements for CRD management`

    startMission({
      title: `Diagnose CRD: ${crdName}`,
      description: `Analyze CustomResourceDefinition health and versions`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: prompt,
      context: {
        kind: 'CRD',
        name: crdName,
        cluster,
        group: crdGroup,
      },
    })
  }

  const statusStyle = getConditionStyle(isEstablished ? 'True' : 'False')
  const StatusIcon = statusStyle.icon

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'versions', label: `Versions (${versions?.length || 0})`, icon: List },
    { id: 'instances', label: `Instances (${instances?.length || 0})`, icon: Database },
    { id: 'schema', label: 'Schema', icon: Code },
    { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <button
              onClick={() => drillToCluster(cluster)}
              className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
              <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
              <svg className="w-3 h-3 text-blue-400/50 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{crdScope}</span>
            <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1', statusStyle.bg, statusStyle.text, 'border', statusStyle.border)}>
              <StatusIcon className="w-3 h-3" />
              {isEstablished ? 'Established' : 'Not Established'}
            </span>
          </div>
        </div>
      </div>

      {/* AI Action Bar */}
      <div className="px-6 pb-4">
        <AIActionBar
          resource={resourceContext}
          actions={defaultAIActions}
          onAction={handleAIAction}
          issueCount={issues.length}
          compact={false}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id === 'schema' && !schema) {
                    fetchSchema()
                  }
                }}
                className={cn(
                  'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* CRD Info Card */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
              <div className="flex items-start gap-3">
                <Package className="w-8 h-8 text-purple-400 mt-1" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-foreground">{crdKind}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{crdName}</p>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                    {crdGroup && (
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        <span>Group: {crdGroup}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Database className="w-4 h-4" />
                      <span>Scope: {crdScope}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className={cn('text-2xl font-bold', statusStyle.text)}>
                  <StatusIcon className="w-8 h-8" />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('common.status')}</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{versions?.length || '-'}</div>
                <div className="text-xs text-muted-foreground">Versions</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-2xl font-bold text-foreground">{instances?.length || '-'}</div>
                <div className="text-xs text-muted-foreground">Instances</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <div className="text-sm font-medium text-foreground">{crdScope}</div>
                <div className="text-xs text-muted-foreground">{t('common.scope')}</div>
              </div>
            </div>

            {/* Conditions */}
            {conditions && conditions.length > 0 && (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <h4 className="text-sm font-medium text-foreground mb-3">{t('common.conditions')}</h4>
                <div className="space-y-2">
                  {conditions.map((condition, i) => {
                    const condStyle = getConditionStyle(condition.status)
                    return (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                        <span className="text-sm text-foreground">{condition.type}</span>
                        <span className={cn('px-2 py-0.5 rounded text-xs', condStyle.bg, condStyle.text)}>
                          {condition.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'versions' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">API Versions</h4>
            {versionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : versions && versions.length > 0 ? (
              <div className="space-y-2">
                {versions.map((version, i) => (
                  <div
                    key={i}
                    className={cn(
                      'p-4 rounded-lg border bg-card/50',
                      version.deprecated ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{version.name}</span>
                        {version.storage && (
                          <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">{t('common.storage')}</span>
                        )}
                        {version.deprecated && (
                          <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">Deprecated</span>
                        )}
                      </div>
                      <span className={cn(
                        'px-2 py-0.5 rounded text-xs',
                        version.served ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      )}>
                        {version.served ? 'Served' : 'Not Served'}
                      </span>
                    </div>
                    {version.deprecationWarning && (
                      <p className="text-sm text-yellow-400">{version.deprecationWarning}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <List className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No version information available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'instances' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Custom Resource Instances ({instances?.length || 0})</h4>
            {instancesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : instances && instances.length > 0 ? (
              <div className="space-y-2">
                {instances.map((instance, i) => (
                  <div
                    key={i}
                    onClick={() => instance.namespace && drillToNamespace(cluster, instance.namespace)}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border border-border bg-card/50',
                      instance.namespace && 'cursor-pointer hover:bg-card/80 transition-colors'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-purple-400" />
                      <div>
                        <span className="text-sm font-medium text-foreground">{instance.name}</span>
                        {instance.namespace && (
                          <span className="text-xs text-muted-foreground ml-2">({instance.namespace})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {instance.creationTimestamp && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(instance.creationTimestamp).toLocaleDateString()}
                        </span>
                      )}
                      {instance.namespace && (
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No instances found</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'schema' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">OpenAPI Schema</h4>
            {schemaLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : schema ? (
              <div className="p-4 rounded-lg border border-border bg-card/50">
                <pre className="text-sm text-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-[60vh]">
                  {JSON.stringify(schema, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Code className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Schema not available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ConsoleAIIcon className="w-5 h-5" />
                AI Analysis
              </h4>
              <button
                onClick={handleDiagnose}
                disabled={!isAgentConnected}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Stethoscope className="w-4 h-4" />
                Analyze CRD
              </button>
            </div>

            {!isAgentConnected ? (
              <div className="text-center py-12 text-muted-foreground">
                <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>AI agent not connected</p>
                <p className="text-xs mt-1">Configure the local agent in Settings to enable AI analysis</p>
              </div>
            ) : aiAnalysisLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              </div>
            ) : aiAnalysis ? (
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <pre className="whitespace-pre-wrap text-sm text-foreground">{aiAnalysis}</pre>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Click "Analyze CRD" to get AI-powered analysis</p>
                <p className="text-xs mt-1">AI will analyze the CRD and suggest improvements</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
