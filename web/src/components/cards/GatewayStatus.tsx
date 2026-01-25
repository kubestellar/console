import { useState, useMemo } from 'react'
import { CheckCircle2, Clock, XCircle, Search, AlertCircle, ExternalLink, Globe, ArrowRight } from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { RefreshButton } from '../ui/RefreshIndicator'

// Gateway status types
type GatewayStatusType = 'Programmed' | 'Accepted' | 'Pending' | 'NotAccepted' | 'Unknown'

interface Listener {
  name: string
  protocol: string
  port: number
  hostname?: string
  attachedRoutes: number
}

interface Gateway {
  name: string
  namespace: string
  cluster: string
  gatewayClass: string
  status: GatewayStatusType
  addresses: string[]
  listeners: Listener[]
  attachedRoutes: number
  createdAt: string
}

// Demo data for Gateway API resources
const DEMO_GATEWAYS: Gateway[] = [
  {
    name: 'prod-gateway',
    namespace: 'gateway-system',
    cluster: 'us-east-1',
    gatewayClass: 'istio',
    status: 'Programmed',
    addresses: ['34.102.136.180'],
    listeners: [
      { name: 'http', protocol: 'HTTP', port: 80, attachedRoutes: 5 },
      { name: 'https', protocol: 'HTTPS', port: 443, hostname: '*.example.com', attachedRoutes: 8 },
    ],
    attachedRoutes: 13,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'api-gateway',
    namespace: 'api',
    cluster: 'us-west-2',
    gatewayClass: 'envoy-gateway',
    status: 'Programmed',
    addresses: ['10.0.0.50'],
    listeners: [
      { name: 'api', protocol: 'HTTP', port: 8080, attachedRoutes: 12 },
    ],
    attachedRoutes: 12,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'internal-gateway',
    namespace: 'internal',
    cluster: 'eu-central-1',
    gatewayClass: 'contour',
    status: 'Accepted',
    addresses: [],
    listeners: [
      { name: 'grpc', protocol: 'HTTPS', port: 443, attachedRoutes: 3 },
    ],
    attachedRoutes: 3,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'staging-gateway',
    namespace: 'staging',
    cluster: 'us-east-1',
    gatewayClass: 'nginx',
    status: 'Pending',
    addresses: [],
    listeners: [
      { name: 'http', protocol: 'HTTP', port: 80, attachedRoutes: 0 },
    ],
    attachedRoutes: 0,
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: 'legacy-gateway',
    namespace: 'legacy',
    cluster: 'on-prem-dc1',
    gatewayClass: 'traefik',
    status: 'NotAccepted',
    addresses: [],
    listeners: [],
    attachedRoutes: 0,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

const DEMO_STATS = {
  totalGateways: 8,
  programmedCount: 5,
  pendingCount: 2,
  failedCount: 1,
  totalRoutes: 42,
  clustersWithGatewayAPI: 4,
}

const getStatusIcon = (status: GatewayStatusType) => {
  switch (status) {
    case 'Programmed':
      return CheckCircle2
    case 'Accepted':
      return CheckCircle2
    case 'Pending':
      return Clock
    case 'NotAccepted':
      return XCircle
    default:
      return Clock
  }
}

const getStatusColors = (status: GatewayStatusType) => {
  switch (status) {
    case 'Programmed':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/20' }
    case 'Accepted':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/20' }
    case 'Pending':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/20' }
    case 'NotAccepted':
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/20' }
    default:
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/20' }
  }
}

interface GatewayStatusProps {
  config?: Record<string, unknown>
}

export function GatewayStatus({ config: _config }: GatewayStatusProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [localSearch, setLocalSearch] = useState('')

  // Filter gateways by local search
  const filteredGateways = useMemo(() => {
    if (!localSearch.trim()) return DEMO_GATEWAYS
    const query = localSearch.toLowerCase()
    return DEMO_GATEWAYS.filter(gw =>
      gw.name.toLowerCase().includes(query) ||
      gw.namespace.toLowerCase().includes(query) ||
      gw.cluster.toLowerCase().includes(query) ||
      gw.gatewayClass.toLowerCase().includes(query) ||
      gw.status.toLowerCase().includes(query)
    )
  }, [localSearch])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await new Promise(r => setTimeout(r, 1000))
    setIsRefreshing(false)
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Controls */}
      <div className="flex items-center justify-end gap-1 mb-3">
        <a
          href="https://gateway-api.sigs.k8s.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
          title="Gateway API Documentation"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        <RefreshButton
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          size="sm"
        />
      </div>

      {/* Gateway API Integration Notice */}
      <div className="flex items-start gap-2 p-2 mb-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-purple-400 font-medium">Kubernetes Gateway API</p>
          <p className="text-muted-foreground">
            Next-gen ingress API with role-based resource model.{' '}
            <a
              href="https://gateway-api.sigs.k8s.io/guides/getting-started/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              Install guide
            </a>
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center">
          <p className="text-[10px] text-purple-400">Gateways</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.totalGateways}</p>
        </div>
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-[10px] text-green-400">Programmed</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.programmedCount}</p>
        </div>
        <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
          <p className="text-[10px] text-blue-400">Routes</p>
          <p className="text-lg font-bold text-foreground">{DEMO_STATS.totalRoutes}</p>
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search gateways..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Gateways list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredGateways.map((gw, idx) => {
          const Icon = getStatusIcon(gw.status)
          const colors = getStatusColors(gw.status)
          return (
            <div
              key={`${gw.cluster}-${gw.namespace}-${gw.name}-${idx}`}
              className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                  <span className="text-sm font-medium text-foreground truncate">{gw.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${colors.bg} ${colors.text}`}>
                    {gw.status}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {gw.attachedRoutes} route{gw.attachedRoutes !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <ClusterBadge cluster={gw.cluster} />
                  <span className="text-muted-foreground">{gw.namespace}</span>
                </div>
                <span className="text-muted-foreground/60 text-[10px]">{gw.gatewayClass}</span>
              </div>
              {gw.addresses.length > 0 && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <Globe className="w-3 h-3" />
                  <span className="font-mono">{gw.addresses.join(', ')}</span>
                </div>
              )}
              {gw.listeners.length > 0 && (
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <ArrowRight className="w-3 h-3" />
                  {gw.listeners.map((l, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-secondary">
                      {l.protocol}:{l.port}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick install command */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground font-medium mb-2">Quick Install (CRDs)</p>
        <code className="block p-2 rounded bg-secondary text-[10px] text-muted-foreground font-mono overflow-x-auto whitespace-nowrap">
          kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml
        </code>
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-[10px]">
        <a
          href="https://gateway-api.sigs.k8s.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Gateway API Docs
        </a>
        <span className="text-muted-foreground/30">|</span>
        <a
          href="https://gateway-api.sigs.k8s.io/implementations/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Implementations
        </a>
        <span className="text-muted-foreground/30">|</span>
        <a
          href="https://gateway-api.sigs.k8s.io/concepts/gamma/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          GAMMA
        </a>
      </div>
    </div>
  )
}
