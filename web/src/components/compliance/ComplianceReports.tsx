/**
 * ComplianceReports — Generate and download compliance audit reports.
 *
 * Lets users pick a framework and cluster, choose PDF or JSON format,
 * and download a timestamped compliance report.
 */
import { useState, useEffect, useMemo, memo } from 'react'
import { UnifiedDashboard } from '../../lib/unified/dashboard/UnifiedDashboard'
import { complianceReportsDashboardConfig } from '../../config/dashboards/compliance-reports'
import { Download, Shield, Loader2 } from 'lucide-react'
import { useComplianceFrameworks, type Framework } from '../../hooks/useComplianceFrameworks'
import { useClusters } from '../../hooks/useMCP'
import { authFetch } from '../../lib/api'
import { Select } from '../ui/Select'
import { Skeleton } from '../ui/Skeleton'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'

type ReportFormat = 'pdf' | 'json'

export const ComplianceReportsContent = memo(function ComplianceReportsContent() {
  const { frameworks, isLoading: fwLoading, refetch } = useComplianceFrameworks()
  const { deduplicatedClusters: clusters } = useClusters()
  // (#11145) Exclude clusters confirmed unreachable from the picker — generating
  // a report against an unreachable context would silently fail or return incomplete
  // data. Clusters with reachable: undefined (not yet checked) are still included.
  const clusterNames = useMemo(() =>
    (clusters || [])
      .filter((c: { name: string; reachable?: boolean }) => c.reachable !== false)
      .map((c: { name: string }) => c.name),
    [clusters]
  )

  const [selectedFw, setSelectedFw] = useState<string>('')
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [format, setFormat] = useState<ReportFormat>('pdf')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  // Auto-select first framework and cluster when data loads
  useEffect(() => {
    if (!selectedFw && frameworks.length > 0) {
      setSelectedFw(frameworks[0].id)
    }
  }, [frameworks, selectedFw])

  useEffect(() => {
    if (clusterNames.length > 0 && (!selectedCluster || !clusterNames.includes(selectedCluster))) {
      setSelectedCluster(clusterNames[0])
    }
  }, [clusterNames, selectedCluster])

  const handleGenerate = async () => {
    if (!selectedFw || !selectedCluster) return

    setGenerating(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await authFetch(`/api/compliance/frameworks/${selectedFw}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster: selectedCluster, format }),
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: 'Download failed' }))
        throw new Error(errBody.error || `HTTP ${response.status}`)
      }

      // Trigger browser download from response blob
      const blob = await response.blob()
      const cd = response.headers.get('Content-Disposition') ?? ''
      const filenameMatch = cd.match(/filename="?([^"]+)"?/)
      const filename = filenameMatch?.[1] ?? `compliance-report.${format}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setSuccess(`Report downloaded: ${filename}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Report generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const selectedFramework = frameworks.find((f: Framework) => f.id === selectedFw)

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Compliance Reports"
        subtitle="Generate audit-ready compliance reports in PDF or JSON format"
        isFetching={fwLoading}
        onRefresh={refetch}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="reports-auto-refresh"
        rightExtra={<RotatingTip page="compliance" />}
      />

      {/* Generator Card */}
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6 space-y-5">
        <h2 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          Generate Report
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Framework Picker */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Framework</label>
            {fwLoading ? (
              <Skeleton variant="rounded" height={38} className="w-full" />
            ) : (
              <Select
                value={selectedFw}
                onChange={(e) => setSelectedFw(e.target.value)}
              >
                {(frameworks || []).map((fw: Framework) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.name} {fw.version}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {/* Cluster Picker */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Cluster</label>
            <Select
              value={selectedCluster}
              onChange={(e) => setSelectedCluster(e.target.value)}
            >
              {clusterNames.length === 0 && <option>No clusters</option>}
              {clusterNames.map((name: string) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
          </div>

          {/* Format Picker */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Format</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat('pdf')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  format === 'pdf'
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                    : 'border-zinc-600 bg-zinc-700/50 text-muted-foreground hover:text-zinc-200'
                }`}
              >
                📄 PDF
              </button>
              <button
                onClick={() => setFormat('json')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  format === 'json'
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                    : 'border-zinc-600 bg-zinc-700/50 text-muted-foreground hover:text-zinc-200'
                }`}
              >
                {'{ }'} JSON
              </button>
            </div>
          </div>
        </div>

        {/* Framework Info */}
        {selectedFramework && (
          <div className="rounded-lg bg-zinc-900/50 border border-zinc-700/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-200">{selectedFramework.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{(selectedFramework as Framework & { description?: string }).description || 'Regulatory compliance framework'}</p>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{(selectedFramework as Framework & { controls?: number }).controls ?? '—'} controls</span>
                <span>{(selectedFramework as Framework & { checks?: number }).checks ?? '—'} checks</span>
              </div>
            </div>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !selectedFw || !selectedCluster}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Generate & Download Report
            </>
          )}
        </button>

        {/* Status Messages */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-sm text-emerald-300">
            {success}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-6">
        <h2 className="text-lg font-medium text-zinc-200 mb-3">About Compliance Reports</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
          <div>
            <h3 className="font-medium text-zinc-300 mb-1">PDF Reports</h3>
            <p>Audit-ready documents with cover page, executive summary, per-control findings, evidence, and remediation steps. Suitable for sharing with auditors and compliance teams.</p>
          </div>
          <div>
            <h3 className="font-medium text-zinc-300 mb-1">JSON Reports</h3>
            <p>Machine-readable structured data following the KubeStellar compliance report schema (v1). Ideal for integration with GRC platforms, SIEM systems, and automated pipelines.</p>
          </div>
        </div>
      </div>
    </div>
  )
})

export default function ComplianceReports() {
  return (<>
    <ComplianceReportsContent />
    <UnifiedDashboard config={complianceReportsDashboardConfig} />
  </>)
}
