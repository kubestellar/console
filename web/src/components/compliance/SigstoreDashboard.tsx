/**
 * Sigstore Dashboard — Image Signature Verification
 *
 * Cosign verification results, transparency log entries,
 * and trust chain visualization.
 */
import { useState, useEffect, memo, useCallback, useRef } from 'react'
import {
  BadgeCheck, CheckCircle2, Loader2, AlertTriangle,
  XCircle, ShieldCheck, FileKey
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { sigstoreDashboardConfig } from '../../config/dashboards/sigstore'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

// ── Types ───────────────────────────────────────────────────────────────

interface SigstoreSignature {
  image: string
  digest: string
  signed: boolean
  signer: string
  issuer: string
  timestamp: string
  transparency_log: boolean
  status: 'verified' | 'failed' | 'pending'
}

interface SigstoreVerification {
  id: string
  image: string
  policy: string
  result: 'pass' | 'fail' | 'warn'
  checked_at: string
  cosign_version: string
  certificate_chain: number
  rekor_entry: boolean
}

interface SigstoreSummary {
  total_images: number
  signed_images: number
  unsigned_images: number
  verified_signatures: number
  failed_verifications: number
  pending_verifications: number
  transparency_log_entries: number
  trust_roots: number
  policies_enforced: number
  last_verification: string
}

interface SigningImage {
  image: string
  digest: string
  signed: boolean
  verified: boolean
  signer: string
  keyless: boolean
  transparency_log: boolean
  signed_at: string | null
}

interface SigningPolicy {
  name: string
  cluster: string
  mode: 'enforce' | 'warn' | 'audit'
  scope: string
  rules: number
  violations: number
}

interface SigningSummary {
  total_images: number
  signed_images: number
  verified_images: number
  unsigned_images: number
  policy_violations: number
  clusters_covered: number
  evaluated_at: string
}

const SIGNING_IMAGES_ENDPOINT = '/api/supply-chain/signing/images'
const SIGNING_POLICIES_ENDPOINT = '/api/supply-chain/signing/policies'
const SIGNING_SUMMARY_ENDPOINT = '/api/supply-chain/signing/summary'
const NOT_AVAILABLE = '—'

function getSignatureStatus(image: SigningImage): SigstoreSignature['status'] {
  if (image.verified) return 'verified'
  if (image.signed) return 'pending'
  return 'failed'
}

function buildSignatures(images: SigningImage[]): SigstoreSignature[] {
  return images.map((image) => ({
    image: image.image,
    digest: image.digest,
    signed: image.signed,
    signer: image.signer || NOT_AVAILABLE,
    issuer: image.keyless ? 'Sigstore keyless' : 'Keyed signature',
    timestamp: image.signed_at ?? NOT_AVAILABLE,
    transparency_log: image.transparency_log,
    status: getSignatureStatus(image),
  }))
}

function buildVerifications(policies: SigningPolicy[]): SigstoreVerification[] {
  return policies.map((policy, index) => ({
    id: `${policy.cluster}-${policy.name}-${index}`,
    image: policy.scope,
    policy: policy.name,
    result: policy.violations > 0 ? (policy.mode === 'warn' ? 'warn' : 'fail') : 'pass',
    checked_at: NOT_AVAILABLE,
    cosign_version: policy.mode,
    certificate_chain: policy.rules,
    rekor_entry: false,
  }))
}

function buildSummary(summary: SigningSummary, policies: SigningPolicy[]): SigstoreSummary {
  return {
    total_images: summary.total_images,
    signed_images: summary.signed_images,
    unsigned_images: summary.unsigned_images,
    verified_signatures: summary.verified_images,
    failed_verifications: summary.policy_violations,
    pending_verifications: Math.max(summary.signed_images - summary.verified_images, 0),
    transparency_log_entries: summary.verified_images,
    trust_roots: summary.clusters_covered,
    policies_enforced: policies.length,
    last_verification: summary.evaluated_at,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

const RESULT_COLORS: Record<string, string> = {
  pass: 'text-green-400',
  fail: 'text-red-400',
  warn: 'text-yellow-400',
  verified: 'text-green-400',
  failed: 'text-red-400',
  pending: 'text-yellow-400',
}

const RESULT_BG: Record<string, string> = {
  pass: 'bg-green-500/20 border-green-500/30',
  fail: 'bg-red-500/20 border-red-500/30',
  warn: 'bg-yellow-500/20 border-yellow-500/30',
  verified: 'bg-green-500/20 border-green-500/30',
  failed: 'bg-red-500/20 border-red-500/30',
  pending: 'bg-yellow-500/20 border-yellow-500/30',
}

const RESULT_ICON: Record<string, React.ReactNode> = {
  pass: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  fail: <XCircle className="w-4 h-4 text-red-400" />,
  warn: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
  verified: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  failed: <XCircle className="w-4 h-4 text-red-400" />,
  pending: <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />,
}

// ── Content Component ───────────────────────────────────────────────────

export const SigstoreDashboardContent = memo(function SigstoreDashboardContent() {
  const [signatures, setSignatures] = useState<SigstoreSignature[]>([])
  const [verifications, setVerifications] = useState<SigstoreVerification[]>([])
  const [summary, setSummary] = useState<SigstoreSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'signatures' | 'verifications'>('signatures')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const cancelledRef = useRef(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [imagesResponse, policiesResponse, summaryResponse] = await Promise.all([
        authFetch(SIGNING_IMAGES_ENDPOINT),
        authFetch(SIGNING_POLICIES_ENDPOINT),
        authFetch(SIGNING_SUMMARY_ENDPOINT),
      ])
      if (!imagesResponse.ok || !policiesResponse.ok || !summaryResponse.ok) throw new Error('Failed to fetch Sigstore data')

      const imagesData = await imagesResponse.json()
      const policiesData = await policiesResponse.json()
      const images = Array.isArray(imagesData) ? imagesData as SigningImage[] : []
      const policies = Array.isArray(policiesData) ? policiesData as SigningPolicy[] : []
      if (cancelledRef.current) return
      setSignatures(buildSignatures(images))
      setVerifications(buildVerifications(policies))

      const summaryData = await summaryResponse.json()
      setSummary(summaryData && typeof summaryData === 'object' && !Array.isArray(summaryData)
        ? buildSummary(summaryData as SigningSummary, policies)
        : null)
    } catch (e: unknown) {
      if (cancelledRef.current) return
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      if (cancelledRef.current) return
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    fetchData()
    return () => { cancelledRef.current = true }
  }, [fetchData])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-foreground">Loading Sigstore data…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-red-400">{error}</p>
    </div>
  )

  const signedPct = summary ? Math.round((summary.signed_images / Math.max(summary.total_images, 1)) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHeader
        title="Sigstore Verification"
        subtitle="Cryptographic signing and verification of container images and artifacts"
        isFetching={loading}
        onRefresh={fetchData}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="sigstore-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Images</p>
            <p className="text-2xl font-bold text-white mt-1">{summary.total_images}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Signed</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{summary.signed_images} <span className="text-sm text-gray-400">({signedPct}%)</span></p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Verified</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{summary.verified_signatures}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Rekor Entries</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{summary.transparency_log_entries}</p>
          </div>
        </div>
      )}

      {/* Trust chain */}
      {summary && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <FileKey className="w-4 h-4 text-green-400" />
            Trust Chain
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-gray-900/50 border border-gray-600 rounded px-3 py-2">
              <ShieldCheck className="w-4 h-4 text-green-400" />
              <span className="text-sm text-muted-foreground">{summary.trust_roots} Trust Roots</span>
            </div>
            <span className="text-gray-600">→</span>
            <div className="flex items-center gap-2 bg-gray-900/50 border border-gray-600 rounded px-3 py-2">
              <BadgeCheck className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-muted-foreground">{summary.policies_enforced} Policies</span>
            </div>
            <span className="text-gray-600">→</span>
            <div className="flex items-center gap-2 bg-gray-900/50 border border-gray-600 rounded px-3 py-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-sm text-muted-foreground">{summary.verified_signatures} Verified</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'signatures' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-foreground'}`}
          onClick={() => setActiveTab('signatures')}
        >
          <BadgeCheck className="w-4 h-4 inline mr-1" /> Signatures ({signatures.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'verifications' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-foreground'}`}
          onClick={() => setActiveTab('verifications')}
        >
          <ShieldCheck className="w-4 h-4 inline mr-1" /> Verifications ({verifications.length})
        </button>
      </div>

      {/* Signatures table */}
      {activeTab === 'signatures' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="py-2 px-3 text-gray-400 font-medium">Image</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Signer</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Issuer</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Rekor</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {signatures.map((s, i) => (
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/30">
                  <td className="py-2 px-3 text-white font-mono text-xs max-w-xs truncate">{s.image}</td>
                  <td className="py-2 px-3 text-foreground text-xs">{s.signer}</td>
                  <td className="py-2 px-3 text-foreground text-xs">{s.issuer}</td>
                  <td className="py-2 px-3">
                    {s.transparency_log ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-gray-500" />}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${RESULT_BG[s.status]} ${RESULT_COLORS[s.status]}`}>
                      {RESULT_ICON[s.status]}
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Verifications table */}
      {activeTab === 'verifications' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="py-2 px-3 text-gray-400 font-medium">Image</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Policy</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Cosign</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Cert Chain</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {verifications.map((v) => (
                <tr key={v.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                  <td className="py-2 px-3 text-white font-mono text-xs max-w-xs truncate">{v.image}</td>
                  <td className="py-2 px-3 text-foreground text-xs">{v.policy}</td>
                  <td className="py-2 px-3 text-foreground text-xs">{v.cosign_version}</td>
                  <td className="py-2 px-3 text-foreground">{v.certificate_chain} certs</td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${RESULT_BG[v.result]} ${RESULT_COLORS[v.result]}`}>
                      {RESULT_ICON[v.result]}
                      {v.result}
                    </span>
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

export default function SigstoreDashboard() {
  return (<>
    <SigstoreDashboardContent />
    <UnifiedDashboard config={sigstoreDashboardConfig} />
  </>)
}
