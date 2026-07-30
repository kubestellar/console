/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Server, Info, Tag, Loader2, Copy, Check, ExternalLink, Activity } from 'lucide-react'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { cn } from '../../../lib/cn'
import { SERVICE_HEALTH_DOT_CLASSES, SERVICE_HEALTH_LABELS, type ServiceHealthStatus } from '../../../lib/services/serviceHealth'
import type { ServiceTabType, ServiceEndpointAddress } from './useServiceDrillDown'

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface ServiceDrillDownHeaderProps {
  serviceName: string
  serviceType: string
  cluster: string
  namespace: string
  health: ServiceHealthStatus
  lbStatus: 'ready' | 'provisioning' | ''
  lbStatusLabel: string
  onDrillToNamespace: (cluster: string, namespace: string) => void
  onDrillToCluster: (cluster: string) => void
}

export function ServiceDrillDownHeader({
  serviceName, serviceType, cluster, namespace, health, lbStatus, lbStatusLabel,
  onDrillToNamespace, onDrillToCluster,
}: ServiceDrillDownHeaderProps) {
  return (
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
            onClick={() => onDrillToNamespace(cluster, namespace)}
          >
            {namespace}
          </span>
          <span>/</span>
          <span
            className="cursor-pointer hover:text-foreground"
            onClick={() => onDrillToCluster(cluster)}
          >
            <ClusterBadge cluster={cluster} size="sm" />
          </span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
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
            lbStatus === 'ready' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
          )}>
            {lbStatusLabel}
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface ServiceTabBarProps {
  activeTab: ServiceTabType
  tabs: { id: ServiceTabType; label: string }[]
  onChange: (tab: ServiceTabType) => void
}

export function ServiceTabBar({ activeTab, tabs, onChange }: ServiceTabBarProps) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
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
  )
}

// ---------------------------------------------------------------------------
// Reusable info field with optional copy button
// ---------------------------------------------------------------------------

export function InfoField({ label, value, icon, onCopy, copied }: {
  label: string
  value: string
  icon?: ReactNode
  onCopy?: () => void
  copied?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="p-3 rounded-lg bg-secondary/30">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground truncate" title={value}>{value}</span>
        {onCopy && (
          <button onClick={onCopy} className="p-2 min-h-11 min-w-11 flex items-center justify-center rounded hover:bg-secondary shrink-0" title={t('drilldown.service.copy')}>
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

interface ServiceOverviewTabProps {
  isLoading: boolean
  serviceType: string
  clusterIP: string
  externalIPs: string[]
  endpointCount?: number
  ports: string[]
  selector: Record<string, string> | null
  labels: Record<string, string> | null
  copiedField: string | null
  onCopy: (text: string, field: string) => void
}

export function ServiceOverviewTab({
  isLoading, serviceType, clusterIP, externalIPs, endpointCount, ports, selector, labels,
  copiedField, onCopy,
}: ServiceOverviewTabProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t('drilldown.service.loadingDetails')}</span>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <InfoField
          label={t('drilldown.service.type')}
          value={serviceType}
          icon={<Info className="w-3.5 h-3.5" />}
          onCopy={() => onCopy(serviceType, 'type')}
          copied={copiedField === 'type'}
        />
        <InfoField
          label={t('drilldown.service.clusterIp')}
          value={clusterIP || t('drilldown.service.none')}
          icon={<Server className="w-3.5 h-3.5" />}
          onCopy={clusterIP ? () => onCopy(clusterIP, 'clusterIP') : undefined}
          copied={copiedField === 'clusterIP'}
        />
        <InfoField
          label={t('drilldown.service.externalIps')}
          value={externalIPs.length > 0 ? externalIPs.join(', ') : t('drilldown.service.none')}
          icon={<Globe className="w-3.5 h-3.5" />}
          onCopy={externalIPs.length > 0 ? () => onCopy(externalIPs.join(', '), 'externalIP') : undefined}
          copied={copiedField === 'externalIP'}
        />
        <InfoField
          label={t('drilldown.service.endpoints')}
          value={endpointCount !== undefined ? t('drilldown.service.readyCount', { count: endpointCount }) : t('drilldown.service.unknown')}
          icon={<Activity className="w-3.5 h-3.5" />}
        />
      </div>

      {ports.length > 0 && (
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-xs text-muted-foreground mb-2">{t('drilldown.service.ports')}</div>
          <div className="flex flex-wrap gap-2">
            {ports.map((p, i) => (
              <span key={i} className="px-2 py-1 rounded text-xs bg-secondary text-foreground font-mono">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {selector && Object.keys(selector).length > 0 && (
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            {t('drilldown.service.selector')}
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

      {labels && Object.keys(labels).length > 0 && (
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            {t('drilldown.service.labels')}
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
  )
}

// ---------------------------------------------------------------------------
// Endpoints tab
// ---------------------------------------------------------------------------

interface ServiceEndpointsTabProps {
  endpointAddresses: ServiceEndpointAddress[]
  cluster: string
  namespace: string
  onDrillToPod: (cluster: string, namespace: string, pod: string) => void
}

export function ServiceEndpointsTab({ endpointAddresses, cluster, namespace, onDrillToPod }: ServiceEndpointsTabProps) {
  const { t } = useTranslation()

  if (endpointAddresses.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        {t('drilldown.service.noReadyEndpoints')}
      </div>
    )
  }

  return (
    <>
      {endpointAddresses.map((addr, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center justify-between p-2 rounded-lg bg-secondary/30',
            addr.targetRef ? 'cursor-pointer hover:bg-secondary/50' : ''
          )}
          onClick={() => {
            if (addr.targetRef) {
              onDrillToPod(cluster, namespace, addr.targetRef)
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
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Describe / YAML output pane (shared shape)
// ---------------------------------------------------------------------------

interface ServiceOutputPaneProps {
  output: string | null
  loading: boolean
  loadLabel: string
  loadingLabel: string
  copyField: string
  copiedField: string | null
  onLoad: () => void
  onCopy: (text: string, field: string) => void
}

export function ServiceOutputPane({
  output, loading, loadLabel, loadingLabel, copyField, copiedField, onLoad, onCopy,
}: ServiceOutputPaneProps) {
  const { t } = useTranslation()

  if (!output && !loading) {
    return (
      <button
        onClick={onLoad}
        className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm transition-colors"
      >
        {loadLabel}
      </button>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {loadingLabel}
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => onCopy(output as string, copyField)}
        className="absolute top-2 right-2 p-1 rounded bg-secondary hover:bg-secondary/80"
        title={t('drilldown.service.copy')}
      >
        {copiedField === copyField ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
      <pre className="p-3 rounded-lg bg-secondary/30 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
        {output}
      </pre>
    </div>
  )
}
