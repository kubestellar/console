/**
 * Kubescape Detail Modal — drill-down view for a cluster's security posture.
 *
 * Shows per-control pass/fail table, framework breakdown, and overall score.
 *
 * Follows the ClusterOPAModal pattern using BaseModal compound components.
 */

import { useState, useMemo } from 'react'
import { Shield, Search, ExternalLink } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'
import { StatusBadge } from '../../ui/StatusBadge'
import { RefreshButton } from '../../ui/RefreshIndicator'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import type { KubescapeClusterStatus, KubescapeControl } from '../../../hooks/useKubescape'

/** Debounce delay for the search input filter pipeline (#6213). 250ms is
 * the same value `CardSearchInput` uses by default; long enough to absorb
 * a fast typist's keystrokes, short enough to feel instant. */
const SEARCH_DEBOUNCE_MS = 250

/** Score threshold for "good" status */
const SCORE_GOOD_THRESHOLD = 80
/** Score threshold for "warning" status */
const SCORE_WARNING_THRESHOLD = 60

interface KubescapeDetailModalProps {
  isOpen: boolean
  onClose: () => void
  clusterName: string
  status: KubescapeClusterStatus
  /** All cluster names available in the kubescape statuses */
  clusters?: string[]
  /** Callback to switch to a different cluster */
  onClusterChange?: (cluster: string) => void
  onRefresh: () => void
  isRefreshing?: boolean
}

export function KubescapeDetailModal({
  isOpen,
  onClose,
  clusterName,
  status,
  clusters,
  onClusterChange,
  onRefresh,
  isRefreshing = false }: KubescapeDetailModalProps) {
  const [search, setSearch] = useState('')
  // #6213: debounce the heavy filter so the input stays responsive on
  // 100+ control lists. The <input value={search}/> still updates at
  // typing speed; only the .filter() pipeline waits.
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)

  const score = status.overallScore
  const scoreColor = score >= SCORE_GOOD_THRESHOLD ? 'text-green-400' : score >= SCORE_WARNING_THRESHOLD ? 'text-yellow-400' : 'text-red-400'

  // Filter controls by debounced search (#6213).
  const filteredControls = useMemo(() => {
    const controls = status.controls || []
    if (!debouncedSearch.trim()) return controls
    const q = debouncedSearch.toLowerCase()
    return controls.filter(c =>
      c.id.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q)
    )
  }, [status.controls, debouncedSearch])

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={`Kubescape — ${clusterName}`}
        icon={Shield}
        onClose={onClose}
        badges={
          <StatusBadge
            color={score >= SCORE_GOOD_THRESHOLD ? 'green' : score >= SCORE_WARNING_THRESHOLD ? 'yellow' : 'red'}
            size="sm"
          >
            {score}% overall
          </StatusBadge>
        }
        extra={
          <div className="flex items-center gap-2">
            {clusters && clusters.length > 1 && onClusterChange && (
              <select
                value={clusterName}
                onChange={(e) => onClusterChange(e.target.value)}
                className="text-xs bg-secondary/50 border border-border rounded px-2 py-1 text-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
              >
                {clusters.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <RefreshButton
              isRefreshing={isRefreshing}
              onRefresh={onRefresh}
              size="sm"
            />
          </div>
        }
      />

      <BaseModal.Content>
        <div className="space-y-6">
          {/* Score gauge + framework breakdown */}
          <div className="flex items-start gap-6">
            {/* Score gauge */}
            <div className="shrink-0">
              <div className="relative w-24 h-24">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
                  <circle
                    cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeDasharray={`${score}, 100`}
                    className={scoreColor}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold ${scoreColor}`}>{score}%</span>
                </div>
              </div>
            </div>

            {/* Framework scores */}
            <div className="flex-1 space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Framework Scores</h3>
              {(status.frameworks || []).map((fw, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-y-2 text-sm">
                    <span className="text-foreground">{fw.name}</span>
                    <span className={`font-medium ${
                      fw.score >= SCORE_GOOD_THRESHOLD ? 'text-green-400' :
                      fw.score >= SCORE_WARNING_THRESHOLD ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {fw.score}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        fw.score >= SCORE_GOOD_THRESHOLD ? 'bg-green-500' :
                        fw.score >= SCORE_WARNING_THRESHOLD ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${fw.score}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{fw.passCount} passed</span>
                    <span>{fw.failCount} failed</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-secondary/30 text-center">
              <p className="text-xl font-bold text-foreground">{status.totalControls}</p>
              <p className="text-xs text-muted-foreground">Total Controls</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 text-center">
              <p className="text-xl font-bold text-green-400">{status.passedControls}</p>
              <p className="text-xs text-muted-foreground">Passed</p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/10 text-center">
              <p className="text-xl font-bold text-red-400">{status.failedControls}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>

          {/* Controls table */}
          {(status.controls || []).length > 0 && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search controls..."
                  className="w-full pl-9 pr-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-xs text-muted-foreground">
                      <th className="text-left py-2 px-2 font-medium">Control ID</th>
                      <th className="text-left py-2 px-2 font-medium">Name</th>
                      <th className="text-center py-2 px-2 font-medium">Status</th>
                      <th className="text-center py-2 px-2 font-medium text-green-400">Pass</th>
                      <th className="text-center py-2 px-2 font-medium text-red-400">Fail</th>
                      <th className="text-right py-2 px-2 font-medium">Ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredControls.map((control) => (
                      <ControlRow key={control.id} control={control} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <a
          href="https://kubescape.io/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-green-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Kubescape Docs
        </a>
      </BaseModal.Footer>
    </BaseModal>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────

function ControlRow({ control }: { control: KubescapeControl }) {
  const total = control.passed + control.failed
  const passRate = total > 0 ? Math.round((control.passed / total) * 100) : 0
  const isPassing = control.passed > control.failed

  return (
    <tr className="border-b border-border/20 hover:bg-secondary/30 transition-colors">
      <td className="py-2 px-2 font-mono text-xs text-muted-foreground">{control.id}</td>
      <td className="py-2 px-2 text-xs text-foreground">{control.name}</td>
      <td className="py-2 px-2 text-center">
        <StatusBadge color={isPassing ? 'green' : 'red'} size="xs">
          {isPassing ? 'pass' : 'fail'}
        </StatusBadge>
      </td>
      <td className="py-2 px-2 text-center text-xs text-green-400">{control.passed}</td>
      <td className="py-2 px-2 text-center text-xs text-red-400">{control.failed}</td>
      <td className="py-2 px-2 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <div className="w-12 h-1.5 rounded-full bg-secondary/50 overflow-hidden">
            <div
              className={`h-full rounded-full ${isPassing ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${passRate}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right">{passRate}%</span>
        </div>
      </td>
    </tr>
  )
}
