import { useState, useEffect, useRef } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { appendWsAuthToken } from '../../../lib/utils/wsAuth'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { Globe, Server, Info, Tag, Loader2, Copy, Check, ExternalLink, Activity } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../../../lib/clipboard'
import {
  deriveServiceHealth,
  SERVICE_HEALTH_DOT_CLASSES,
  SERVICE_HEALTH_LABELS,
} from '../../../lib/services/serviceHealth'

interface Props {
  data: Record<string, unknown>
}

type TabType = 'overview' | 'endpoints' | 'describe' | 'yaml'

/** Timeout for kubectl WebSocket commands (milliseconds) */
const KUBECTL_TIMEOUT_MS = 10_000

export default function ServiceDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const serviceName = data.service as string
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToNamespace, drillToCluster, drillToPod } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [serviceType, setServiceType] = useState<string>((data.type as string) || 'ClusterIP')
  const [clusterIP, setClusterIP] = useState<string>((data.clusterIP as string) || '')
  const [externalIPs, setExternalIPs] = useState<string[]>((data.externalIPs as string[]) || (data.externalIP ? [data.externalIP as string] : []))
  const [ports, setPorts] = useState<string[]>((data.ports as string[]) || [])
  const [endpointCount, setEndpointCount] = useState<number | undefined>(data.endpoints as number | undefined)
  const [lbStatus, setLbStatus] = useState<string>((data.lbStatus as string) || '')
  const [selector, setSelector] = useState<Record<string, string> | null>((data.selector as Record<string, string>) || null)
  const [labels, setLabels] = useState<Record<string, string> | null>(null)
  const [, setAnnotations] = useState<Record<string, string> | null>(null)
  const [endpointAddresses, setEndpointAddresses] = useState<Array<{ ip: string; nodeName?: string; targetRef?: string }>>([])
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Helper to run kubectl commands
  const runKubectl = async (args: string[]): Promise<string> => {
    const wsUrl = await appendWsAuthToken(LOCAL_AGENT_WS_URL)
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl)
      const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''
      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || 'Command timed out')
      }, KUBECTL_TIMEOUT_MS)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, namespace, args },
        }))
      }
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.id === requestId) {
            clearTimeout(timeout)
            output = msg.payload?.output || msg.payload?.error || ''
            ws.close()
            resolve(output)
          }
        } catch { /* ignore */ }
      }
      ws.onerror = () => { clearTimeout(timeout); resolve('Agent connection error') }
      ws.onclose = () => { clearTimeout(timeout); resolve(output || 'Connection closed') }
    })
  }

  // Fetch service details on mount
  const fetchedRef = useRef(false)
  useEffect(() => {
    if (!agentConnected || fetchedRef.current) return
    fetchedRef.current = true
    setIsLoading(true)

    const fetchDetails = async () => {
      try {
        const raw = await runKubectl(['get', 'service', serviceName, '-n', namespace, '-o', 'json'])
        const svc = JSON.parse(raw)
        const spec = svc.spec || {}
        const status = svc.status || {}

        setServiceType(spec.type || 'ClusterIP')
        setClusterIP(spec.clusterIP || '')
        setPorts((spec.ports || []).map((p: { port: number; protocol?: string; nodePort?: number; name?: string }) => {
          const base = p.nodePort ? `${p.port}:${p.nodePort}/${p.protocol || 'TCP'}` : `${p.port}/${p.protocol || 'TCP'}`
          return p.name ? `${p.name}: ${base}` : base
        }))

        // External IPs: combine spec.externalIPs and status.loadBalancer.ingress
        const allExternalIPs: string[] = []
        if (spec.externalIPs) {
          allExternalIPs.push(...spec.externalIPs)
        }
        const ingress = status.loadBalancer?.ingress || []
        for (const entry of ingress) {
          if (entry.ip) allExternalIPs.push(entry.ip)
          else if (entry.hostname) allExternalIPs.push(entry.hostname)
        }
        setExternalIPs(allExternalIPs)

        // LB status
        if (spec.type === 'LoadBalancer') {
          setLbStatus(ingress.length > 0 ? 'Ready' : 'Provisioning')
        }

        setSelector(spec.selector || null)
        setLabels(svc.metadata?.labels || null)
        setAnnotations(svc.metadata?.annotations || null)
      } catch { /* ignore parse errors */ }

      // Fetch endpoints
      try {
        const epRaw = await runKubectl(['get', 'endpoints', serviceName, '-n', namespace, '-o', 'json'])
        const ep = JSON.parse(epRaw)
        const addrs: Array<{ ip: string; nodeName?: string; targetRef?: string }> = []
        for (const subset of (ep.subsets || [])) {
          for (const addr of (subset.addresses || [])) {
            addrs.push({
              ip: addr.ip,
              nodeName: addr.nodeName,
              targetRef: addr.targetRef?.name,
            })
          }
        }
        setEndpointAddresses(addrs)
        setEndpointCount(addrs.length)
      } catch { /* ignore */ }

      setIsLoading(false)
    }

    fetchDetails()
  }, [agentConnected, cluster, namespace, serviceName])

  const handleCopy = async (text: string, field: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), UI_FEEDBACK_TIMEOUT_MS)
    }
  }

  const health = deriveServiceHealth({
    endpoints: endpointCount,
    selector: selector || undefined,
    lbStatus,
    type: serviceType,
  })

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: t('drilldown.overview', 'Overview') },
    { id: 'endpoints', label: t('drilldown.endpoints', 'Endpoints') },
    { id: 'describe', label: t('drilldown.describe', 'Describe') },
    { id: 'yaml', label: t('drilldown.yaml', 'YAML') },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-cyan-500/10">
          {serviceType === 'LoadBalancer' ? (
            <Globe className="w-5 h-5 text-blue-400" />
          ) : serviceType === 'ExternalName' ? (
            <ExternalLink className="w-5 h-5 text-orange-400" />
          ) : (
            <Server className="w-5 h-5 text-green-400" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{serviceName}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="cursor-pointer hover:text-foreground"
              onClick={() => drillToNamespace(cluster, namespace)}
            >
              {namespace}
            </span>
            <span>/</span>
            <span
              className="cursor-pointer hover:text-foreground"
              onClick={() => drillToCluster(cluster)}
            >
              <ClusterBadge cluster={cluster} size="sm" />
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Health dot */}
          <span
            className={`w-3 h-3 rounded-full ${SERVICE_HEALTH_DOT_CLASSES[health]}`}
            title={SERVICE_HEALTH_LABELS[health]}
          />
          <span className={cn(
            'px-2 py-0.5 rounded text-xs',
            serviceType === 'LoadBalancer' ? 'bg-blue-500/10 text-blue-400' :
            serviceType === 'NodePort' ? 'bg-purple-500/10 text-purple-400' :
            serviceType === 'ExternalName' ? 'bg-orange-500/10 text-orange-400' :
            'bg-green-500/10 text-green-400'
          )}>
            {serviceType}
          </span>
          {lbStatus && (
            <span className={cn(
              'px-2 py-0.5 rounded text-xs',
              lbStatus === 'Ready' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
            )}>
              {lbStatus}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-2 text-sm transition-colors',
              activeTab === tab.id
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading service details...</span>
            </div>
          ) : (
            <>
              {/* Key details grid */}
              <div className="grid grid-cols-2 gap-3">
                <InfoField
                  label="Type"
                  value={serviceType}
                  icon={<Info className="w-3.5 h-3.5" />}
                  onCopy={() => handleCopy(serviceType, 'type')}
                  copied={copiedField === 'type'}
                />
                <InfoField
                  label="Cluster IP"
                  value={clusterIP || 'None'}
                  icon={<Server className="w-3.5 h-3.5" />}
                  onCopy={clusterIP ? () => handleCopy(clusterIP, 'clusterIP') : undefined}
                  copied={copiedField === 'clusterIP'}
                />
                <InfoField
                  label="External IPs"
                  value={externalIPs.length > 0 ? externalIPs.join(', ') : 'None'}
                  icon={<Globe className="w-3.5 h-3.5" />}
                  onCopy={externalIPs.length > 0 ? () => handleCopy(externalIPs.join(', '), 'externalIP') : undefined}
                  copied={copiedField === 'externalIP'}
                />
                <InfoField
                  label="Endpoints"
                  value={endpointCount !== undefined ? `${endpointCount} ready` : 'Unknown'}
                  icon={<Activity className="w-3.5 h-3.5" />}
                />
              </div>

              {/* Ports */}
              {ports.length > 0 && (
                <div className="p-3 rounded-lg bg-secondary/30">
                  <div className="text-xs text-muted-foreground mb-2">Ports</div>
                  <div className="flex flex-wrap gap-2">
                    {ports.map((p, i) => (
                      <span key={i} className="px-2 py-1 rounded text-xs bg-secondary text-foreground font-mono">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Selector */}
              {selector && Object.keys(selector).length > 0 && (
                <div className="p-3 rounded-lg bg-secondary/30">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Selector
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(selector).map(([k, v]) => (
                      <span key={k} className="px-2 py-1 rounded text-xs bg-primary/10 text-primary font-mono">
                        {k}={v}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Labels */}
              {labels && Object.keys(labels).length > 0 && (
                <div className="p-3 rounded-lg bg-secondary/30">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Labels
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(labels).map(([k, v]) => (
                      <span key={k} className="px-2 py-1 rounded text-xs bg-secondary text-muted-foreground font-mono">
                        {k}={v}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'endpoints' && (
        <div className="space-y-3">
          {endpointAddresses.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No ready endpoints found for this service.
            </div>
          ) : (
            endpointAddresses.map((addr, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-between p-2 rounded-lg bg-secondary/30',
                  addr.targetRef ? 'cursor-pointer hover:bg-secondary/50' : ''
                )}
                onClick={() => {
                  if (addr.targetRef) {
                    drillToPod(cluster, namespace, addr.targetRef)
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-mono text-foreground">{addr.ip}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {addr.targetRef && (
                    <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded">
                      {addr.targetRef}
                    </span>
                  )}
                  {addr.nodeName && (
                    <span className="px-1.5 py-0.5 bg-secondary rounded">
                      {addr.nodeName}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'describe' && (
        <div>
          {!describeOutput && !describeLoading && (
            <button
              onClick={async () => {
                setDescribeLoading(true)
                const output = await runKubectl(['describe', 'service', serviceName, '-n', namespace])
                setDescribeOutput(output)
                setDescribeLoading(false)
              }}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm transition-colors"
            >
              Load Describe
            </button>
          )}
          {describeLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Running kubectl describe...
            </div>
          )}
          {describeOutput && (
            <div className="relative">
              <button
                onClick={() => handleCopy(describeOutput, 'describe')}
                className="absolute top-2 right-2 p-1 rounded bg-secondary hover:bg-secondary/80"
                title="Copy"
              >
                {copiedField === 'describe' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
              <pre className="p-3 rounded-lg bg-secondary/30 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {describeOutput}
              </pre>
            </div>
          )}
        </div>
      )}

      {activeTab === 'yaml' && (
        <div>
          {!yamlOutput && !yamlLoading && (
            <button
              onClick={async () => {
                setYamlLoading(true)
                const output = await runKubectl(['get', 'service', serviceName, '-n', namespace, '-o', 'yaml'])
                setYamlOutput(output)
                setYamlLoading(false)
              }}
              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm transition-colors"
            >
              Load YAML
            </button>
          )}
          {yamlLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading YAML...
            </div>
          )}
          {yamlOutput && (
            <div className="relative">
              <button
                onClick={() => handleCopy(yamlOutput, 'yaml')}
                className="absolute top-2 right-2 p-1 rounded bg-secondary hover:bg-secondary/80"
                title="Copy"
              >
                {copiedField === 'yaml' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
              <pre className="p-3 rounded-lg bg-secondary/30 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {yamlOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Reusable info field with optional copy button */
function InfoField({ label, value, icon, onCopy, copied }: {
  label: string
  value: string
  icon?: React.ReactNode
  onCopy?: () => void
  copied?: boolean
}) {
  return (
    <div className="p-3 rounded-lg bg-secondary/30">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground truncate" title={value}>{value}</span>
        {onCopy && (
          <button onClick={onCopy} className="p-2 min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-secondary shrink-0" title="Copy">
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
          </button>
        )}
      </div>
    </div>
  )
}
