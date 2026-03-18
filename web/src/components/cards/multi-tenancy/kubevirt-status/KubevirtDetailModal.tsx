/**
 * KubeVirt Detail Modal — drill-down view for KubeVirt status.
 *
 * Shows full VM list with name, namespace, state, and resource info.
 * Also displays VM state breakdown as colored segments and tenant distribution.
 *
 * Follows the TrivyDetailModal pattern using BaseModal compound components.
 */

import { useMemo, useState } from 'react'
import { Monitor, Search, ExternalLink, CheckCircle, XCircle, Server, Users, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../../lib/modals'
import { StatusBadge } from '../../../ui/StatusBadge'
import type { KubevirtStatus } from './useKubevirtStatus'
import type { VmInfo } from './demoData'

// ============================================================================
// Constants
// ============================================================================

/** Number of columns in the top summary grid */
const SUMMARY_GRID_COLS = 3

/** VM state color map for badges */
const VM_STATE_BADGE_COLORS: Record<string, string> = {
  running: 'text-green-400 bg-green-500/15',
  stopped: 'text-zinc-400 bg-zinc-500/15',
  migrating: 'text-blue-400 bg-blue-500/15',
  pending: 'text-yellow-400 bg-yellow-500/15',
  failed: 'text-red-400 bg-red-500/15',
  unknown: 'text-muted-foreground bg-secondary',
}

/** VM state color for the breakdown bar */
const VM_STATE_BAR_COLORS: Record<string, string> = {
  running: 'bg-green-500',
  stopped: 'bg-zinc-500',
  migrating: 'bg-blue-500',
  pending: 'bg-yellow-500',
  failed: 'bg-red-500',
  unknown: 'bg-zinc-600',
}

/** VM state text colors for breakdown labels */
const VM_STATE_TEXT_COLORS: Record<string, string> = {
  running: 'text-green-400',
  stopped: 'text-zinc-400',
  migrating: 'text-blue-400',
  pending: 'text-yellow-400',
  failed: 'text-red-400',
  unknown: 'text-muted-foreground',
}

// ============================================================================
// Types
// ============================================================================

interface KubevirtDetailModalProps {
  isOpen: boolean
  onClose: () => void
  data: KubevirtStatus
  isDemoData?: boolean
}

// ============================================================================
// Sub-components
// ============================================================================

function VmRow({ vm }: { vm: VmInfo }) {
  const stateColor = VM_STATE_BADGE_COLORS[vm.state] || VM_STATE_BADGE_COLORS.unknown

  return (
    <div className="flex items-center justify-between text-sm gap-3 px-3 py-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Monitor className="w-4 h-4 text-purple-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-foreground truncate font-medium block" title={vm.name}>
            {vm.name}
          </span>
          <span className="text-[10px] text-muted-foreground truncate block" title={vm.namespace}>
            {vm.namespace}
          </span>
        </div>
      </div>
      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize shrink-0 ${stateColor}`}>
        {vm.state}
      </span>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

export function KubevirtDetailModal({ isOpen, onClose, data, isDemoData }: KubevirtDetailModalProps) {
  const { t } = useTranslation('cards')
  const [search, setSearch] = useState('')

  const vms = data.vms || []
  const isHealthy = data.health === 'healthy'

  // Count VMs by state
  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const vm of vms) {
      counts[vm.state] = (counts[vm.state] || 0) + 1
    }
    return counts
  }, [vms])

  // Breakdown segments for the state bar
  const stateSegments = useMemo(() => {
    const total = vms.length
    if (total === 0) return []
    return Object.entries(stateCounts)
      .filter(([, count]) => count > 0)
      .map(([state, count]) => ({
        state,
        count,
        pct: (count / total) * 100,
        barColor: VM_STATE_BAR_COLORS[state] || VM_STATE_BAR_COLORS.unknown,
        textColor: VM_STATE_TEXT_COLORS[state] || VM_STATE_TEXT_COLORS.unknown,
      }))
  }, [vms.length, stateCounts])

  // Group VMs by namespace for tenant distribution
  const tenantDistribution = useMemo(() => {
    const nsMap = new Map<string, number>()
    for (const vm of vms) {
      nsMap.set(vm.namespace, (nsMap.get(vm.namespace) || 0) + 1)
    }
    return Array.from(nsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([ns, count]) => ({ namespace: ns, vmCount: count }))
  }, [vms])

  // Filter VMs by search
  const filteredVMs = useMemo(() => {
    if (!search.trim()) return vms
    const q = search.toLowerCase()
    return vms.filter(
      (vm) =>
        vm.name.toLowerCase().includes(q) ||
        vm.namespace.toLowerCase().includes(q) ||
        vm.state.toLowerCase().includes(q),
    )
  }, [vms, search])

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('kubevirtStatus.detailTitle', 'KubeVirt Details')}
        icon={Monitor}
        onClose={onClose}
        badges={
          <>
            {isDemoData && <StatusBadge color="yellow" size="sm">{t('cards:cardWrapper.demo', 'Demo')}</StatusBadge>}
            <StatusBadge color={isHealthy ? 'green' : 'orange'} size="sm">
              {vms.length} {t('kubevirtStatus.totalVMs', 'VMs')} · {data.tenantCount} {t('kubevirtStatus.tenants', 'tenants')}
            </StatusBadge>
          </>
        }
      />

      <BaseModal.Content>
        <div className="space-y-4">
          {/* Top summary */}
          <div className={`grid grid-cols-${SUMMARY_GRID_COLS} gap-3`}>
            <div className="p-3 rounded-lg bg-blue-500/10 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Server className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-xl font-bold text-blue-400">{data.podCount}</p>
              <p className="text-xs text-muted-foreground">{t('kubevirtStatus.infraPods', 'Infra Pods')}</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Monitor className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-xl font-bold text-purple-400">{vms.length}</p>
              <p className="text-xs text-muted-foreground">{t('kubevirtStatus.totalVMs', 'Total VMs')}</p>
            </div>
            <div className="p-3 rounded-lg bg-cyan-500/10 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <p className="text-xl font-bold text-cyan-400">{data.tenantCount}</p>
              <p className="text-xs text-muted-foreground">{t('kubevirtStatus.tenants', 'Tenants')}</p>
            </div>
          </div>

          {/* VM state breakdown */}
          {vms.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('kubevirtStatus.stateBreakdown', 'VM State Breakdown')}
              </p>
              <div className="grid grid-cols-4 gap-2">
                <div className="p-2 rounded bg-green-500/10 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  </div>
                  <p className="text-sm font-bold text-green-400">{stateCounts['running'] || 0}</p>
                  <p className="text-[10px] text-muted-foreground">{t('kubevirtStatus.runningVMs', 'Running')}</p>
                </div>
                <div className="p-2 rounded bg-zinc-500/10 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <XCircle className="w-3 h-3 text-zinc-400" />
                  </div>
                  <p className="text-sm font-bold text-zinc-400">{stateCounts['stopped'] || 0}</p>
                  <p className="text-[10px] text-muted-foreground">{t('kubevirtStatus.stoppedVMs', 'Stopped')}</p>
                </div>
                <div className="p-2 rounded bg-blue-500/10 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <RefreshCw className="w-3 h-3 text-blue-400" />
                  </div>
                  <p className="text-sm font-bold text-blue-400">{stateCounts['migrating'] || 0}</p>
                  <p className="text-[10px] text-muted-foreground">{t('kubevirtStatus.migratingVMs', 'Migrating')}</p>
                </div>
                <div className="p-2 rounded bg-red-500/10 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <XCircle className="w-3 h-3 text-red-400" />
                  </div>
                  <p className="text-sm font-bold text-red-400">
                    {(stateCounts['failed'] || 0) + (stateCounts['pending'] || 0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t('kubevirtStatus.failedPending', 'Failed/Pending')}</p>
                </div>
              </div>

              {/* State bar */}
              <div className="flex h-3 rounded-full overflow-hidden bg-secondary/50">
                {(stateSegments || []).map((seg) => (
                  <div
                    key={seg.state}
                    className={`${seg.barColor} transition-all`}
                    style={{ width: `${seg.pct}%` }}
                    title={`${seg.state}: ${seg.count}`}
                  />
                ))}
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                {(stateSegments || []).map((seg) => (
                  <span key={seg.state} className={seg.textColor}>
                    {seg.state}: {seg.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tenant distribution */}
          {(tenantDistribution || []).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {t('kubevirtStatus.tenantDistribution', 'Tenant Distribution')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(tenantDistribution || []).map((td) => (
                  <div key={td.namespace} className="p-2 rounded bg-secondary/30 text-center">
                    <p className="text-sm font-bold text-foreground">{td.vmCount}</p>
                    <p className="text-[10px] text-muted-foreground truncate" title={td.namespace}>
                      {td.namespace}
                    </p>
                  </div>
                ))}
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
              placeholder={t('kubevirtStatus.searchVMs', 'Search VMs...')}
              className="w-full pl-9 pr-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* VM list */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t('kubevirtStatus.vmList', 'Virtual Machines')}
            </p>
            {filteredVMs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {vms.length === 0
                  ? t('kubevirtStatus.noVMs', 'No virtual machines found.')
                  : t('kubevirtStatus.noVMMatch', 'No VMs match your search.')}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredVMs.map((vm) => (
                  <VmRow key={`${vm.namespace}/${vm.name}`} vm={vm} />
                ))}
              </div>
            )}
          </div>

          {/* Unhealthy infra warning */}
          {data.unhealthyPods > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <XCircle className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="text-xs text-orange-400">
                {t('kubevirtStatus.unhealthyWarning', { count: data.unhealthyPods })}
              </p>
            </div>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href="https://kubevirt.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {t('kubevirtStatus.openDocs', 'KubeVirt Docs')}
        </a>
      </BaseModal.Footer>
    </BaseModal>
  )
}
