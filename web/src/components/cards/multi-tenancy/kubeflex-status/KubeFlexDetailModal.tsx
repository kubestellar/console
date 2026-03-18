/**
 * KubeFlex Detail Modal — drill-down view for KubeFlex status.
 *
 * Shows full control plane list with name, type, health status, and
 * tenant assignment. Also displays controller pod details.
 *
 * Follows the TrivyDetailModal pattern using BaseModal compound components.
 */

import { useMemo, useState } from 'react'
import { Layers, Search, ExternalLink, CheckCircle, XCircle, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../../lib/modals'
import { StatusBadge } from '../../../ui/StatusBadge'
import type { KubeFlexStatus } from './useKubeflexStatus'
import type { ControlPlaneInfo } from './helpers'

// ============================================================================
// Constants
// ============================================================================

/** Number of columns in the summary grid */
const SUMMARY_GRID_COLS = 3

// ============================================================================
// Types
// ============================================================================

interface KubeFlexDetailModalProps {
  isOpen: boolean
  onClose: () => void
  data: KubeFlexStatus
  isDemoData?: boolean
}

// ============================================================================
// Sub-components
// ============================================================================

function ControlPlaneRow({ cp }: { cp: ControlPlaneInfo }) {
  return (
    <div className="flex items-center justify-between text-sm gap-3 px-3 py-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Layers className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-foreground truncate font-medium" title={cp.name}>
          {cp.name}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {cp.healthy ? (
          <>
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-xs font-medium text-green-400">Healthy</span>
          </>
        ) : (
          <>
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs font-medium text-red-400">Unhealthy</span>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

export function KubeFlexDetailModal({ isOpen, onClose, data, isDemoData }: KubeFlexDetailModalProps) {
  const { t } = useTranslation('cards')
  const [search, setSearch] = useState('')

  const controlPlanes = data.controlPlanes || []
  const healthyCPs = controlPlanes.filter((cp) => cp.healthy).length
  const unhealthyCPs = controlPlanes.length - healthyCPs

  // Filter control planes by search
  const filteredCPs = useMemo(() => {
    if (!search.trim()) return controlPlanes
    const q = search.toLowerCase()
    return controlPlanes.filter((cp) => cp.name.toLowerCase().includes(q))
  }, [controlPlanes, search])

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false} className={isDemoData ? 'border border-yellow-500/30 shadow-[0_0_12px_rgba(234,179,8,0.15)]' : ''}>
      <BaseModal.Header
        title={t('kubeFlexStatus.detailTitle', 'KubeFlex Details')}
        icon={Layers}
        onClose={onClose}
        badges={
          <>
            {isDemoData && <StatusBadge color="yellow" size="sm">{t('cards:cardWrapper.demo', 'Demo')}</StatusBadge>}
            <StatusBadge
              color={data.controllerHealthy && unhealthyCPs === 0 ? 'green' : 'orange'}
              size="sm"
            >
              {controlPlanes.length} {t('kubeFlexStatus.controlPlanes', 'control planes')} · {data.tenantCount} {t('kubeFlexStatus.tenants', 'tenants')}
            </StatusBadge>
          </>
        }
      />

      <BaseModal.Content>
        <div className="space-y-4">
          {/* Summary grid */}
          <div className={`grid grid-cols-${SUMMARY_GRID_COLS} gap-3`}>
            <div className="p-3 rounded-lg bg-blue-500/10 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Server className="w-4 h-4 text-blue-400" />
              </div>
              <p className={`text-xl font-bold ${data.controllerHealthy ? 'text-green-400' : 'text-red-400'}`}>
                {data.controllerHealthy
                  ? t('kubeFlexStatus.controllerUp', 'Up')
                  : t('kubeFlexStatus.controllerDown', 'Down')}
              </p>
              <p className="text-xs text-muted-foreground">{t('kubeFlexStatus.controller', 'Controller')}</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Layers className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-xl font-bold text-purple-400">{controlPlanes.length}</p>
              <p className="text-xs text-muted-foreground">{t('kubeFlexStatus.controlPlanes', 'Control Planes')}</p>
            </div>
            <div className="p-3 rounded-lg bg-cyan-500/10 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Layers className="w-4 h-4 text-cyan-400" />
              </div>
              <p className="text-xl font-bold text-cyan-400">{data.tenantCount}</p>
              <p className="text-xs text-muted-foreground">{t('kubeFlexStatus.tenants', 'Tenants')}</p>
            </div>
          </div>

          {/* Control plane health summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-lg font-bold text-green-400">{healthyCPs}</p>
                <p className="text-xs text-muted-foreground">{t('kubeFlexStatus.cpHealthy', 'Healthy')}</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-400" />
              <div>
                <p className={`text-lg font-bold ${unhealthyCPs > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                  {unhealthyCPs}
                </p>
                <p className="text-xs text-muted-foreground">{t('kubeFlexStatus.cpUnhealthy', 'Unhealthy')}</p>
              </div>
            </div>
          </div>

          {/* Health bar */}
          {controlPlanes.length > 0 && (
            <div className="space-y-1">
              <div className="flex h-3 rounded-full overflow-hidden bg-secondary/50">
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${(healthyCPs / controlPlanes.length) * 100}%` }}
                  title={`Healthy: ${healthyCPs}`}
                />
                {unhealthyCPs > 0 && (
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${(unhealthyCPs / controlPlanes.length) * 100}%` }}
                    title={`Unhealthy: ${unhealthyCPs}`}
                  />
                )}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('kubeFlexStatus.searchControlPlanes', 'Search control planes...')}
              className="w-full pl-9 pr-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Control plane list */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t('kubeFlexStatus.controlPlaneList', 'Control Planes')}
            </p>
            {filteredCPs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {controlPlanes.length === 0
                  ? t('kubeFlexStatus.noControlPlanes', 'No control planes found.')
                  : t('kubeFlexStatus.noControlPlaneMatch', 'No control planes match your search.')}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredCPs.map((cp) => (
                  <ControlPlaneRow key={cp.name} cp={cp} />
                ))}
              </div>
            )}
          </div>

          {/* Unhealthy warning */}
          {unhealthyCPs > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <XCircle className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="text-xs text-orange-400">
                {t('kubeFlexStatus.unhealthyCPWarning', { count: unhealthyCPs })}
              </p>
            </div>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href="https://github.com/kubestellar/kubeflex"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {t('kubeFlexStatus.openDocs', 'KubeFlex Docs')}
        </a>
      </BaseModal.Footer>
    </BaseModal>
  )
}
