import { useTranslation } from 'react-i18next'
import {
  Zap,
  CheckCircle2,
  Settings2,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  Search,
} from 'lucide-react'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import { Sparkline } from '../charts/Sparkline'
import type { GPUReservation } from '../../hooks/useGPUReservations'
import type { GPUUtilizationSnapshot } from '../../hooks/useGPUUtilizations'
import {
  STATUS_COLORS,
  SPARKLINE_HEIGHT_PX,
  computeAvgUtilization,
  countActiveDays,
  getUtilizationColor,
} from './gpu-constants'

export interface GPUReservationsTabProps {
  filteredReservations: GPUReservation[]
  utilizations: Record<string, GPUUtilizationSnapshot[]> | null
  effectiveDemoMode: boolean
  showOnlyMine: boolean
  searchTerm: string
  reservationsLoading: boolean
  expandedReservationId: string | null
  deleteConfirmId: string | null
  showReservationForm: boolean
  user: { github_login?: string } | null
  onSetSearchTerm: (term: string) => void
  onSetShowOnlyMine: (show: boolean) => void
  onSetExpandedReservationId: (id: string | null) => void
  onEditReservation: (reservation: GPUReservation) => void
  onDeleteReservation: (id: string) => void
  onCreateReservation: () => void
}

export function GPUReservationsTab({
  filteredReservations,
  utilizations,
  effectiveDemoMode,
  showOnlyMine,
  searchTerm,
  reservationsLoading,
  expandedReservationId,
  deleteConfirmId,
  showReservationForm,
  user,
  onSetSearchTerm,
  onSetShowOnlyMine,
  onSetExpandedReservationId,
  onEditReservation,
  onDeleteReservation,
  onCreateReservation,
}: GPUReservationsTabProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSetSearchTerm(e.target.value)}
          placeholder={t('gpuReservations.searchPlaceholder', 'Search reservations...')}
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>
      {/* Filter banner when showing only user's reservations */}
      {showOnlyMine && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
          <div className="flex items-center gap-2 text-sm text-purple-300">
            <Filter className="w-4 h-4" />
            <span>{t('gpuReservations.filteringByUser', `Showing reservations for {{user}}`, { user: user?.github_login || 'you' })}</span>
          </div>
          <button
            onClick={() => onSetShowOnlyMine(false)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 transition-colors"
          >
            <X className="w-3 h-3" />
            {t('common:common.clearFilter', 'Clear filter')}
          </button>
        </div>
      )}
      {filteredReservations.length === 0 && !reservationsLoading && (
        <div className={'glass p-8 rounded-lg text-center'}>
          <Settings2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          {/*
            Issue #5991: do not manually truncate translation output with
            .split('"')[0]. That assumes an English-shaped string containing
            a literal double quote and silently drops text in locales whose
            translated string has no such quote. Use a dedicated short key
            for the empty-state headline instead.
          */}
          <p className="text-muted-foreground mb-4">
            {showOnlyMine
              ? t('gpuReservations.overview.noReservationsUser')
              : t('gpuReservations.overview.noReservationsYetShort')}
          </p>
          {!showOnlyMine && (
            <button onClick={onCreateReservation}
              disabled={deleteConfirmId !== null || showReservationForm}
              className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-500">
              {t('gpuReservations.createReservation')}
            </button>
          )}
        </div>
      )}
      <div className="grid gap-4">
        {filteredReservations.map(r => {
          const isExpanded = expandedReservationId === r.id
          return (
            <div key={r.id} className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Zap className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{r.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {r.namespace} · {r.user_name}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('px-2 py-0.5 text-xs rounded-full border', STATUS_COLORS[r.status] || STATUS_COLORS.pending)}>
                    {r.status}
                  </span>
                  <ClusterBadge cluster={r.cluster} size="sm" />
                  <button onClick={() => onSetExpandedReservationId(isExpanded ? null : r.id)}
                    className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                    aria-label={t('gpuReservations.list.viewReservation', { title: r.title })}>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button onClick={() => onEditReservation(r)}
                    disabled={deleteConfirmId !== null || showReservationForm}
                    className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    aria-label={t('gpuReservations.list.editReservation', { title: r.title })}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => onDeleteReservation(r.id)}
                    disabled={deleteConfirmId !== null || showReservationForm}
                    className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    aria-label={t('gpuReservations.list.deleteReservation', { title: r.title })}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Reservation summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="flex items-center gap-2 p-2 rounded bg-secondary/30">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <div>
                    <div className="text-xs text-muted-foreground">{t('common:common.gpus')}</div>
                    <div className="text-sm font-medium text-foreground">{r.gpu_count}</div>
                  </div>
                </div>
                {r.gpu_type && (
                  <div className="p-2 rounded bg-secondary/30">
                    <div className="text-xs text-muted-foreground">{t('common:common.type')}</div>
                    <div className="text-sm font-medium text-foreground truncate">{r.gpu_type}</div>
                  </div>
                )}
                <div className="p-2 rounded bg-secondary/30">
                  <div className="text-xs text-muted-foreground">{t('common:common.start')}</div>
                  <div className="text-sm font-medium text-foreground">{(r.start_date || '').split('T')[0]}</div>
                </div>
                <div className="p-2 rounded bg-secondary/30">
                  <div className="text-xs text-muted-foreground">{t('common:common.duration')}</div>
                  <div className="text-sm font-medium text-foreground">{r.duration_hours}h</div>
                </div>
              </div>

              {/* GPU Utilization Sparkline */}
              {(() => {
                const snaps = (utilizations || {})[r.id] || []
                if (snaps.length === 0) return (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="text-xs text-muted-foreground text-center py-1">
                      {t('gpuReservations.utilization.noData', 'No usage data yet')}
                    </div>
                  </div>
                )
                const avg = computeAvgUtilization(snaps)
                const days = countActiveDays(snaps)
                const color = getUtilizationColor(avg)
                return (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <Sparkline
                      data={snaps.map(s => s.gpu_utilization_pct)}
                      color={color}
                      height={SPARKLINE_HEIGHT_PX}
                      fill
                    />
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span style={{ color }}>
                        {t('gpuReservations.utilization.avgGpu', `Avg {{pct}}% GPU`, { pct: avg })}
                      </span>
                      <span className="text-muted-foreground">
                        {t('gpuReservations.utilization.activeDays', `{{count}} active days`, { count: days })}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {/* Description and notes */}
              {(r.description || r.notes) && (
                <div className="mt-3 pt-3 border-t border-border/50 text-sm text-muted-foreground">
                  {r.description && <div>{r.description}</div>}
                  {r.notes && <div className="mt-1 italic">{r.notes}</div>}
                </div>
              )}

              {/* Quota enforcement badge */}
              {r.quota_enforced && r.quota_name && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
                  <CheckCircle2 className="w-3 h-3" />
                  {t('gpuReservations.list.k8sQuotaEnforced', { quotaName: r.quota_name })}
                </div>
              )}

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">{t('gpuReservations.reservationDetails.fields.user')}</div>
                      <div className="text-foreground">{r.user_name}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t('common:common.status')}</div>
                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border', STATUS_COLORS[r.status] || STATUS_COLORS.pending)}>
                        {r.status === 'active' && <span className="w-2 h-2 rounded-full bg-green-400" />}
                        {r.status}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t('common:common.namespace')}</div>
                      <div className="text-foreground">{r.namespace}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t('common:common.cluster')}</div>
                      <div className="text-foreground">{r.cluster}</div>
                    </div>
                    {r.quota_enforced && r.quota_name && (
                      <div>
                        <div className="text-sm text-muted-foreground">{t('gpuReservations.reservationDetails.fields.k8sQuota')}</div>
                        <div className="text-foreground">{r.quota_name}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-muted-foreground">{t('gpuReservations.reservationDetails.fields.startDate')}</div>
                      <div className="text-foreground">{(r.start_date || '').split('T')[0]}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">{t('common:common.duration')}</div>
                      <div className="text-foreground">{r.duration_hours} hours</div>
                    </div>
                    {r.description && (
                      <div className="col-span-2">
                        <div className="text-sm text-muted-foreground">{t('common:common.description')}</div>
                        <div className="text-foreground">{r.description}</div>
                      </div>
                    )}
                    {r.notes && (
                      <div className="col-span-2">
                        <div className="text-sm text-muted-foreground">{t('gpuReservations.reservationDetails.fields.notes')}</div>
                        <div className="text-foreground">{r.notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
