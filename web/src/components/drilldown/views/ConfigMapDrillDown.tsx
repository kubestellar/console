import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { appendWsAuthToken } from '../../../lib/utils/wsAuth'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { FileText, Code, Info, Tag, ChevronDown, ChevronUp, Loader2, Copy, Check, Layers, Server, Database, Eye, EyeOff, Lock } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../../../lib/clipboard'
// #6231: switched from the regex-based maskSecretYaml that lived in
// SecretDrillDown to the shared js-yaml-based helper. Resource-agnostic
// name + shared module + correct block-scalar handling.
import { maskKubernetesYamlData } from '../../../lib/yamlMask'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'data' | 'describe' | 'yaml'

export function ConfigMapDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const configmapName = data.configmap as string
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [configmapData, setConfigmapData] = useState<Record<string, string> | null>(null)
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showAllData, setShowAllData] = useState(false)
  // Per-key reveal gate (#6211). ConfigMaps are NOT secrets, but teams
  // routinely store connection strings, passwords, and TLS material in them
  // so the value column needs the same opt-in reveal pattern that
  // SecretDrillDown uses on its Data tab — defaulting to masked, requiring
  // an explicit click to reveal. Unlike Secrets, ConfigMaps may legitimately
  // hold non-sensitive config too, so we expose a "Reveal all" master toggle
  // alongside the per-key buttons for the common case.
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [revealAll, setRevealAll] = useState(false)

  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isRevealed = (key: string) => revealAll || revealedKeys.has(key)

  // Helper to run kubectl commands
  const runKubectl = async (args: string[]): Promise<string> => {
    let wsUrl: string
    try {
      wsUrl = await appendWsAuthToken(LOCAL_AGENT_WS_URL)
    } catch {
      return ''
    }
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl)
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

  // Fetch ConfigMap data
  const fetchData = async () => {
    if (!agentConnected) return

    try {
      const output = await runKubectl(['get', 'configmap', configmapName, '-n', namespace, '-o', 'json'])
      if (output) {
        const cm = JSON.parse(output)
        setConfigmapData(cm.data || {})
        setLabels(cm.metadata?.labels || {})
      }
    } catch {
      // Ignore parse errors
    }
  }

  const fetchDescribe = async () => {
    if (!agentConnected || describeOutput) return
    setDescribeLoading(true)
    const output = await runKubectl(['describe', 'configmap', configmapName, '-n', namespace])
    setDescribeOutput(output)
    setDescribeLoading(false)
  }

  const fetchYaml = async () => {
    if (!agentConnected || yamlOutput) return
    setYamlLoading(true)
    const output = await runKubectl(['get', 'configmap', configmapName, '-n', namespace, '-o', 'yaml'])
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
  }, [agentConnected, fetchData, fetchDescribe, fetchYaml])

  const handleCopy = (field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.tabs.overview', 'Overview'), icon: Info },
    { id: 'data', label: t('drilldown.tabs.data', 'Data'), icon: Database },
    { id: 'describe', label: t('drilldown.tabs.describe', 'Describe'), icon: FileText },
    { id: 'yaml', label: t('drilldown.tabs.yaml', 'YAML'), icon: Code },
  ]

  const dataEntries = Object.entries(configmapData || {})
  const displayedData = showAllData ? dataEntries : dataEntries.slice(0, 5)

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
            <svg className="w-3 h-3 text-purple-400/70 group-hover:text-purple-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <svg className="w-3 h-3 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-yellow-400" />
                <div>
                  <div className="text-lg font-semibold text-foreground">{configmapName}</div>
                  <div className="text-sm text-muted-foreground">
                    {dataEntries.length} key{dataEntries.length !== 1 ? 's' : ''}
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

            {/* Data Preview */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Database className="w-4 h-4 text-yellow-400" />
                Data Keys
              </h3>
              {dataEntries.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {dataEntries.map(([key]) => (
                    <span key={key} className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 font-mono">
                      {key}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data in this ConfigMap</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="space-y-4">
            {/* #6211: master reveal toggle for ConfigMaps. ConfigMaps often
                hold non-sensitive config so a single "Reveal all" is more
                ergonomic than the per-key dance, but we keep the per-key
                buttons too for the case where a single sensitive value
                hides among harmless ones. */}
            {/* #6231: warning text now reflects the current revealAll
                state instead of always saying "hidden by default". */}
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                {revealAll
                  ? 'ConfigMap values are visible. Click "Mask all" to hide.'
                  : 'ConfigMap values are hidden by default. Click the eye icon to reveal.'}
              </div>
              <button
                onClick={() => setRevealAll(v => !v)}
                className="px-2 py-1 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-xs text-yellow-300 flex items-center gap-1"
              >
                {revealAll ? <><EyeOff className="w-3 h-3" /> Mask all</> : <><Eye className="w-3 h-3" /> Reveal all</>}
              </button>
            </div>
            {dataEntries.length > 0 ? (
              <>
                {displayedData.map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-card/50 border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-yellow-500/10 border-b border-border">
                      <span className="font-mono text-sm text-yellow-400">{key}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleReveal(key)}
                          className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                          aria-label={isRevealed(key) ? 'Mask value' : 'Reveal value'}
                          title={isRevealed(key) ? 'Mask value' : 'Reveal value'}
                        >
                          {isRevealed(key) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleCopy(`data-${key}`, isRevealed(key) ? value : '••••••••••••••••')}
                          className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                          aria-label={isRevealed(key) ? 'Copy value' : 'Reveal first to copy'}
                          title={isRevealed(key) ? 'Copy value' : 'Reveal first to copy the actual value'}
                        >
                          {copiedField === `data-${key}` ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <pre className="p-3 text-xs font-mono text-foreground whitespace-pre-wrap max-h-48 overflow-auto">
                      {isRevealed(key) ? value : '••••••••••••••••'}
                    </pre>
                  </div>
                ))}
                {dataEntries.length > 5 && (
                  <button
                    onClick={() => setShowAllData(!showAllData)}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    {showAllData ? (
                      <>Show less <ChevronUp className="w-3 h-3" /></>
                    ) : (
                      <>Show all {dataEntries.length} keys <ChevronDown className="w-3 h-3" /></>
                    )}
                  </button>
                )}
              </>
            ) : (
              <div className="p-4 rounded-lg bg-card/50 border border-border text-center text-muted-foreground">
                No data in this ConfigMap
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
          <div className="space-y-3">
            {/* #6211: same masking model the Data tab uses, applied to the
                YAML view so that tab isn't a bypass for the per-key reveal.
                ConfigMap YAML uses the same `data:` block shape as Secret
                YAML, so we share the maskKubernetesYamlData() helper. */}
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {revealAll
                ? 'ConfigMap values are visible. Use "Mask all" on the Data tab to hide.'
                : 'ConfigMap values are hidden by default. Use "Reveal all" on the Data tab to show.'}
            </div>
            {yamlLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{t('drilldown.status.fetchingYaml')}</span>
              </div>
            ) : yamlOutput ? (
              <div className="relative">
                {(() => {
                  const displayedYaml = revealAll ? yamlOutput : maskKubernetesYamlData(yamlOutput)
                  return (
                    <>
                      <button
                        onClick={() => handleCopy('yaml', displayedYaml)}
                        className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {copiedField === 'yaml' ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                      </button>
                      <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                        {displayedYaml}
                      </pre>
                    </>
                  )
                })()}
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
