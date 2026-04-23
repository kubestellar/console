/**
 * SBOM Dashboard — Software Bill of Materials Manager
 *
 * Package inventory, vulnerability scanning, license compliance,
 * and dependency tree visualization.
 */
import { useState, useEffect } from 'react'
import {
  Package, CheckCircle2, Loader2, AlertTriangle,
  XCircle, Shield, FileText
} from 'lucide-react'
import { authFetch } from '../../lib/api'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { sbomDashboardConfig } from '../../config/dashboards/sbom'

// ── Types ───────────────────────────────────────────────────────────────

interface SBOMPackage {
  name: string
  version: string
  license: string
  ecosystem: string
  vulnerabilities: number
  risk: 'critical' | 'high' | 'medium' | 'low' | 'none'
}

interface SBOMVulnerability {
  id: string
  package_name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  cve: string
  fixed_version: string
  status: 'open' | 'patched' | 'ignored'
}

interface SBOMSummary {
  total_packages: number
  total_vulnerabilities: number
  critical_vulns: number
  high_vulns: number
  medium_vulns: number
  low_vulns: number
  license_compliant: number
  license_non_compliant: number
  license_unknown: number
  ecosystems: Array<{ name: string; count: number }>
  scan_status: 'completed' | 'in_progress' | 'failed'
  last_scan: string
}

// ── Helpers ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
  none: 'text-green-400',
}

const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-500/20 border-red-500/30',
  high: 'bg-orange-500/20 border-orange-500/30',
  medium: 'bg-yellow-500/20 border-yellow-500/30',
  low: 'bg-blue-500/20 border-blue-500/30',
  none: 'bg-green-500/20 border-green-500/30',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  open: <XCircle className="w-4 h-4 text-red-400" />,
  patched: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  ignored: <AlertTriangle className="w-4 h-4 text-gray-400" />,
}

// ── Content Component ───────────────────────────────────────────────────

export function SBOMDashboardContent() {
  const [packages, setPackages] = useState<SBOMPackage[]>([])
  const [vulnerabilities, setVulnerabilities] = useState<SBOMVulnerability[]>([])
  const [summary, setSummary] = useState<SBOMSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'packages' | 'vulnerabilities'>('packages')

  useEffect(() => {
    const load = async () => {
      try {
        const [pRes, vRes, sRes] = await Promise.all([
          authFetch('/api/v1/compliance/sbom/packages'),
          authFetch('/api/v1/compliance/sbom/vulnerabilities'),
          authFetch('/api/v1/compliance/sbom/summary'),
        ])
        if (!pRes.ok || !vRes.ok || !sRes.ok) throw new Error('Failed to fetch SBOM data')
        setPackages(await pRes.json())
        setVulnerabilities(await vRes.json())
        setSummary(await sRes.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      <span className="ml-3 text-gray-300">Loading SBOM data…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-red-400">{error}</p>
    </div>
  )

  const licensePieData = summary ? [
    { label: 'Compliant', count: summary.license_compliant, color: 'rgb(34,197,94)' },
    { label: 'Non-Compliant', count: summary.license_non_compliant, color: 'rgb(239,68,68)' },
    { label: 'Unknown', count: summary.license_unknown, color: 'rgb(107,114,128)' },
  ] : []
  const licenseTotal = licensePieData.reduce((a, b) => a + b.count, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Package className="w-8 h-8 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">SBOM Manager</h1>
          <p className="text-gray-400">Software bill of materials, vulnerability tracking, and license compliance</p>
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Packages</p>
            <p className="text-2xl font-bold text-white mt-1">{summary.total_packages}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Vulnerabilities</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{summary.total_vulnerabilities}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Critical</p>
            <p className="text-2xl font-bold text-red-500 mt-1">{summary.critical_vulns}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Scan Status</p>
            <div className="flex items-center gap-2 mt-1">
              {summary.scan_status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
              {summary.scan_status === 'in_progress' && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
              {summary.scan_status === 'failed' && <XCircle className="w-5 h-5 text-red-400" />}
              <span className="text-lg font-semibold text-white capitalize">{summary.scan_status.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      )}

      {/* License compliance pie chart */}
      {summary && licenseTotal > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            License Compliance
          </h3>
          <div className="flex items-center gap-6">
            <svg width={120} height={120} viewBox="0 0 120 120" className="shrink-0">
              {(() => {
                let cumulative = 0
                return licensePieData.map((d, i) => {
                  const pct = d.count / licenseTotal
                  const start = cumulative
                  cumulative += pct
                  const r = 50
                  const circ = 2 * Math.PI * r
                  return (
                    <circle
                      key={i}
                      cx={60} cy={60} r={r}
                      fill="none"
                      stroke={d.color}
                      strokeWidth={16}
                      strokeDasharray={`${pct * circ} ${circ}`}
                      strokeDashoffset={-start * circ}
                      transform="rotate(-90 60 60)"
                    />
                  )
                })
              })()}
            </svg>
            <div className="space-y-2">
              {licensePieData.map(d => (
                <div key={d.label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-sm text-gray-300">{d.label}: <span className="text-white font-medium">{d.count}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'packages' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
          onClick={() => setActiveTab('packages')}
        >
          <Package className="w-4 h-4 inline mr-1" /> Packages ({packages.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'vulnerabilities' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
          onClick={() => setActiveTab('vulnerabilities')}
        >
          <Shield className="w-4 h-4 inline mr-1" /> Vulnerabilities ({vulnerabilities.length})
        </button>
      </div>

      {/* Packages table */}
      {activeTab === 'packages' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="py-2 px-3 text-gray-400 font-medium">Package</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Version</th>
                <th className="py-2 px-3 text-gray-400 font-medium">License</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Ecosystem</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Vulns</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p, i) => (
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/30">
                  <td className="py-2 px-3 text-white font-mono text-xs">{p.name}</td>
                  <td className="py-2 px-3 text-gray-300">{p.version}</td>
                  <td className="py-2 px-3 text-gray-300">{p.license}</td>
                  <td className="py-2 px-3 text-gray-300">{p.ecosystem}</td>
                  <td className="py-2 px-3">
                    <span className={p.vulnerabilities > 0 ? 'text-red-400 font-medium' : 'text-green-400'}>{p.vulnerabilities}</span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${SEVERITY_BG[p.risk]} ${SEVERITY_COLORS[p.risk]}`}>
                      {p.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vulnerabilities table */}
      {activeTab === 'vulnerabilities' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="py-2 px-3 text-gray-400 font-medium">CVE</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Package</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Severity</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Fixed In</th>
                <th className="py-2 px-3 text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {vulnerabilities.map((v) => (
                <tr key={v.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                  <td className="py-2 px-3 text-blue-400 font-mono text-xs">{v.cve}</td>
                  <td className="py-2 px-3 text-white">{v.package_name}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${SEVERITY_BG[v.severity]} ${SEVERITY_COLORS[v.severity]}`}>
                      {v.severity}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-300 font-mono text-xs">{v.fixed_version}</td>
                  <td className="py-2 px-3">
                    <span className="flex items-center gap-1">
                      {STATUS_ICON[v.status]}
                      <span className="text-gray-300 capitalize">{v.status}</span>
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
}

// ── Page Component (rendered by App.tsx route) ──────────────────────────

export default function SBOMDashboard() {
  return (<>
    <SBOMDashboardContent />
    <UnifiedDashboard config={sbomDashboardConfig} />
  </>)
}
