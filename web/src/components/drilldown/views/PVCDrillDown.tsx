import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { appendWsAuthToken } from '../../../lib/utils/wsAuth'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { HardDrive, Code, Info, Tag, Loader2, Copy, Check, Layers, Server, Database } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../../../lib/clipboard'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'describe' | 'yaml'

/** Timeout for kubectl WebSocket commands (milliseconds) */
const KUBECTL_TIMEOUT_MS = 10_000

export function PVCDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const pvcName = data.pvc as string
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [status, setStatus] = useState<string>(data.status as string || '')
  const [capacity, setCapacity] = useState<string>(data.capacity as string || '')
  const [accessModes, setAccessModes] = useState<string[]>((data.accessModes as string[]) || [])
  const [storageClass, setStorageClass] = useState<string>(data.storageClass as string || '')
  const [volumeName, setVolumeName] = useState<string>(data.volumeName as string || '')
  const [volumeMode, setVolumeMode] = useState<string>('')
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [annotations, setAnnotations] = useState<Record<string, string> | null>(null)
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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
      }, KUBECTL_TIMEOUT_MS)

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

  // Fetch PVC data from cluster
  const fetchData = async () => {
    if (!agentConnected) return

    setIsLoading(true)
    try {
      const output = await runKubectl(['get', 'pvc', pvcName, '-n', namespace, '-o', 'json'])
      if (output) {
        const pvc = JSON.parse(output)
        setStatus(pvc.status?.phase || '')
        setCapacity(pvc.status?.capacity?.storage || pvc.spec?.resources?.requests?.storage || '')
        setAccessModes(pvc.spec?.accessModes || [])
        setStorageClass(pvc.spec?.storageClassName || '')
        setVolumeName(pvc.spec?.volumeName || '')
        setVolumeMode(pvc.spec?.volumeMode || 'Filesystem')
        setLabels(pvc.metadata?.labels || null)
        setAnnotations(pvc.metadata?.annotations || null)
      }
    } catch {
      // Parse error — keep data from props
    } finally {
      setIsLoading(false)
    }
  }

  const fetchedRef = useRef(false)
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true
      void fetchData()
    }
  }, [agentConnected])

  const fetchDescribe = async () => {
    if (!agentConnected || describeLoading) return
    setDescribeLoading(true)
    const output = await runKubectl(['describe', 'pvc', pvcName, '-n', namespace])
    setDescribeOutput(output || 'No output received')
    setDescribeLoading(false)
  }

  const fetchYaml = async () => {
    if (!agentConnected || yamlLoading) return
    setYamlLoading(true)
    const output = await runKubectl(['get', 'pvc', pvcName, '-n', namespace, '-o', 'yaml'])
    setYamlOutput(output || 'No output received')
    setYamlLoading(false)
  }

  const handleCopy = async (text: string, field: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), UI_FEEDBACK_TIMEOUT_MS)
    }
  }

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => void handleCopy(text, field)}
      className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copiedField === field ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )

  const statusColor = (() => {
    const s = status?.toLowerCase() || ''
    if (s === 'bound') return 'bg-green-500/20 text-green-400'
    if (s === 'pending') return 'bg-yellow-500/20 text-yellow-400'
    if (s === 'lost') return 'bg-red-500/20 text-red-400'
    return 'bg-gray-500/20 text-gray-400'
  })()

  const tabs: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.overview', 'Overview'), icon: Info },
    { id: 'describe', label: t('drilldown.describe', 'Describe'), icon: Code },
    { id: 'yaml', label: 'YAML', icon: Code },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{pvcName}</h2>
              {status && (
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusColor)}>
                  {status}
                </span>
              )}
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={() => drillToCluster(cluster)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ClusterBadge cluster={cluster} size="sm" />
              </button>
              <span className="text-muted-foreground">/</span>
              <button
                onClick={() => drillToNamespace(cluster, namespace)}
                className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                {namespace}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              if (tab.id === 'describe' && !describeOutput) void fetchDescribe()
              if (tab.id === 'yaml' && !yamlOutput) void fetchYaml()
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Key details grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Info className="w-4 h-4 text-blue-400" />
                {t('drilldown.details', 'Details')}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.status', 'Status')}</span>
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', statusColor)}>
                    {status || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.capacity', 'Capacity')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground font-mono">{capacity || 'N/A'}</span>
                    {capacity && <CopyButton text={capacity} field="capacity" />}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.accessModes', 'Access Modes')}</span>
                  <div className="flex items-center gap-1">
                    {(accessModes || []).length > 0 ? (
                      <div className="flex gap-1">
                        {accessModes.map(mode => (
                          <span key={mode} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs font-mono">
                            {mode}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.volumeMode', 'Volume Mode')}</span>
                  <span className="text-foreground">{volumeMode || 'Filesystem'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Database className="w-4 h-4 text-green-400" />
                {t('drilldown.storageInfo', 'Storage Info')}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.storageClass', 'Storage Class')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground font-mono">{storageClass || 'default'}</span>
                    {storageClass && <CopyButton text={storageClass} field="storageClass" />}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.boundVolume', 'Bound Volume')}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground font-mono text-xs">{volumeName || 'Unbound'}</span>
                    {volumeName && <CopyButton text={volumeName} field="volumeName" />}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.cluster', 'Cluster')}</span>
                  <button
                    onClick={() => drillToCluster(cluster)}
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span className="text-xs">{cluster}</span>
                  </button>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">{t('drilldown.namespace', 'Namespace')}</span>
                  <button
                    onClick={() => drillToNamespace(cluster, namespace)}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span className="text-xs">{namespace}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Labels */}
          {labels && Object.keys(labels).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-yellow-400" />
                {t('drilldown.labels', 'Labels')}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(labels).map(([key, value]) => (
                  <span key={key} className="px-2 py-1 rounded bg-secondary/50 text-xs font-mono text-foreground">
                    {key}={value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Annotations */}
          {annotations && Object.keys(annotations).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-muted-foreground" />
                {t('drilldown.annotations', 'Annotations')}
              </h3>
              <div className="space-y-1">
                {Object.entries(annotations).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <span className="font-mono text-muted-foreground break-all">{key}</span>
                    <span className="text-foreground break-all">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'describe' && (
        <div className="space-y-2">
          {!agentConnected ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('drilldown.agentRequiredDescribe', 'Connect kc-agent to run kubectl describe')}</p>
            </div>
          ) : describeLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : describeOutput ? (
            <div className="relative">
              <button
                onClick={() => void handleCopy(describeOutput, 'describe')}
                className="absolute top-2 right-2 p-1.5 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedField === 'describe' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <pre className="p-4 rounded-lg bg-secondary/30 border border-border text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-[50vh]">
                {describeOutput}
              </pre>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('drilldown.clickToFetchDescribe', 'Loading describe output...')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'yaml' && (
        <div className="space-y-2">
          {!agentConnected ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('drilldown.agentRequiredYaml', 'Connect kc-agent to view YAML')}</p>
            </div>
          ) : yamlLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : yamlOutput ? (
            <div className="relative">
              <button
                onClick={() => void handleCopy(yamlOutput, 'yaml')}
                className="absolute top-2 right-2 p-1.5 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedField === 'yaml' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <pre className="p-4 rounded-lg bg-secondary/30 border border-border text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-[50vh]">
                {yamlOutput}
              </pre>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">{t('drilldown.clickToFetchYaml', 'Loading YAML...')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PVCDrillDown
