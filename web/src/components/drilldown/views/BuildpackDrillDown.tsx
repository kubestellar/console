import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { ClusterBadge } from '../../ui/ClusterBadge'
import type { BuildpackStatus } from '../../cards/buildpacks-status/BuildpacksStatus'
import { Package, Layers, Server, Clock, FileText, History, Loader2, Stethoscope, Box, RefreshCw, GitBranch, AlertCircle, Check, Copy } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import {
  AIActionBar,
  useModalAI,
  type ResourceContext,
} from '../../modals'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'yaml' | 'builds' | 'logs' | 'ai'

type KpackConditionStatus = 'True' | 'False' | 'Unknown'

interface KpackCondition {
  type: string
  status: KpackConditionStatus
  reason?: string
  message?: string
  lastTransitionTime?: string
}

interface KpackImageStatus {
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
  }

  spec?: {
    builder?: {
      image?: string
    }
  }

  status?: {
    latestImage?: string
    conditions?: KpackCondition[]
  }
}

interface KpackBuild {
  metadata: {
    name: string
    creationTimestamp: string
  }
  status?: {
    conditions?: KpackCondition[]
  }
}

// Status styling helper
const getStatusStyle = (
  status: BuildpackStatus) => {
  switch (status) {
    case 'succeeded':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }
    case 'building':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
    case 'failed':
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
    case 'unknown':
    default:
      return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' }
  }
}

const mapConditionToBuildpackStatus = (
  condition?: KpackCondition
): BuildpackStatus => {
  if (!condition) return 'unknown'

  switch (condition.status) {
    case 'True':
      return 'succeeded'
    case 'False':
      return 'failed'
    case 'Unknown':
    default:
      return 'building'
  }
}

export function BuildpackDrillDown({ data }: Props) {
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const name = data.name as string
  const status = (data.status as BuildpackStatus) || 'unknown'
  const builder = data.builder as string

  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster } = useDrillDownActions()
  const { startMission } = useMissions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const [imageInfo, setImageInfo] = useState<KpackImageStatus | null>(null)
  const [imageYAML, setImageYAML] = useState<string | null>(null)
  const [builds, setBuilds] = useState<KpackBuild[]>([])
  const [logs, setLogs] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [buildsLoading, setBuildsLoading] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)
  
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const hasLoadedRef = useRef(false)

  const resourceContext: ResourceContext = {
    kind: 'BuildpackImage',
    name,
    cluster,
    namespace,
    status,
  }

  const issues =
    status.toLowerCase() === 'failed' || status.toLowerCase() === 'false'
      ? [{ name, message: `Build failed`, severity: 'critical' }]
      : []

  const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
    resource: resourceContext,
    issues,
  })

  const runKubectl = (args: string[]): Promise<string> => {
    return new Promise((resolve) => {
      const ws = new WebSocket(LOCAL_AGENT_WS_URL)
      const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''

      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || '')
      }, 15000) // 15 seconds timeout (same as runHelm)

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

  const fetchImageInfo = async () => {
    if (!agentConnected) return
    setLoading(true)
    try {
      const output = await runKubectl([
        'get',
        'image',
        name,
        '-n',
        namespace,
        '-o',
        'json',
      ])
      if (output) {
        const parsed = JSON.parse(output)
        setImageInfo(parsed)
      }
    } catch (error) {
      console.error('Failed to fetch image info:', error)
    }
    setLoading(false)
  }

  const fetchYAML = async () => {
    if (!agentConnected || imageYAML) return
    setYamlLoading(true)
    try {
      const output = await runKubectl([
        'get',
        'image',
        name,
        '-n',
        namespace,
        '-o',
        'yaml',
      ])
      setImageYAML(output || 'No YAML available')
    } catch (error) {
      setImageYAML('Error fetching YAML')
    }
    setYamlLoading(false)
  }

  const fetchBuilds = async () => {
    if (!agentConnected || builds.length > 0) return
    setBuildsLoading(true)
    try {
      const output = await runKubectl([
        'get',
        'build',
        '-n',
        namespace,
        '-l',
        `image.kpack.io/image=${name}`,
        '-o',
        'json',
      ])
      if (output) {
        const parsed = JSON.parse(output)
        setBuilds(parsed.items || [])
      }
    } catch (error) {
      console.error('Failed to fetch builds:', error)
      setBuilds([])
    }
    setBuildsLoading(false)
  }

  const fetchLogs = async () => {
    if (!agentConnected || logs) return
    setLogsLoading(true)

    try {
      // First, ensure we have builds
      let currentBuilds = builds
      if (currentBuilds.length === 0) {
        const output = await runKubectl([
          'get',
          'build',
          '-n',
          namespace,
          '-l',
          `image.kpack.io/image=${name}`,
          '-o',
          'json',
        ])
        if (output) {
          const parsed = JSON.parse(output)
          currentBuilds = parsed.items || []
          setBuilds(currentBuilds)
        }
      }

      if (currentBuilds.length > 0) {
        // Sort by creation time and get the latest
        const sorted = [...currentBuilds].sort((a, b) => {
          const timeA = new Date(a.metadata.creationTimestamp).getTime()
          const timeB = new Date(b.metadata.creationTimestamp).getTime()
          return timeB - timeA
        })
        const latestBuild = sorted[0]
        const buildName = latestBuild.metadata.name

        // Get logs from the build pod (kpack creates pods for builds)
        const output = await runKubectl([
          'logs',
          buildName,
          '-n',
          namespace,
          '--all-containers',
        ])
        setLogs(output || 'No logs available')
      } else {
        setLogs('No builds found for this image')
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error)
      setLogs('Error fetching logs')
    }

    setLogsLoading(false)
  }

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    
    const loadData = async () => {
      await fetchImageInfo()
      await fetchBuilds()
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentConnected])
  // Explanation: fetchImageInfo and fetchBuilds are intentionally excluded because:
  // 1. They are stable functions that don't change between renders
  // 2. Including them would cause unnecessary re-fetches
  // 3. hasLoadedRef ensures this effect only runs once when agent connects

  useEffect(() => {
    if (activeTab === 'yaml' && !imageYAML) fetchYAML()
    if (activeTab === 'logs' && !logs) fetchLogs()
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])
  // Explanation: imageYAML, logs, fetchYAML, and fetchLogs are intentionally excluded because:
  // 1. This effect should only run when activeTab changes (tab switching behavior)
  // 2. The conditional checks (imageYAML, logs) prevent redundant fetches
  // 3. Including the fetch functions would cause infinite loops
  // 4. Including the data (imageYAML, logs) would trigger unwanted re-fetches
  const handleDiagnose = () => {
    startMission({
      title: `Diagnose Buildpack: ${name}`,
      description: `Analyze buildpack health`,
      type: 'troubleshoot',
      cluster,
      initialPrompt: `Analyze this kpack Image:

Name: ${name}
Namespace: ${namespace}
Cluster: ${cluster}
Status: ${status}
Builder: ${builder}
${imageInfo?.status?.latestImage ? `Latest Image: ${imageInfo.status.latestImage}` : ''}

Check:
1. Build health and status
2. Common failure causes for this builder
3. Best practices for buildpack configuration
4. Performance and optimization suggestions
`,
      context: {
        kind: 'BuildpackImage',
        name,
        namespace,
        cluster,
        status,
      },
    })
  }

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const statusStyle = getStatusStyle(status)

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Package },
    { id: 'yaml', label: 'YAML', icon: FileText },
    { id: 'builds', label: 'Build History', icon: History },
    { id: 'logs', label: 'Logs', icon: Box },
    { id: 'ai', label: 'AI Analysis', icon: Stethoscope },
  ] as const

  // Extract useful info from imageInfo
  const latestImage = imageInfo?.status?.latestImage || 'N/A'
  const conditions = imageInfo?.status?.conditions || []
  const readyCondition = conditions.find((c: KpackCondition) => c.type === 'Ready')
  const builderImage = imageInfo?.spec?.builder?.image || builder

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <button
              onClick={() => drillToNamespace(cluster, namespace)}
              className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group"
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="text-muted-foreground">Namespace:</span>
              <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">
                {namespace}
              </span>
            </button>

            <button
              onClick={() => drillToCluster(cluster)}
              className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group"
            >
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-muted-foreground">Cluster:</span>
              <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
            </button>
          </div>

          <span
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium border',
              statusStyle.bg,
              statusStyle.text,
              statusStyle.border
            )}
          >
            {status.toUpperCase()}
          </span>
        </div>
      </div>

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
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Main Info Card */}
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-start gap-3">
                    <Package className="w-8 h-8 text-emerald-400 mt-1" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-foreground">{name}</h3>
                      <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="w-4 h-4" />
                          <span>Builder: {builderImage?.split('/').pop()?.split(':')[0] || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="w-4 h-4" />
                          <span>Status: {readyCondition?.status || status}</span>
                        </div>
                      </div>
                      {imageInfo?.metadata?.creationTimestamp && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>Created: {new Date(imageInfo.metadata.creationTimestamp).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg border border-border bg-card/50">
                    <div className="text-2xl font-bold text-foreground">{builds.length}</div>
                    <div className="text-xs text-muted-foreground">Total Builds</div>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-card/50">
                    <div className="text-2xl font-bold text-foreground">
                      {builds.filter(b => {
                        const condition = b.status?.conditions?.find(
                          (c: KpackCondition) => c.type === 'Succeeded'
                        )
                        return condition?.status === 'True'
                      }).length}
                    </div>
                    <div className="text-xs text-muted-foreground">Successful</div>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-card/50">
                    <div className="text-2xl font-bold text-foreground">
                      {conditions.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Conditions</div>
                  </div>
                </div>

                {/* Latest Image */}
                {latestImage !== 'N/A' && (
                  <div className="p-4 rounded-lg border border-border bg-card/50">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-foreground">Latest Image</h4>
                      <button
                        onClick={() => handleCopy('image', latestImage)}
                        className="p-1 hover:bg-secondary rounded"
                      >
                        {copiedField === 'image' ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-muted-foreground break-all">
                      {latestImage}
                    </pre>
                  </div>
                )}

                {/* Conditions */}
                {conditions.length > 0 && (
                  <div className="p-4 rounded-lg border border-border bg-card/50">
                    <h4 className="text-sm font-medium text-foreground mb-3">Conditions</h4>
                    <div className="space-y-2">
                      {conditions.map((condition: KpackCondition, i: number) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 rounded bg-card/50"
                        >
                          <div className="flex items-center gap-2">
                            {condition.status === 'True' ? (
                              <Check className="w-4 h-4 text-green-400" />
                            ) : condition.status === 'False' ? (
                              <AlertCircle className="w-4 h-4 text-red-400" />
                            ) : (
                              <Clock className="w-4 h-4 text-yellow-400" />
                            )}
                            <span className="text-sm text-foreground">{condition.type}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{condition.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'yaml' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">Image YAML</h4>
              {imageYAML && (
                <button
                  onClick={() => handleCopy('yaml', imageYAML)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedField === 'yaml' ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Copy
                </button>
              )}
            </div>
            {yamlLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <pre className="text-xs bg-card p-4 rounded border border-border overflow-x-auto max-h-[600px]">
                {imageYAML}
              </pre>
            )}
          </div>
        )}

        {activeTab === 'builds' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-foreground">Build History</h4>
            {buildsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : builds.length > 0 ? (
              <div className="space-y-2">
                {builds
                  .sort((a, b) => {
                    const timeA = new Date(a.metadata.creationTimestamp).getTime()
                    const timeB = new Date(b.metadata.creationTimestamp).getTime()
                    return timeB - timeA
                  })
                  .map((build, idx) => {
                    const buildStatus = build.status?.conditions?.find((c: KpackCondition) => c.type === 'Succeeded')
                    const mappedStatus = mapConditionToBuildpackStatus(buildStatus)
                    const statusStyle = getStatusStyle(mappedStatus)
                    return (
                      <div
                        key={build.metadata.name}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-sm font-medium">
                            {builds.length - idx}
                          </div>
                          <div>
                            <div className="text-sm text-foreground font-mono">
                              {build.metadata.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {buildStatus?.reason || 'Build triggered'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn('px-2 py-0.5 rounded text-xs', statusStyle.bg, statusStyle.text)}>
                            {mappedStatus === 'succeeded'
                            ? 'Success'
                            : mappedStatus === 'failed'
                            ? 'Failed'
                            : 'Building'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(build.metadata.creationTimestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No builds found</p>
                <p className="text-xs mt-1">Connect the agent to fetch build history</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">Latest Build Logs</h4>
              {logs && (
                <button
                  onClick={() => handleCopy('logs', logs)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedField === 'logs' ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  Copy
                </button>
              )}
            </div>
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <pre className="text-xs bg-card p-4 rounded border border-border max-h-[500px] overflow-auto">
                {logs}
              </pre>
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
                Analyze Buildpack
              </button>
            </div>

            {!isAgentConnected ? (
              <div className="text-center py-12 text-muted-foreground">
                <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>AI agent not connected</p>
                <p className="text-xs mt-1">Configure the local agent in Settings to enable AI analysis</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <h5 className="text-sm font-medium text-purple-400 mb-2">Available AI Actions</h5>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5" />
                      <span>Build health and status analysis</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5" />
                      <span>Builder configuration review</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5" />
                      <span>Build failure diagnosis</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5" />
                      <span>Optimization recommendations</span>
                    </li>
                  </ul>
                </div>
                <div className="text-center py-8 text-muted-foreground">
                  <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Click "Analyze Buildpack" to get AI-powered insights</p>
                  <p className="text-xs mt-1">AI will analyze the buildpack and suggest improvements</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
