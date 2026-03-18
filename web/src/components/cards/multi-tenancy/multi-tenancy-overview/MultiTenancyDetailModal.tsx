/**
 * Multi-Tenancy Overview Detail Modal — drill-down view for multi-tenancy status.
 *
 * Shows full component health details (OVN, KubeFlex, K3s, KubeVirt) with
 * detection status and health indicators. Also shows all isolation levels
 * with detailed status and provider information.
 *
 * Follows the TrivyDetailModal pattern using BaseModal compound components.
 */

import { Shield, ExternalLink, CheckCircle, XCircle, AlertTriangle, Network, Layers, Box, Monitor, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../../lib/modals'
import { StatusBadge } from '../../../ui/StatusBadge'
import type { MultiTenancyOverviewData, ComponentStatus, IsolationLevel, IsolationStatus } from './useMultiTenancyOverview'

// ============================================================================
// Constants
// ============================================================================

/** Number of columns in the component grid */
const COMPONENT_GRID_COLS = 2

// ============================================================================
// Types
// ============================================================================

interface MultiTenancyDetailModalProps {
  isOpen: boolean
  onClose: () => void
  data: MultiTenancyOverviewData
}

// ============================================================================
// Icon / Color Maps
// ============================================================================

/** Map component icon strings to lucide components */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  network: Network,
  layers: Layers,
  box: Box,
  monitor: Monitor,
}

/** Color classes for health states */
const HEALTH_COLORS: Record<string, string> = {
  healthy: 'text-green-400',
  degraded: 'text-orange-400',
  unhealthy: 'text-red-400',
  'not-installed': 'text-zinc-500',
  unknown: 'text-zinc-500',
}

/** Background classes for health states */
const HEALTH_BG: Record<string, string> = {
  healthy: 'bg-green-500/10 border-green-500/20',
  degraded: 'bg-orange-500/10 border-orange-500/20',
  unhealthy: 'bg-red-500/10 border-red-500/20',
  'not-installed': 'bg-zinc-500/10 border-zinc-500/20',
  unknown: 'bg-zinc-500/10 border-zinc-500/20',
}

/** Isolation status colors */
const ISOLATION_STATUS_COLORS: Record<IsolationStatus, string> = {
  ready: 'text-green-400',
  degraded: 'text-orange-400',
  missing: 'text-zinc-500',
}

/** Isolation status backgrounds */
const ISOLATION_STATUS_BG: Record<IsolationStatus, string> = {
  ready: 'bg-green-500/10 border-green-500/20',
  degraded: 'bg-orange-500/10 border-orange-500/20',
  missing: 'bg-zinc-500/10 border-zinc-500/20',
}

// ============================================================================
// Sub-components
// ============================================================================

function IsolationStatusIcon({ status }: { status: IsolationStatus }) {
  switch (status) {
    case 'ready':
      return <CheckCircle className="w-5 h-5 text-green-400" />
    case 'degraded':
      return <AlertTriangle className="w-5 h-5 text-orange-400" />
    case 'missing':
      return <XCircle className="w-5 h-5 text-zinc-500" />
  }
}

function ComponentDetailCard({ component }: { component: ComponentStatus }) {
  const IconComponent = ICON_MAP[component.icon] || Shield
  const healthColor = HEALTH_COLORS[component.health] || HEALTH_COLORS.unknown
  const healthBg = HEALTH_BG[component.health] || HEALTH_BG.unknown

  return (
    <div className={`p-4 rounded-lg border ${healthBg} flex items-start gap-3`}>
      <IconComponent className={`w-5 h-5 ${healthColor} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{component.name}</span>
          <div className={`w-2.5 h-2.5 rounded-full ${component.detected ? 'bg-green-400' : 'bg-zinc-500'}`} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs font-medium capitalize ${healthColor}`}>
            {component.detected ? component.health : 'Not detected'}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {component.detected ? 'Detected and monitored' : 'Not installed on any cluster'}
        </p>
      </div>
    </div>
  )
}

function IsolationLevelCard({ level }: { level: IsolationLevel }) {
  const statusColor = ISOLATION_STATUS_COLORS[level.status]
  const statusBg = ISOLATION_STATUS_BG[level.status]

  return (
    <div className={`p-4 rounded-lg border ${statusBg} flex items-center justify-between`}>
      <div className="flex items-center gap-3">
        <IsolationStatusIcon status={level.status} />
        <div>
          <span className="text-sm font-medium text-foreground">{level.type}</span>
          <p className="text-xs text-muted-foreground mt-0.5">{level.provider}</p>
        </div>
      </div>
      <span className={`text-xs font-medium capitalize px-2.5 py-1 rounded ${statusColor} bg-secondary/30`}>
        {level.status}
      </span>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

export function MultiTenancyDetailModal({ isOpen, onClose, data }: MultiTenancyDetailModalProps) {
  const { t } = useTranslation('cards')

  const components = data.components || []
  const isolationLevels = data.isolationLevels || []
  const detectedCount = components.filter((c) => c.detected).length
  const healthyCount = components.filter((c) => c.health === 'healthy').length

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('multiTenancy.detailTitle', 'Multi-Tenancy Overview Details')}
        icon={Shield}
        onClose={onClose}
        badges={
          <StatusBadge
            color={data.overallScore === data.totalLevels ? 'green' : data.overallScore > 0 ? 'orange' : 'red'}
            size="sm"
          >
            {data.overallScore}/{data.totalLevels} {t('multiTenancy.isolationScore', 'Isolation Score')}
          </StatusBadge>
        }
      />

      <BaseModal.Content>
        <div className="space-y-6">
          {/* Score and tenant summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Shield className="w-5 h-5 text-cyan-400" />
              </div>
              <p className="text-2xl font-bold text-cyan-400">
                {data.overallScore}/{data.totalLevels}
              </p>
              <p className="text-xs text-muted-foreground">{t('multiTenancy.isolationScore', 'Isolation Score')}</p>
            </div>
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-purple-400">{data.tenantCount}</p>
              <p className="text-xs text-muted-foreground">{t('multiTenancy.tenantsLabel', 'Tenants')}</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <CheckCircle className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-blue-400">
                {detectedCount}/{components.length}
              </p>
              <p className="text-xs text-muted-foreground">{t('multiTenancy.detected', 'Detected')}</p>
            </div>
          </div>

          {/* Component health section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">
                {t('multiTenancy.componentHealth', 'Component Health')}
              </p>
              <span className="text-xs text-muted-foreground">
                {healthyCount}/{components.length} {t('multiTenancy.healthy', 'healthy')}
              </span>
            </div>
            <div className={`grid grid-cols-${COMPONENT_GRID_COLS} gap-3`}>
              {components.map((component) => (
                <ComponentDetailCard key={component.name} component={component} />
              ))}
            </div>
          </div>

          {/* Isolation levels section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">
                {t('multiTenancy.isolationLevels', 'Isolation Levels')}
              </p>
              <span className="text-xs text-muted-foreground">
                {data.overallScore}/{data.totalLevels} {t('multiTenancy.ready', 'ready')}
              </span>
            </div>
            <div className="space-y-2">
              {isolationLevels.map((level) => (
                <IsolationLevelCard key={level.type} level={level} />
              ))}
            </div>
          </div>

          {/* Explanation */}
          <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t(
                'multiTenancy.explanation',
                'Multi-tenancy isolation is achieved through three layers: Control-plane isolation (KubeFlex + K3s), Data-plane isolation (KubeVirt), and Network isolation (OVN-Kubernetes). All three layers must be ready for full tenant isolation.',
              )}
            </p>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href="https://docs.kubestellar.io/stable/Getting-Started/quickstart/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {t('multiTenancy.openDocs', 'KubeStellar Docs')}
        </a>
      </BaseModal.Footer>
    </BaseModal>
  )
}
