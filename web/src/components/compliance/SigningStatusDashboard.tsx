/**
 * Image Signing Status Dashboard — Issue #9646
 *
 * Displays Sigstore/Cosign signature verification results across the fleet.
 * Surfaces unsigned images, failed verifications, and policy violations so
 * operators can enforce supply chain integrity controls.
 */
import { useState, useEffect } from 'react'
import {
  BadgeCheck, XCircle, AlertTriangle, Loader2,
  RefreshCw, Shield, ShieldAlert, ShieldOff, Server,
} from 'lucide-react'
import { authFetch } from '../../lib/api'

/** Polling interval for signature status refresh (ms) */
const REFRESH_INTERVAL_MS = 120_000

interface SignedImage {
  image: string
  digest: string
  workload: string
  namespace: string
  cluster: string
  signed: boolean
  verified: boolean
  signer: string
  keyless: boolean
  transparency_log: boolean
  signed_at: string | null
  failure_reason: string | null
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

const MODE_STYLES: Record<string, string> = {
  enforce: 'bg-red-500/20 text-red-300 border-red-500/30',
  warn: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  audit: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
}

export default function SigningStatusDashboard() {
  const [images, setImages] = useState<SignedImage[]>([])
  const [policies, setPolicies] = useState<SigningPolicy[]>([])
  const [summary, setSummary] = useState<SigningSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'images' | 'policies'>('images')
  const [filterUnsigned, setFilterUnsigned] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [imgRes, polRes, sumRes] = await Promise.all([
        authFetch('/api/supply-chain/signing/images'),
        authFetch('/api/supply-chain/signing/policies'),
        authFetch('/api/supply-chain/signing/summary'),
      ])
      if (!imgRes.ok || !polRes.ok || !sumRes.ok) throw new Error('Failed to load signing data')
      setImages(await imgRes.json())
      setPolicies(await polRes.json())
      setSummary(await sumRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load signing data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      <span className="ml-3 text-gray-400">Loading signing status…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 text-center">
      <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
      <p className="text-red-300 mb-4">{error}</p>
      <button onClick={fetchData} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm">Retry</button>
    </div>
  )

  const displayImages = filterUnsigned ? images.filter((i) => !i.signed || !i.verified) : images
  const coveragePercent = summary
    ? Math.round((summary.signed_images / Math.max(summary.total_images, 1)) * 100)
    : 0

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BadgeCheck className="w-7 h-7 text-purple-400" />
            Sigstore / Cosign Verification
          </h1>
          <p className="text-gray-400 mt-1">
            Image signature verification and supply chain attestation across the fleet
          </p>
        </div>
        <button onClick={fetchData} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Refresh">
          <RefreshCw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Signature Coverage</div>
            <div className={`text-3xl font-bold ${coveragePercent >= 90 ? 'text-emerald-400' : coveragePercent >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
              {coveragePercent}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {summary.signed_images} of {summary.total_images} signed
            </div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Verified Images</div>
            <div className="text-3xl font-bold text-emerald-400">{summary.verified_images}</div>
            <div className="text-xs text-gray-500 mt-1">signature + chain verified</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Unsigned Images</div>
            <div className={`text-3xl font-bold ${summary.unsigned_images > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {summary.unsigned_images}
            </div>
            <div className="text-xs text-gray-500 mt-1">require immediate attention</div>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Policy Violations</div>
            <div className={`text-3xl font-bold ${summary.policy_violations > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
              {summary.policy_violations}
            </div>
            <div className="text-xs text-gray-500 mt-1">across {summary.clusters_covered} clusters</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/30 p-1 rounded-lg w-fit">
        {(['images', 'policies'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab === 'images' ? 'Image Inventory' : 'Signing Policies'}
          </button>
        ))}
      </div>

      {/* Images Tab */}
      {activeTab === 'images' && (
        <>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
              <input
                type="checkbox"
                checked={filterUnsigned}
                onChange={(e) => setFilterUnsigned(e.target.checked)}
                className="rounded"
              />
              Show unsigned / unverified only
            </label>
            <span className="text-xs text-gray-500">({displayImages.length} results)</span>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-left">
                  <th className="p-3">Image</th>
                  <th className="p-3">Workload</th>
                  <th className="p-3">Cluster</th>
                  <th className="p-3">Signed</th>
                  <th className="p-3">Verified</th>
                  <th className="p-3">Keyless</th>
                  <th className="p-3">Rekor</th>
                </tr>
              </thead>
              <tbody>
                {displayImages.map((img, i) => (
                  <tr key={i} className="border-b border-gray-700/50 hover:bg-white/5">
                    <td className="p-3">
                      <div className="text-white font-mono text-xs truncate max-w-[200px]">{img.image}</div>
                      <div className="text-gray-500 text-[10px] font-mono">{img.digest.substring(0, 20)}…</div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-gray-300">{img.workload}</span>
                      </div>
                      <div className="text-xs text-gray-500">{img.namespace}</div>
                    </td>
                    <td className="p-3 text-gray-400">{img.cluster}</td>
                    <td className="p-3">
                      {img.signed
                        ? <BadgeCheck className="w-4 h-4 text-emerald-400" />
                        : <ShieldOff className="w-4 h-4 text-red-400" />}
                    </td>
                    <td className="p-3">
                      {img.verified
                        ? <Shield className="w-4 h-4 text-emerald-400" />
                        : <ShieldAlert className="w-4 h-4 text-orange-400" />}
                      {img.failure_reason && (
                        <div className="text-[10px] text-red-400 mt-0.5">{img.failure_reason}</div>
                      )}
                    </td>
                    <td className="p-3">
                      {img.keyless
                        ? <span className="text-emerald-400 text-xs">Yes</span>
                        : <span className="text-gray-500 text-xs">No</span>}
                    </td>
                    <td className="p-3">
                      {img.transparency_log
                        ? <span className="text-emerald-400 text-xs">Logged</span>
                        : <span className="text-gray-500 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div className="space-y-3">
          {policies.map((policy, i) => (
            <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-purple-400" />
                  <div>
                    <div className="text-white font-medium">{policy.name}</div>
                    <div className="text-sm text-gray-400">{policy.cluster} · {policy.scope}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-full text-xs border ${MODE_STYLES[policy.mode] || ''}`}>
                    {policy.mode}
                  </span>
                  {policy.violations > 0 ? (
                    <span className="flex items-center gap-1 text-orange-400 text-sm">
                      <AlertTriangle className="w-4 h-4" />
                      {policy.violations} violation{policy.violations !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-400 text-sm">
                      <BadgeCheck className="w-4 h-4" />
                      Clean
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-500">{policy.rules} signing rules configured</div>
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div className="text-xs text-gray-500 text-right">
          Last evaluated: {new Date(summary.evaluated_at).toLocaleString()}
        </div>
      )}
    </div>
  )
}
