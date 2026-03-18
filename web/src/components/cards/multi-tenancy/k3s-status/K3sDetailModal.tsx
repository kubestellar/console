/**
 * K3s Detail Modal — drill-down view for K3s status.
 *
 * Shows full server pod list with name, version, node, status, and uptime.
 * Also displays agent pod distribution and health breakdown.
 *
 * Follows the TrivyDetailModal pattern using BaseModal compound components.
 */

import { useMemo, useState } from 'react'
import { Box, Search, ExternalLink, CheckCircle, XCircle, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../../../lib/modals'
import { StatusBadge } from '../../../ui/StatusBadge'
import type { K3sStatus } from './useK3sStatus'
import type { K3sServerPodInfo } from './demoData'

// ============================================================================
// Constants
// ============================================================================

/** Number of columns in the summary grid */
const SUMMARY_GRID_COLS = 3

/** Color classes for pod statuses */
const POD_STATUS_COLORS: Record<string, string> = {
  running: 'text-green-400 bg-green-500/15',
  pending: 'text-yellow-400 bg-yellow-500/15',
  failed: 'text-red-400 bg-red-500/15',
}

// ============================================================================
// Types
// ============================================================================

interface K3sDetailModalProps {
  isOpen: boolean
  onClose: () => void
  data: K3sStatus
}

// ============================================================================
// Sub-components
// ============================================================================

function ServerPodRow({ pod }: { pod: K3sServerPodInfo }) {
  const statusColor = POD_STATUS_COLORS[pod.status] || POD_STATUS_COLORS.failed

  return (
    <div className="flex items-center justify-between text-sm gap-3 px-3 py-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Server className="w-4 h-4 text-purple-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-foreground truncate font-medium block" title={pod.name}>
            {pod.name}
          </span>
          <span className="text-[10px] text-muted-foreground truncate block" title={pod.namespace}>
            {pod.namespace}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="px-2 py-0.5 rounded bg-secondary text-muted-foreground text-xs font-mono">
          {pod.version}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${statusColor}`}>
          {pod.status}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

export function K3sDetailModal({ isOpen, onClose, data }: K3sDetailModalProps) {
  const { t } = useTranslation('cards')
  const [search, setSearch] = useState('')

  const serverPods = data.serverPods || []
  const agentPodCount = data.podCount - serverPods.length
  const isHealthy = data.health === 'healthy'

  // Collect unique versions
  const versions = useMemo(() => {
    const versionSet = new Set<string>()
    for (const pod of serverPods) {
      versionSet.add(pod.version)
    }
    return Array.from(versionSet)
  }, [serverPods])

  // Filter pods by search
  const filteredPods = useMemo(() => {
    if (!search.trim()) return serverPods
    const q = search.toLowerCase()
    return serverPods.filter(
      (pod) =>
        pod.name.toLowerCase().includes(q) ||
        pod.namespace.toLowerCase().includes(q) ||
        pod.version.toLowerCase().includes(q) ||
        pod.status.toLowerCase().includes(q),
    )
  }, [serverPods, search])

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('k3sStatus.detailTitle', 'K3s Details')}
        icon={Box}
        onClose={onClose}
        badges={
          <StatusBadge color={isHealthy ? 'green' : 'orange'} size="sm">
            {data.podCount} {t('k3sStatus.totalPods', 'pods')} · {serverPods.length} {t('k3sStatus.serverPods', 'servers')}
          </StatusBadge>
        }
      />

      <BaseModal.Content>
        <div className="space-y-4">
          {/* Summary grid */}
          <div className={`grid grid-cols-${SUMMARY_GRID_COLS} gap-3`}>
            <div className="p-3 rounded-lg bg-blue-500/10 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Box className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-xl font-bold text-blue-400">{data.podCount}</p>
              <p className="text-xs text-muted-foreground">{t('k3sStatus.totalPods', 'Total Pods')}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <CheckCircle className="w-4 h-4 text-green-400" />
              </div>
              <p className="text-xl font-bold text-green-400">{data.healthyPods}</p>
              <p className="text-xs text-muted-foreground">{t('k3sStatus.healthyPods', 'Healthy')}</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Server className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-xl font-bold text-purple-400">{serverPods.length}</p>
              <p className="text-xs text-muted-foreground">{t('k3sStatus.serverPods', 'Servers')}</p>
            </div>
          </div>

          {/* Agent distribution */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">{t('k3sStatus.agentPods', 'Agent Pods')}</p>
              <p className="text-lg font-bold text-foreground">{agentPodCount >= 0 ? agentPodCount : 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">{t('k3sStatus.versions', 'Version(s)')}</p>
              <p className="text-sm font-mono text-foreground truncate" title={(versions || []).join(', ')}>
                {(versions || []).join(', ') || 'N/A'}
              </p>
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
                  {t('k3sStatus.healthyPods', 'Healthy')}: {data.healthyPods}
                </span>
                {data.unhealthyPods > 0 && (
                  <span className="text-red-400">
                    {t('k3sStatus.unhealthyWarning', { count: data.unhealthyPods })}
                  </span>
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
              placeholder={t('k3sStatus.searchPods', 'Search pods...')}
              className="w-full pl-9 pr-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Server pod list */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t('k3sStatus.serverPodList', 'Server Pods')}
            </p>
            {filteredPods.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {serverPods.length === 0
                  ? t('k3sStatus.noServerPods', 'No K3s server pods found.')
                  : t('k3sStatus.noServerPodMatch', 'No pods match your search.')}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredPods.map((pod) => (
                  <ServerPodRow key={pod.name} pod={pod} />
                ))}
              </div>
            )}
          </div>

          {/* Unhealthy warning */}
          {data.unhealthyPods > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <XCircle className="w-4 h-4 text-orange-400 shrink-0" />
              <p className="text-xs text-orange-400">
                {t('k3sStatus.unhealthyWarning', { count: data.unhealthyPods })}
              </p>
            </div>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href="https://k3s.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {t('k3sStatus.openDocs', 'K3s Docs')}
        </a>
      </BaseModal.Footer>
    </BaseModal>
  )
}
