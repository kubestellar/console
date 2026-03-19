/**
 * MultiTenancyOverview — Aggregated view of tenant isolation across
 * OVN, KubeFlex, K3s, and KubeVirt.
 *
 * Displays a 2x2 grid of component status badges, 3 isolation level
 * indicators, overall score, and tenant count. Purely derived from
 * the 4 individual technology hooks (no direct fetch).
 */
import { useMemo, useState } from 'react'
import { Network, Layers, Box, Monitor, Shield, CheckCircle, XCircle, AlertTriangle, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMultiTenancyOverview } from './useMultiTenancyOverview'
import { DEMO_MULTI_TENANCY_OVERVIEW } from './demoData'
import { useCardLoadingState } from '../../CardDataContext'
import { MultiTenancyDetailModal } from './MultiTenancyDetailModal'

import type { ComponentStatus, IsolationLevel, IsolationStatus } from './useMultiTenancyOverview'

/** Grid columns for the component status grid */
const COMPONENT_GRID_COLS = 2

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
  unknown: 'text-zinc-500',
}

/** Background classes for health states */
const HEALTH_BG: Record<string, string> = {
  healthy: 'bg-green-500/10 border-green-500/20',
  degraded: 'bg-orange-500/10 border-orange-500/20',
  unhealthy: 'bg-red-500/10 border-red-500/20',
  unknown: 'bg-zinc-500/10 border-zinc-500/20',
}

/** Status icon for isolation levels */
function IsolationStatusIcon({ status }: { status: IsolationStatus }) {
  switch (status) {
    case 'ready':
      return <CheckCircle className="w-4 h-4 text-green-400" />
    case 'degraded':
      return <AlertTriangle className="w-4 h-4 text-orange-400" />
    case 'missing':
      return <XCircle className="w-4 h-4 text-zinc-500" />
  }
}

/** Status color text for isolation levels */
const ISOLATION_STATUS_COLORS: Record<IsolationStatus, string> = {
  ready: 'text-green-400',
  degraded: 'text-orange-400',
  missing: 'text-zinc-500',
}

/** Single component badge in the 2x2 grid */
function ComponentBadge({ component, onClick }: { component: ComponentStatus; onClick?: () => void }) {
  const IconComponent = ICON_MAP[component.icon] || Shield
  const healthColor = HEALTH_COLORS[component.health] || HEALTH_COLORS.unknown
  const healthBg = HEALTH_BG[component.health] || HEALTH_BG.unknown

  return (
    <div className={`p-2.5 rounded-lg border ${healthBg} flex items-center gap-2 cursor-pointer hover:bg-secondary/50 transition-colors`} role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}>
      <IconComponent className={`w-4 h-4 ${healthColor}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{component.name}</div>
        <div className={`text-xs ${healthColor}`}>
          {component.detected ? component.health : 'Not detected'}
        </div>
      </div>
      <div className={`w-2 h-2 rounded-full ${component.detected ? 'bg-green-400' : 'bg-zinc-500'}`} />
    </div>
  )
}

/** Single isolation level row */
function IsolationRow({ level, onClick }: { level: IsolationLevel; onClick?: () => void }) {
  return (
    <div className="flex items-center justify-between py-1.5 cursor-pointer hover:bg-secondary/50 transition-colors rounded px-1 -mx-1" role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}>
      <div className="flex items-center gap-2">
        <IsolationStatusIcon status={level.status} />
        <span className="text-xs font-medium text-foreground">{level.type}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{level.provider}</span>
        <span className={`text-xs font-medium capitalize ${ISOLATION_STATUS_COLORS[level.status]}`}>
          {level.status}
        </span>
      </div>
    </div>
  )
}

export function MultiTenancyOverview() {
  const { t } = useTranslation(['cards'])
  const liveData = useMultiTenancyOverview()
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  // Use demo data when all hooks return demo data
  const data = useMemo(
    () => (liveData.isDemoData ? DEMO_MULTI_TENANCY_OVERVIEW : liveData),
    [liveData],
  )

  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: data.isLoading,
    hasAnyData: (data.components || []).length > 0,
    isDemoData: data.isDemoData,
  })

  if (showSkeleton) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">
          {t('cards:multiTenancy.loadingOverview', 'Loading multi-tenancy overview...')}
        </div>
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card text-muted-foreground">
        <p className="text-sm">{t('cards:multiTenancy.noData', 'No multi-tenancy data')}</p>
        <p className="text-xs mt-1">{t('cards:multiTenancy.connectClusters', 'Connect to clusters to detect components')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Overall score header */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-secondary/30 rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors" role="button" tabIndex={0} onClick={() => setIsDetailModalOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsDetailModalOpen(true) } }}>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-medium text-foreground">
            {t('cards:multiTenancy.isolationScore', 'Isolation Score')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-foreground">
            {data.overallScore}/{data.totalLevels}
          </span>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {data.tenantCount} {t('cards:multiTenancy.tenantsLabel', 'tenants')}
            </span>
          </div>
        </div>
      </div>

      {/* 2x2 component status grid */}
      <div className={`grid grid-cols-${COMPONENT_GRID_COLS} gap-2`}>
        {(data.components || []).map((component) => (
          <ComponentBadge key={component.name} component={component} onClick={() => setIsDetailModalOpen(true)} />
        ))}
      </div>

      {/* Isolation level indicators */}
      <div className="flex-1">
        <div className="text-xs text-muted-foreground mb-1.5 font-medium">
          {t('cards:multiTenancy.isolationLevels', 'Isolation Levels')}
        </div>
        <div className="space-y-0.5 bg-secondary/20 rounded-lg px-3 py-2">
          {(data.isolationLevels || []).map((level) => (
            <IsolationRow key={level.type} level={level} onClick={() => setIsDetailModalOpen(true)} />
          ))}
        </div>
      </div>

      <MultiTenancyDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        data={data}
        isDemoData={liveData.isDemoData}
      />
    </div>
  )
}
