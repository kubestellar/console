import { Globe, Server, ExternalLink, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Service } from '../../../hooks/useMCP'
import { ClusterBadge } from '../../ui/ClusterBadge'
import {
  deriveServiceHealth,
  formatServicePorts,
  SERVICE_HEALTH_DOT_CLASSES,
  SERVICE_HEALTH_LABELS,
  type ServiceHealthStatus,
} from '../../../lib/services/serviceHealth'

function getTypeIcon(type: string) {
  switch (type) {
    case 'LoadBalancer':
      return <Globe className="w-3 h-3 text-blue-400" />
    case 'NodePort':
      return <Server className="w-3 h-3 text-purple-400" />
    case 'ExternalName':
      return <ExternalLink className="w-3 h-3 text-orange-400" />
    default:
      return <Server className="w-3 h-3 text-green-400" />
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case 'LoadBalancer':
      return 'bg-blue-500/10 text-blue-400'
    case 'NodePort':
      return 'bg-purple-500/10 text-purple-400'
    case 'ExternalName':
      return 'bg-orange-500/10 text-orange-400'
    default:
      return 'bg-green-500/10 text-green-400'
  }
}

export interface ServiceTypeStats {
  total: number
  loadBalancer: number
  nodePort: number
  clusterIP: number
}

export function ServiceStatsRow({ stats }: { stats: ServiceTypeStats }) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 @md:grid-cols-4 gap-2 mb-3">
      <div className="p-1.5 rounded-lg bg-secondary/50 text-center">
        <div className="text-sm font-bold text-foreground">{stats.total}</div>
        <div className="text-2xs text-muted-foreground">{t('common.total')}</div>
      </div>
      <div className="p-1.5 rounded-lg bg-blue-500/10 text-center">
        <div className="text-sm font-bold text-blue-400">{stats.loadBalancer}</div>
        <div className="text-2xs text-muted-foreground">LB</div>
      </div>
      <div className="p-1.5 rounded-lg bg-purple-500/10 text-center">
        <div className="text-sm font-bold text-purple-400">{stats.nodePort}</div>
        <div className="text-2xs text-muted-foreground">NodePort</div>
      </div>
      <div className="p-1.5 rounded-lg bg-green-500/10 text-center">
        <div className="text-sm font-bold text-green-400">{stats.clusterIP}</div>
        <div className="text-2xs text-muted-foreground">ClusterIP</div>
      </div>
    </div>
  )
}

interface ServiceRowProps {
  service: Service
  onSelect: (service: Service) => void
}

export function ServiceRow({ service, onSelect }: ServiceRowProps) {
  const { t } = useTranslation()
  // Centralized health derivation (#6164, #6165, #6166, #6167)
  const health: ServiceHealthStatus = deriveServiceHealth(service)
  const formattedPorts = formatServicePorts(service)
  // When the backend did not report endpoint counts the card
  // should say so explicitly rather than rendering a misleading
  // "0 endpoints" that contradicts the unknown-status dot
  // (#6181). `endpointsKnown` gates the count vs. unknown label.
  const endpointsKnown = service.endpoints !== undefined
  const endpointCount = service.endpoints ?? 0
  return (
    <div
      onClick={() => onSelect(service)}
      className="flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group gap-2"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Connectivity dot — single source of truth via deriveServiceHealth (#6167) */}
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${SERVICE_HEALTH_DOT_CLASSES[health]}`}
          role="status"
          aria-label={SERVICE_HEALTH_LABELS[health]}
          title={SERVICE_HEALTH_LABELS[health]}
        />
        {getTypeIcon(service.type || 'ClusterIP')}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground truncate group-hover:text-cyan-400">{service.name}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{service.namespace}</span>
            <ClusterBadge cluster={service.cluster || ''} size="sm" />
            {endpointsKnown ? (
              <span className="truncate" title={t('serviceStatus.endpointsTooltip', '{{count}} ready endpoint(s)', { count: endpointCount })}>
                {t('serviceStatus.endpointsCount', {
                  defaultValue: '{{count}} endpoints',
                  count: endpointCount,
                })}
              </span>
            ) : (
              <span
                className="truncate text-muted-foreground/70"
                title={t('serviceStatus.endpointsUnknownTooltip', 'Endpoint count unavailable')}
              >
                {t('serviceStatus.endpointsUnknown', 'Endpoints unknown')}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {formattedPorts.length > 0 && (
          <span
            className="text-xs text-muted-foreground truncate max-w-[140px]"
            title={(formattedPorts || []).join(', ')}
          >
            {(formattedPorts || []).join(', ')}
          </span>
        )}
        {/* Orphaned badge (#6164/#6165) */}
        {health === 'orphaned' && (
          <span
            className="px-1.5 py-0.5 rounded text-2xs shrink-0 bg-red-500/10 text-red-400 border border-red-500/20"
            title={SERVICE_HEALTH_LABELS.orphaned}
          >
            {t('serviceStatus.orphanedBadge', 'Orphaned')}
          </span>
        )}
        {/* Provisioning badge (#6167) */}
        {health === 'provisioning' && (
          <span
            className="px-1.5 py-0.5 rounded text-2xs shrink-0 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
            title={SERVICE_HEALTH_LABELS.provisioning}
          >
            {t('serviceStatus.provisioningBadge', 'Provisioning')}
          </span>
        )}
        <span className={`px-1.5 py-0.5 rounded text-xs shrink-0 ${getTypeColor(service.type || 'ClusterIP')}`}>
          {service.type || 'ClusterIP'}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
    </div>
  )
}
