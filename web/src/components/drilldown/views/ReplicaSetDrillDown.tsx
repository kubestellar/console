import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { FileText, Code, Info, Tag, Zap, Loader2, Copy, Check, Layers, Server, Box } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { Gauge } from '../../charts/Gauge'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'pods' | 'events' | 'describe' | 'yaml'

export function ReplicaSetDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const replicasetName = data.replicaset as string
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod, drillToDeployment } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [replicas, setReplicas] = useState<number>(0)
  const [readyReplicas, setReadyReplicas] = useState<number>(0)
  const [pods, setPods] = useState<Array<{ name: string; status: string; restarts: number }>>([])
  const [ownerDeployment, setOwnerDeployment] = useState<string | null>(null)
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [eventsOutput, setEventsOutput] = useState<string | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Helper to run kubectl commands
  const runKubectl = (args: string[]): Promise<string> => {
    return new Promise((resolve) => {
      const ws = new WebSocket(LOCAL_AGENT_WS_URL)
      const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''

      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || '')
      }, 10000)

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

  // Fetch ReplicaSet data
  const fetchData = async () => {
    if (!agentConnected) return

    try {
      const output = await runKubectl(['get', 'replicaset', replicasetName, '-n', namespace, '-o', 'json'])
      if (output) {
        const rs = JSON.parse(output)
        setReplicas(rs.spec?.replicas || 0)
        setReadyReplicas(rs.status?.readyReplicas || 0)
        setLabels(rs.metadata?.labels || {})

        // Get owner deployment
        const ownerRef = rs.metadata?.ownerReferences?.find((o: { kind: string }) => o.kind === 'Deployment')
        if (ownerRef) {
          setOwnerDeployment(ownerRef.name)
        }

        // Get pods managed by this ReplicaSet
        const selector = Object.entries(rs.spec?.selector?.matchLabels || {})
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
        if (selector) {
          const podsOutput = await runKubectl(['get', 'pods', '-n', namespace, '-l', selector, '-o', 'json'])
          if (podsOutput) {
            const podList = JSON.parse(podsOutput)
            const podInfo = podList.items?.map((p: { metadata: { name: string }; status: { phase: string; containerStatuses?: Array<{ restartCount: number }> } }) => ({
              name: p.metadata.name,
              status: p.status.phase,
              restarts: p.status.containerStatuses?.reduce((sum: number, c: { restartCount: number }) => sum + c.restartCount, 0) || 0
            })) || []
            setPods(podInfo)
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  const fetchEvents = async () => {
    if (!agentConnected || eventsOutput) return
    setEventsLoading(true)
    const output = await runKubectl(['get', 'events', '-n', namespace, '--field-selector', `involvedObject.name=${replicasetName}`, '-o', 'wide'])
    setEventsOutput(output)
    setEventsLoading(false)
  }

  const fetchDescribe = async () => {
    if (!agentConnected || describeOutput) return
    setDescribeLoading(true)
    const output = await runKubectl(['describe', 'replicaset', replicasetName, '-n', namespace])
    setDescribeOutput(output)
    setDescribeLoading(false)
  }

  const fetchYaml = async () => {
    if (!agentConnected || yamlOutput) return
    setYamlLoading(true)
    const output = await runKubectl(['get', 'replicaset', replicasetName, '-n', namespace, '-o', 'yaml'])
    setYamlOutput(output)
    setYamlLoading(false)
  }

  // Track if we've already loaded data to prevent refetching
  const hasLoadedRef = useRef(false)

  // Pre-fetch tab data when agent connects
  // Batched to limit concurrent WebSocket connections (max 2 at a time)
  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      // Batch 1: Overview data (2 concurrent)
      await Promise.all([
        fetchData(),
        fetchEvents(),
      ])

      // Batch 2: Describe + YAML (2 concurrent, lower priority)
      await Promise.all([
        fetchDescribe(),
        fetchYaml(),
      ])
    }

    loadData()
  }, [agentConnected])

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const isHealthy = readyReplicas === replicas && replicas > 0

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'pods', label: `Pods (${pods.length})`, icon: Box },
    { id: 'events', label: 'Events', icon: Zap },
    { id: 'describe', label: 'Describe', icon: FileText },
    { id: 'yaml', label: 'YAML', icon: Code },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-6 text-sm">
          <button
            onClick={() => drillToNamespace(cluster, namespace)}
            className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
            <span className="font-mono text-purple-400 group-hover:text-purple-300 transition-colors">{namespace}</span>
            <svg className="w-3 h-3 text-purple-400/50 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
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
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => {
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

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Status */}
            <div className={`p-4 rounded-lg border ${isHealthy ? 'bg-green-500/10 border-green-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusIndicator status={isHealthy ? 'healthy' : 'warning'} size="lg" />
                  <div>
                    <div className="text-lg font-semibold text-foreground">
                      {isHealthy ? 'Healthy' : 'Degraded'}
                    </div>
                    <div className="text-sm text-muted-foreground">ReplicaSet</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Gauge value={readyReplicas} max={replicas} size="sm" />
                  <div className="text-right">
                    <div className="text-2xl font-bold text-foreground">{readyReplicas}/{replicas}</div>
                    <div className="text-xs text-muted-foreground">{t('drilldown.fields.replicasReady')}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Owner Deployment */}
            {ownerDeployment && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Owner Deployment</h3>
                <button
                  onClick={() => drillToDeployment(cluster, namespace, ownerDeployment)}
                  className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 flex items-center gap-2 text-sm group"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span className="font-mono">{ownerDeployment}</span>
                  <svg className="w-3 h-3 text-green-400/50 group-hover:text-green-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}

            {/* Labels */}
            {labels && Object.keys(labels).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-400" />
                  Labels
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(labels).slice(0, 8).map(([key, value]) => (
                    <span key={key} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono">
                      {key}={value}
                    </span>
                  ))}
                  {Object.keys(labels).length > 8 && (
                    <span className="text-xs text-muted-foreground">+{Object.keys(labels).length - 8} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pods' && (
          <div className="space-y-3">
            {pods.length > 0 ? (
              pods.map((pod) => (
                <button
                  key={pod.name}
                  onClick={() => drillToPod(cluster, namespace, pod.name, { status: pod.status, restarts: pod.restarts })}
                  className="w-full p-3 rounded-lg bg-card/50 border border-border hover:bg-card/80 flex items-center justify-between group transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Box className="w-5 h-5 text-cyan-400" />
                    <span className="font-mono text-foreground">{pod.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'text-xs px-2 py-1 rounded',
                      pod.status === 'Running' ? 'bg-green-500/20 text-green-400' :
                      pod.status === 'Pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    )}>
                      {pod.status}
                    </span>
                    {pod.restarts > 0 && (
                      <span className="text-xs text-yellow-400">{pod.restarts} restarts</span>
                    )}
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 rounded-lg bg-card/50 border border-border text-center text-muted-foreground">
                No pods found for this ReplicaSet
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div>
            {eventsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{t('drilldown.status.fetchingEvents')}</span>
              </div>
            ) : eventsOutput ? (
              <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                {eventsOutput.includes('No resources found') ? 'No events found for this ReplicaSet' : eventsOutput}
              </pre>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'describe' && (
          <div>
            {describeLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{t('drilldown.status.runningDescribe')}</span>
              </div>
            ) : describeOutput ? (
              <div className="relative">
                <button
                  onClick={() => handleCopy('describe', describeOutput)}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'describe' ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                  {describeOutput}
                </pre>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'yaml' && (
          <div>
            {yamlLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{t('drilldown.status.fetchingYaml')}</span>
              </div>
            ) : yamlOutput ? (
              <div className="relative">
                <button
                  onClick={() => handleCopy('yaml', yamlOutput)}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'yaml' ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
                <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                  {yamlOutput}
                </pre>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
