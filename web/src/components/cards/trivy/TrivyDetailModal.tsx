/**
 * Trivy Detail Modal — drill-down view for a cluster's vulnerability data.
 *
 * Shows per-image vulnerability table sorted by critical+high severity,
 * plus a severity summary header with colored bars.
 *
 * Follows the ClusterOPAModal pattern using BaseModal compound components.
 */

import { useMemo, useState } from 'react'
import { Shield, Search, ExternalLink } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { StatusBadge } from '../../ui/StatusBadge'
import { RefreshButton } from '../../ui/RefreshIndicator'
import type { TrivyClusterStatus } from '../../../hooks/useTrivy'

interface TrivyDetailModalProps {
  isOpen: boolean
  onClose: () => void
  clusterName: string
  status: TrivyClusterStatus
  onRefresh: () => void
  isRefreshing?: boolean
}

export function TrivyDetailModal({
  isOpen,
  onClose,
  clusterName,
  status,
  onRefresh,
  isRefreshing = false,
}: TrivyDetailModalProps) {
  const [search, setSearch] = useState('')

  const { critical, high, medium, low } = status.vulnerabilities

  // Filter images by search
  const filteredImages = useMemo(() => {
    const images = status.images || []
    if (!search.trim()) return images
    const q = search.toLowerCase()
    return images.filter(img =>
      (img.image || '').toLowerCase().includes(q) ||
      (img.tag || '').toLowerCase().includes(q) ||
      (img.namespace || '').toLowerCase().includes(q)
    )
  }, [status.images, search])

  // Severity bar widths
  const total = critical + high + medium + low
  const severitySegments = total > 0 ? [
    { label: 'Critical', count: critical, color: 'bg-red-500', textColor: 'text-red-400' },
    { label: 'High', count: high, color: 'bg-orange-500', textColor: 'text-orange-400' },
    { label: 'Medium', count: medium, color: 'bg-yellow-500', textColor: 'text-yellow-400' },
    { label: 'Low', count: low, color: 'bg-blue-500', textColor: 'text-blue-400' },
  ] : []

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title={`Trivy Scan — ${clusterName}`}
        icon={Shield}
        onClose={onClose}
        badges={
          <StatusBadge color={critical > 0 ? 'red' : high > 0 ? 'orange' : 'green'} size="sm">
            {status.scannedImages} images · {status.totalReports} reports
          </StatusBadge>
        }
        extra={
          <RefreshButton
            isRefreshing={isRefreshing}
            onRefresh={onRefresh}
            size="sm"
          />
        }
      />

      <BaseModal.Content>
        <div className="space-y-4">
          {/* Severity summary */}
          <div className="grid grid-cols-4 gap-3">
            <SeverityBox label="Critical" count={critical} color="text-red-400" bg="bg-red-500/10" />
            <SeverityBox label="High" count={high} color="text-orange-400" bg="bg-orange-500/10" />
            <SeverityBox label="Medium" count={medium} color="text-yellow-400" bg="bg-yellow-500/10" />
            <SeverityBox label="Low" count={low} color="text-blue-400" bg="bg-blue-500/10" />
          </div>

          {/* Severity bar */}
          {total > 0 && (
            <div className="space-y-1">
              <div className="flex h-3 rounded-full overflow-hidden bg-secondary/50">
                {severitySegments.map(seg => (
                  <div
                    key={seg.label}
                    className={`${seg.color} transition-all`}
                    style={{ width: `${(seg.count / total) * 100}%` }}
                    title={`${seg.label}: ${seg.count}`}
                  />
                ))}
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                {severitySegments.filter(s => s.count > 0).map(seg => (
                  <span key={seg.label} className={seg.textColor}>
                    {seg.label}: {seg.count}
                  </span>
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
              placeholder="Search images..."
              className="w-full pl-9 pr-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Image table */}
          {filteredImages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {(status.images || []).length === 0
                ? 'No vulnerability reports available.'
                : 'No images match your search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-xs text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Image</th>
                    <th className="text-left py-2 px-2 font-medium">Namespace</th>
                    <th className="text-center py-2 px-1 font-medium text-red-400">C</th>
                    <th className="text-center py-2 px-1 font-medium text-orange-400">H</th>
                    <th className="text-center py-2 px-1 font-medium text-yellow-400">M</th>
                    <th className="text-center py-2 px-1 font-medium text-blue-400">L</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredImages.map((img, i) => (
                    <tr
                      key={`${img.image}-${img.namespace}-${i}`}
                      className="border-b border-border/20 hover:bg-secondary/30 transition-colors"
                    >
                      <td className="py-2 px-2">
                        <span className="font-mono text-xs text-foreground">{img.image}</span>
                        <span className="text-muted-foreground text-xs">:{img.tag}</span>
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">{img.namespace}</td>
                      <td className="py-2 px-1 text-center">
                        <SeverityCell count={img.critical} level="critical" />
                      </td>
                      <td className="py-2 px-1 text-center">
                        <SeverityCell count={img.high} level="high" />
                      </td>
                      <td className="py-2 px-1 text-center">
                        <SeverityCell count={img.medium} level="medium" />
                      </td>
                      <td className="py-2 px-1 text-center">
                        <SeverityCell count={img.low} level="low" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href="https://aquasecurity.github.io/trivy-operator/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-cyan-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Trivy Operator Docs
        </a>
      </BaseModal.Footer>
    </BaseModal>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────

function SeverityBox({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <div className={`p-3 rounded-lg ${bg} text-center`}>
      <p className={`text-xl font-bold ${color}`}>{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-400 font-bold',
  high: 'text-orange-400 font-medium',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
}

function SeverityCell({ count, level }: { count: number; level: string }) {
  if (count === 0) return <span className="text-xs text-zinc-600">0</span>
  return <span className={`text-xs ${SEVERITY_COLORS[level] || ''}`}>{count}</span>
}
