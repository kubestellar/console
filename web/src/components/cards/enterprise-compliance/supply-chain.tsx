/**
 * Supply chain cards: SBOM manager, Sigstore verify, and SLSA provenance.
 */
import { Package, Shield, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCardLoadingState } from '../CardDataContext'
import { useSummaryData, CardShell, MiniStat } from './shared'

// ── SBOM Manager Card ───────────────────────────────────────────────────────────

export function SBOMManagerCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/supply-chain/sbom/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="SBOM Manager" icon={Package} onClick={() => nav('/enterprise/sbom')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Components" value={data.total_components ?? 0} />
          <MiniStat label="Vulnerable" value={data.vulnerable_components ?? 0} color="text-red-400" />
          <MiniStat label="Critical" value={data.critical_count ?? 0} color="text-red-500" />
          <MiniStat label="Coverage" value={`${data.sbom_coverage ?? 0}%`} color="text-green-400" />
        </div>
      )}
    </CardShell>
  )
}

// ── Sigstore Verify Card ───────────────────────────────────────────────────────

export function SigstoreVerifyCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, number>>('/api/supply-chain/signing/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  return (
    <CardShell title="Sigstore Verify" icon={Shield} onClick={() => nav('/enterprise/sigstore')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Images" value={data.total_images ?? 0} />
          <MiniStat label="Signed" value={data.signed_images ?? 0} color="text-green-400" />
          <MiniStat label="Verified" value={data.verified_images ?? 0} color="text-green-400" />
          <MiniStat label="Violations" value={data.policy_violations ?? 0} color="text-red-400" />
        </div>
      )}
    </CardShell>
  )
}

// ── SLSA Provenance Card ──────────────────────────────────────────────────────

export function SLSAProvenanceCard() {
  const nav = useNavigate()
  const { data, isLoading, isRefreshing, isDemoFallback, isFailed, consecutiveFailures, error } = useSummaryData<Record<string, unknown>>('/api/supply-chain/slsa/summary')
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading: isLoading && !data,
    hasAnyData: data != null,
    isRefreshing,
    isDemoData: isDemoFallback,
    isFailed,
    consecutiveFailures,
  })
  const levelDistribution = (data?.level_distribution as Record<string, number> | undefined) ?? {}
  return (
    <CardShell title="SLSA Provenance" icon={Lock} onClick={() => nav('/enterprise/slsa')}>
      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : showSkeleton ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : showEmptyState || !data ? (
        <p className="text-muted-foreground text-sm">No data</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Workloads" value={Number(data.total_workloads ?? 0)} />
          <MiniStat label="Attested" value={Number(data.attested_workloads ?? 0)} color="text-green-400" />
          <MiniStat label="L3+" value={(levelDistribution['3'] ?? 0) + (levelDistribution['4'] ?? 0)} color="text-emerald-400" />
          <MiniStat label="Verified" value={Number(data.verified_workloads ?? 0)} color="text-green-400" />
        </div>
      )}
    </CardShell>
  )
}
