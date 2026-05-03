/**
 * SLSA Dashboard — Supply-chain Levels for Software Artifacts
 *
 * Build provenance level indicators (L1–L4), attestation verification,
 * source integrity checks, and build reproducibility.
 */
import { useState, useEffect, memo, useCallback } from 'react'
import {
  GitCommitHorizontal, CheckCircle2, Loader2, AlertTriangle,
  XCircle, Shield, Lock
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { slsaDashboardConfig } from '../../config/dashboards/slsa'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

// ── Types ───────────────────────────────────────────────────────────────

interface SLSAAttestation {
  id: string
  artifact: string
  builder: string
  slsa_level: 1 | 2 | 3 | 4
  verified: boolean
  build_type: string
  source_repo: string
  timestamp: string
  status: 'pass' | 'fail' | 'pending'
}

interface SLSAProvenance {
  id: string
  artifact: string
  builder_id: string
  build_level: 1 | 2 | 3 | 4
  source_uri: string
  source_digest: string
  reproducible: boolean
  hermetic: boolean
  parameterless: boolean
  timestamp: string
}

interface SLSASummary {
  total_artifacts: number
  attested_artifacts: number
  level_1: number
  level_2: number
  level_3: number
  level_4: number
  verified_attestations: number
  failed_attestations: number
  pending_attestations: number
  source_integrity_pass: number
  source_integrity_fail: number
  reproducible_builds: number
  total_builds: number
}

// ── Helpers ─────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-blue-400',
  3: 'text-green-400',
  4: 'text-emerald-400',
}

const LEVEL_BG: Record<number, string> = {
  1: 'bg-yellow-500/20 border-yellow-500/30',
  2: 'bg-blue-500/20 border-blue-500/30',
  3: 'bg-green-500/20 border-green-500/30',
  4: 'bg-emerald-500/20 border-emerald-500/30',
}

const STATUS_COLORS: Record<string, string> = {
  pass: 'text-green-400',
  fail: 'text-red-400',
  pending: 'text-yellow-400',
}

const STATUS_BG: Record<string, string> = {
  pass: 'bg-green-500/20 border-green-500/30',
  fail: 'bg-red-500/20 border-red-500/30',
  pending: 'bg-yellow-500/20 border-yellow-500/30',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  fail: <XCircle className="w-4 h-4 text-red-400" />,
  pending: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
}

// ── Content Component ───────────────────────────────────────────────────

export const SLSADashboardContent = memo(function SLSADashboardContent() {
  const [attestations, setAttestations] = useState<SLSAAttestation[]>([])
  const [provenance, setProvenance] = useState<SLSAProvenance[]>([])
  const [summary, setSummary] = useState<SLSASummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'attestations' | 'provenance'>('attestations')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [aRes, pRes, sRes] = await Promise.all([
        authFetch('/api/v1/compliance/slsa/attestations'),
        authFetch('/api/v1/compliance/slsa/provenance'),
        authFetch('/api/v1/compliance/slsa/summary'),
      ])
      if (!aRes.ok || !pRes.ok || !sRes.ok) throw new Error('Failed to fetch SLSA data')
      const aData = await aRes.json()
      const pData = await pRes.json()
      const sData = await sRes.json()
      setAttestations(Array.isArray(aData) ? aData : [])
      setProvenance(Array.isArray(pData) ? pData : [])
      setSummary(sData ?? null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-300">Loading SLSA data…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-red-400">{error}</p>
    </div>
  )

  const reprodPct = summary ? Math.round((summary.reproducible_builds / Math.max(summary.total_builds, 1)) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHeader
        title="SLSA Provenance"
        subtitle="Build provenance levels, attestation verification, and source integrity"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="slsa-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Artifacts</p>
            <p className="text-2xl font-bold text-white mt-1">{summary.total_artifacts}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Attested</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{summary.attested_artifacts}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Verified</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{summary.verified_attestations}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Reproducible</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{reprodPct}%</p>
          </div>
        </div>
      )}

      {/* SLSA Level distribution */}
      {summary && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            SLSA Level Distribution
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(level => {
              const count = summary[`level_${level}` as keyof SLSASummary] as number
              const total = Math.max(summary.total_artifacts, 1)
              const pct = Math.round((count / total) * 100)
              return (
                <div key={level} className={`rounded-lg border p-3 ${LEVEL_BG[level]}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-lg font-bold ${LEVEL_COLORS[level]}`}>L{level}</span>
                    <span className="text-xs text-gray-400">{count} artifacts</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: level === 1 ? 'rgb(234,179,8)' : level === 2 ? 'rgb(59,130,246)' : level === 3 ? 'rgb(34,197,94)' : 'rgb(16,185,129)' }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pct}%</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Source integrity */}
      {summary && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-400" />
            Source Integrity
          </h3>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              <span className="text-sm text-gray-300">Pass: <span className="text-white font-medium">{summary.source_integrity_pass}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-400" />
              <span className="text-sm text-gray-300">Fail: <span className="text-white font-medium">{summary.source_integrity_fail}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-gray-300">Reproducible: <span className="text-white font-medium">{summary.reproducible_builds}/{summary.total_builds}</span></span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'attestations' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
          onClick={() => setActiveTab('attestations')}
        >
          <Shield className="w-4 h-4 inline mr-1" /> Attestations ({attestations.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'provenance' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
          onClick={() => setActiveTab('provenance')}
        >
          <GitCommitHorizontal className="w-4 h-4 inline mr-1" /> Provenance ({provenance.length})
        </button>
      </div>

      {/* Attestations table */}
      {activeTab === 'attestations' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="py-2 px-3 text-gray-400 font-medium">Artifact</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Builder</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Level</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Source</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(attestations || []).map((a) => (
                <tr key={a.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                  <td className="py-2 px-3 text-white font-mono text-xs max-w-xs truncate">{a.artifact}</td>
                  <td className="py-2 px-3 text-gray-300 text-xs">{a.builder}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs border font-bold ${LEVEL_BG[a.slsa_level]} ${LEVEL_COLORS[a.slsa_level]}`}>
                      L{a.slsa_level}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-300 font-mono text-xs max-w-xs truncate">{a.source_repo}</td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${STATUS_BG[a.status]} ${STATUS_COLORS[a.status]}`}>
                      {STATUS_ICON[a.status]}
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Provenance table */}
      {activeTab === 'provenance' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="py-2 px-3 text-gray-400 font-medium">Artifact</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Builder</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Level</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Reproducible</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Hermetic</th>
              </tr>
            </thead>
            <tbody>
              {(provenance || []).map((p) => (
                <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                  <td className="py-2 px-3 text-white font-mono text-xs max-w-xs truncate">{p.artifact}</td>
                  <td className="py-2 px-3 text-gray-300 text-xs">{p.builder_id}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs border font-bold ${LEVEL_BG[p.build_level]} ${LEVEL_COLORS[p.build_level]}`}>
                      L{p.build_level}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {p.reproducible ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                  </td>
                  <td className="py-2 px-3">
                    {p.hermetic ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-gray-500" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
})

// ── Page Component (rendered by App.tsx route) ──────────────────────────

export default function SLSADashboard() {
  return (<>
    <SLSADashboardContent />
    <UnifiedDashboard config={slsaDashboardConfig} />
  </>)
}
