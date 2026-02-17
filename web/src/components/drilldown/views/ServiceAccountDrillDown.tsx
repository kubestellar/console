import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { FileText, Code, Info, Tag, Loader2, Copy, Check, Layers, Server, Lock, User } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'secrets' | 'describe' | 'yaml'

export function ServiceAccountDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const serviceaccountName = data.serviceaccount as string
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToSecret } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [secrets, setSecrets] = useState<string[]>([])
  const [imagePullSecrets, setImagePullSecrets] = useState<string[]>([])
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [annotations, setAnnotations] = useState<Record<string, string> | null>(null)
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

  // Fetch ServiceAccount data
  const fetchData = async () => {
    if (!agentConnected) return

    try {
      const output = await runKubectl(['get', 'serviceaccount', serviceaccountName, '-n', namespace, '-o', 'json'])
      if (output) {
        const sa = JSON.parse(output)
        setSecrets(sa.secrets?.map((s: { name: string }) => s.name) || [])
        setImagePullSecrets(sa.imagePullSecrets?.map((s: { name: string }) => s.name) || [])
        setLabels(sa.metadata?.labels || {})
        setAnnotations(sa.metadata?.annotations || {})
      }
    } catch {
      // Ignore parse errors
    }
  }

  const fetchDescribe = async () => {
    if (!agentConnected || describeOutput) return
    setDescribeLoading(true)
    const output = await runKubectl(['describe', 'serviceaccount', serviceaccountName, '-n', namespace])
    setDescribeOutput(output)
    setDescribeLoading(false)
  }

  const fetchYaml = async () => {
    if (!agentConnected || yamlOutput) return
    setYamlLoading(true)
    const output = await runKubectl(['get', 'serviceaccount', serviceaccountName, '-n', namespace, '-o', 'yaml'])
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
        fetchDescribe(),
      ])

      // Batch 2: YAML (lower priority)
      await fetchYaml()
    }

    loadData()
  }, [agentConnected])

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'secrets', label: `Secrets (${secrets.length + imagePullSecrets.length})`, icon: Lock },
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
            {/* Basic Info */}
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8 text-purple-400" />
                <div>
                  <div className="text-lg font-semibold text-foreground">{serviceaccountName}</div>
                  <div className="text-sm text-muted-foreground">
                    {secrets.length} secret{secrets.length !== 1 ? 's' : ''} • {imagePullSecrets.length} image pull secret{imagePullSecrets.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </div>

            {/* Labels */}
            {labels && Object.keys(labels).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-400" />
                  Labels
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(labels).slice(0, 5).map(([key, value]) => (
                    <span key={key} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono">
                      {key}={value}
                    </span>
                  ))}
                  {Object.keys(labels).length > 5 && (
                    <span className="text-xs text-muted-foreground">+{Object.keys(labels).length - 5} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Annotations Preview */}
            {annotations && Object.keys(annotations).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">{t('common.annotations')}</h3>
                <div className="text-xs text-muted-foreground">{Object.keys(annotations).length} annotation{Object.keys(annotations).length !== 1 ? 's' : ''}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'secrets' && (
          <div className="space-y-6">
            {/* Mounted Secrets */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Lock className="w-4 h-4 text-red-400" />
                Secrets
              </h3>
              {secrets.length > 0 ? (
                <div className="space-y-2">
                  {secrets.map((secret) => (
                    <button
                      key={secret}
                      onClick={() => drillToSecret(cluster, namespace, secret)}
                      className="w-full p-3 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-red-400" />
                        <span className="font-mono text-red-400">{secret}</span>
                      </div>
                      <svg className="w-4 h-4 text-red-400/50 group-hover:text-red-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No secrets mounted</p>
              )}
            </div>

            {/* Image Pull Secrets */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-400" />
                Image Pull Secrets
              </h3>
              {imagePullSecrets.length > 0 ? (
                <div className="space-y-2">
                  {imagePullSecrets.map((secret) => (
                    <button
                      key={secret}
                      onClick={() => drillToSecret(cluster, namespace, secret)}
                      className="w-full p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-orange-400" />
                        <span className="font-mono text-orange-400">{secret}</span>
                      </div>
                      <svg className="w-4 h-4 text-orange-400/50 group-hover:text-orange-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No image pull secrets</p>
              )}
            </div>
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
