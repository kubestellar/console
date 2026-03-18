/**
 * OVN Detail Modal — drill-down view for OVN-Kubernetes status.
 *
 * Shows full UDN list with network type, role, subnet details,
 * and pod health details with name, status, and node info.
 *
 * Follows the TrivyDetailModal pattern using BaseModal compound components.
 */

import { useMemo, useState } from 'react'
import { Network, Search, ExternalLink, CheckCircle, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../../lib/modals'
import { StatusBadge } from '../../../ui/StatusBadge'
import type { OvnStatus } from './useOvnStatus'
import type { UdnInfo } from './helpers'

// ============================================================================
// Constants
// ============================================================================

/** Number of columns in the UDN summary grid */
const UDN_SUMMARY_GRID_COLS = 3

/** Tab identifiers */
const TAB_UDNS = 'udns' as const
const TAB_PODS = 'pods' as const

// ============================================================================
// Types
// ============================================================================

interface OvnDetailModalProps {
  isOpen: boolean
  onClose: () => void
  data: OvnStatus
  isDemoData?: boolean
}

type TabId = typeof TAB_UDNS | typeof TAB_PODS

// ============================================================================
// Sub-components
// ============================================================================

/** Color classes for network types */
const NETWORK_TYPE_COLORS: Record<string, string> = {
  layer2: 'text-teal-400 bg-teal-500/15',
  layer3: 'text-cyan-400 bg-cyan-500/15',
  unknown: 'text-zinc-400 bg-zinc-500/15',
}

/** Color classes for UDN roles */
const ROLE_COLORS: Record<string, string> = {
  primary: 'text-purple-400 bg-purple-500/15',
  secondary: 'text-blue-400 bg-blue-500/15',
  unknown: 'text-zinc-400 bg-zinc-500/15',
}

function UdnRow({ udn }: { udn: UdnInfo }) {
  const networkTypeColor = NETWORK_TYPE_COLORS[udn.networkType] || NETWORK_TYPE_COLORS.unknown
  const roleColor = ROLE_COLORS[udn.role] || ROLE_COLORS.unknown

  return (
    <div className="flex items-center justify-between text-sm gap-3 px-3 py-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Network className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-foreground truncate font-medium" title={udn.name}>
          {udn.name}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${networkTypeColor}`}>
          {udn.networkType === 'layer2' ? 'Layer 2' : udn.networkType === 'layer3' ? 'Layer 3' : 'Unknown'}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${roleColor}`}>
          {udn.role}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

export function OvnDetailModal({ isOpen, onClose, data, isDemoData }: OvnDetailModalProps) {
  const { t } = useTranslation('cards')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>(TAB_UDNS)

  const udns = data.udns || []
  const layer2Count = udns.filter((u) => u.networkType === 'layer2').length
  const layer3Count = udns.filter((u) => u.networkType === 'layer3').length
  const primaryCount = udns.filter((u) => u.role === 'primary').length
  const secondaryCount = udns.filter((u) => u.role === 'secondary').length

  const isHealthy = data.health === 'healthy'

  // Filter UDNs by search
  const filteredUdns = useMemo(() => {
    if (!search.trim()) return udns
    const q = search.toLowerCase()
    return udns.filter(
      (udn) =>
        udn.name.toLowerCase().includes(q) ||
        udn.networkType.toLowerCase().includes(q) ||
        udn.role.toLowerCase().includes(q),
    )
  }, [udns, search])

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('ovnStatus.detailTitle', 'OVN-Kubernetes Details')}
        icon={Network}
        onClose={onClose}
        badges={
          <>
            {isDemoData && <StatusBadge color="yellow" size="sm">{t('cards:cardWrapper.demo', 'Demo')}</StatusBadge>}
            <StatusBadge color={isHealthy ? 'green' : 'orange'} size="sm">
              {data.podCount} {t('ovnStatus.ovnPods', 'pods')} · {udns.length} {t('ovnStatus.udnCount', 'UDNs')}
            </StatusBadge>
          </>
        }
      />

      <BaseModal.Content>
        <div className="space-y-4">
          {/* Pod health summary */}
          <div className={`grid grid-cols-${UDN_SUMMARY_GRID_COLS} gap-3`}>
            <div className="p-3 rounded-lg bg-blue-500/10 text-center">
              <p className="text-xl font-bold text-blue-400">{data.podCount}</p>
              <p className="text-xs text-muted-foreground">{t('ovnStatus.ovnPods', 'OVN Pods')}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 text-center">
              <p className="text-xl font-bold text-green-400">{data.healthyPods}</p>
              <p className="text-xs text-muted-foreground">{t('ovnStatus.healthyPods', 'Healthy')}</p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10 text-center">
              <p className={`text-xl font-bold ${data.unhealthyPods > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                {data.unhealthyPods}
              </p>
              <p className="text-xs text-muted-foreground">{t('ovnStatus.unhealthyPods', 'Unhealthy')}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border/50">
            <button
              onClick={() => setActiveTab(TAB_UDNS)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === TAB_UDNS
                  ? 'text-purple-400 border-purple-400'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {t('ovnStatus.udnList', 'User Defined Networks')} ({udns.length})
            </button>
            <button
              onClick={() => setActiveTab(TAB_PODS)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === TAB_PODS
                  ? 'text-purple-400 border-purple-400'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {t('ovnStatus.podHealth', 'Pod Health')}
            </button>
          </div>

          {/* UDN Tab */}
          {activeTab === TAB_UDNS && (
            <div className="space-y-3">
              {/* Network type breakdown */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-2 rounded bg-secondary/30 text-center">
                  <p className="text-sm font-bold text-foreground">{udns.length}</p>
                  <p className="text-[10px] text-muted-foreground">{t('ovnStatus.totalUdns', 'Total')}</p>
                </div>
                <div className="p-2 rounded bg-secondary/30 text-center">
                  <p className="text-sm font-bold text-cyan-400">{layer3Count}</p>
                  <p className="text-[10px] text-muted-foreground">{t('ovnStatus.layer3Networks', 'Layer 3')}</p>
                </div>
                <div className="p-2 rounded bg-secondary/30 text-center">
                  <p className="text-sm font-bold text-teal-400">{layer2Count}</p>
                  <p className="text-[10px] text-muted-foreground">{t('ovnStatus.layer2Networks', 'Layer 2')}</p>
                </div>
                <div className="p-2 rounded bg-secondary/30 text-center">
                  <p className="text-sm font-bold text-purple-400">{primaryCount}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t('ovnStatus.primaryNetworks', 'Primary')}
                    {secondaryCount > 0 && ` / ${secondaryCount} sec`}
                  </p>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('ovnStatus.searchUdns', 'Search networks...')}
                  className="w-full pl-9 pr-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* UDN list */}
              {filteredUdns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {udns.length === 0
                    ? t('ovnStatus.noUdns', 'No User Defined Networks found.')
                    : t('ovnStatus.noUdnMatch', 'No networks match your search.')}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredUdns.map((udn) => (
                    <UdnRow key={udn.name} udn={udn} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pod Health Tab */}
          {activeTab === TAB_PODS && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <div>
                    <p className="text-2xl font-bold text-green-400">{data.healthyPods}</p>
                    <p className="text-xs text-muted-foreground">{t('ovnStatus.healthyPods', 'Healthy Pods')}</p>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                  <XCircle className="w-6 h-6 text-red-400" />
                  <div>
                    <p className={`text-2xl font-bold ${data.unhealthyPods > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {data.unhealthyPods}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('ovnStatus.unhealthyPods', 'Unhealthy Pods')}</p>
                  </div>
                </div>
              </div>

              {/* Health bar */}
              {data.podCount > 0 && (
                <div className="space-y-1">
                  <div className="flex h-3 rounded-full overflow-hidden bg-secondary/50">
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${(data.healthyPods / data.podCount) * 100}%` }}
                      title={`Healthy: ${data.healthyPods}`}
                    />
                    {data.unhealthyPods > 0 && (
                      <div
                        className="bg-red-500 transition-all"
                        style={{ width: `${(data.unhealthyPods / data.podCount) * 100}%` }}
                        title={`Unhealthy: ${data.unhealthyPods}`}
                      />
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="text-green-400">
                      {t('ovnStatus.healthyPods', 'Healthy')}: {data.healthyPods}
                    </span>
                    {data.unhealthyPods > 0 && (
                      <span className="text-red-400">
                        {t('ovnStatus.unhealthyPods', 'Unhealthy')}: {data.unhealthyPods}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {t('ovnStatus.podHealthNote', 'OVN infrastructure pods include ovnkube-node, ovnkube-master, and ovnkube-controller DaemonSets.')}
              </p>
            </div>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href="https://github.com/ovn-org/ovn-kubernetes"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {t('ovnStatus.openDocs', 'OVN-Kubernetes Docs')}
        </a>
      </BaseModal.Footer>
    </BaseModal>
  )
}
