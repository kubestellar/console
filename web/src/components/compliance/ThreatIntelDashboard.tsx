import React, { memo } from 'react'
import { useState, useEffect } from 'react'
import {
  Shield, CheckCircle2, Loader2,
  Clock, XCircle, Eye
} from 'lucide-react'
import { authFetch } from '../../lib/api'

// ── Types ───────────────────────────────────────────────────────────────

interface ThreatFeed {
  id: string
  name: string
  provider: string
  status: 'active' | 'stale' | 'error'
  last_updated: string
  indicators_count: number
  category: string
}

interface IOCMatch {
  id: string
  ioc_type: 'ip' | 'domain' | 'hash' | 'url' | 'email'
  indicator: string
  feed_name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  matched_resource: string
  cluster: string
  detected_at: string
  status: 'active' | 'mitigated' | 'false_positive'
}

interface ThreatIntelSummary {
  total_feeds: number
  active_feeds: number
  total_indicators: number
  total_matches: number
  active_matches: number
  risk_score: number
  critical_matches: number
  high_matches: number
  medium_matches: number
  low_matches: number
  top_ioc_types: Array<{ type: string; count: number }>
  vulnerability_correlation: number
}

// ── Helpers ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
}

const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-500/20 border-red-500/30',
  high: 'bg-orange-500/20 border-orange-500/30',
  medium: 'bg-yellow-500/20 border-yellow-500/30',
  low: 'bg-blue-500/20 border-blue-500/30',
}

const FEED_STATUS_COLORS: Record<string, string> = {
  active: 'text-green-400',
  stale: 'text-yellow-400',
  error: 'text-red-400',
}

const IOC_STATUS_ICON: Record<string, React.ReactNode> = {
  active: <XCircle className="w-4 h-4 text-red-400" />,
  mitigated: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  false_positive: <Eye className="w-4 h-4 text-gray-400" />,
}

const SCORE_GOOD = 'rgb(34,197,94)'
const SCORE_WARN = 'rgb(234,179,8)'
const SCORE_BAD = 'rgb(239,68,68)'
const RING_BG = 'rgb(55,65,81)'

function RiskScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score <= 30 ? SCORE_GOOD : score <= 60 ? SCORE_WARN : SCORE_BAD
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={RING_BG} strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill="white" fontSize={size / 4} fontWeight="bold">
        {score}
      </text>
    </svg>
  )
}

const ThreatIntelDashboard = memo(function ThreatIntelDashboard() {
  const [feeds, setFeeds] = useState<ThreatFeed[]>([])
  const [iocs, setIOCs] = useState<IOCMatch[]>([])
  const [summary, setSummary] = useState<ThreatIntelSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'feeds' | 'iocs'>('overview')

  useEffect(() => {
    const load = async () => {
      try {
        const [fRes, iRes, sRes] = await Promise.all([
          authFetch('/api/v1/compliance/threat-intel/feeds'),
          authFetch('/api/v1/compliance/threat-intel/iocs'),
          authFetch('/api/v1/compliance/threat-intel/summary'),
        ])
        if (!fRes.ok || !iRes.ok || !sRes.ok) throw new Error('Failed to fetch threat intel data')
        setFeeds(await fRes.json())
        setIOCs(await iRes.json())
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
      <span className="ml-3 text-gray-300">Loading threat intelligence…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg">
      <p className="text-red-400">{error}</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-purple-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Threat Intelligence</h1>
          <p className="text-gray-400">Threat feed monitoring, IOC matching, and vulnerability correlation</p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400">Active Feeds</p>
            <p className="text-2xl font-bold text-white">{summary.active_feeds}/{summary.total_feeds}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-red-500/30">
            <p className="text-sm text-gray-400">Active Matches</p>
            <p className="text-2xl font-bold text-red-400">{summary.active_matches}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-blue-500/30">
            <p className="text-sm text-gray-400">Total Indicators</p>
            <p className="text-2xl font-bold text-blue-400">{summary.total_indicators.toLocaleString()}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-purple-500/30">
            <p className="text-sm text-gray-400">Vuln Correlation</p>
            <p className="text-2xl font-bold text-purple-400">{summary.vulnerability_correlation}%</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {(['overview', 'feeds', 'iocs'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'overview' ? 'Risk Overview' : tab === 'feeds' ? 'Threat Feeds' : 'IOC Matches'}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Risk score */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Risk Score</h3>
              <div className="flex items-center gap-6">
                <RiskScoreRing score={summary.risk_score} />
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">
                    {summary.risk_score <= 30 ? 'Low risk — environment is well-protected' :
                     summary.risk_score <= 60 ? 'Moderate risk — some threats detected' :
                     'High risk — immediate attention required'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Based on {summary.total_matches} IOC matches across {summary.total_feeds} feeds
                  </p>
                </div>
              </div>
            </div>

            {/* IOC type breakdown */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">IOC Types</h3>
              <div className="space-y-3">
                {summary.top_ioc_types.map(iocType => {
                  const total = summary.total_matches || 1
                  const pct = Math.round((iocType.count / total) * 100)
                  return (
                    <div key={iocType.type} className="flex items-center gap-3">
                      <span className="w-16 text-sm text-gray-300 uppercase">{iocType.type}</span>
                      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm text-white w-8 text-right">{iocType.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Severity distribution */}
          <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Match Severity Distribution</h3>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Critical', count: summary.critical_matches, color: 'border-red-500/30' },
                { label: 'High', count: summary.high_matches, color: 'border-orange-500/30' },
                { label: 'Medium', count: summary.medium_matches, color: 'border-yellow-500/30' },
                { label: 'Low', count: summary.low_matches, color: 'border-blue-500/30' },
              ].map(s => (
                <div key={s.label} className={`bg-gray-800/50 rounded-lg p-4 border ${s.color} text-center`}>
                  <p className="text-sm text-gray-400">{s.label}</p>
                  <p className="text-2xl font-bold text-white">{s.count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Feeds tab */}
      {activeTab === 'feeds' && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left p-3">Feed</th>
                <th className="text-left p-3">Provider</th>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Indicators</th>
                <th className="text-left p-3">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {feeds.map(feed => (
                <tr key={feed.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="p-3 text-white font-medium">{feed.name}</td>
                  <td className="p-3 text-gray-300">{feed.provider}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">{feed.category}</span></td>
                  <td className="p-3">
                    <span className={`flex items-center gap-1.5 ${FEED_STATUS_COLORS[feed.status]}`}>
                      {feed.status === 'active' ? <CheckCircle2 className="w-4 h-4" /> :
                       feed.status === 'stale' ? <Clock className="w-4 h-4" /> :
                       <XCircle className="w-4 h-4" />}
                      <span className="capitalize">{feed.status}</span>
                    </span>
                  </td>
                  <td className="p-3 text-white">{feed.indicators_count.toLocaleString()}</td>
                  <td className="p-3 text-gray-300 text-xs">{new Date(feed.last_updated).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* IOCs tab */}
      {activeTab === 'iocs' && (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Indicator</th>
                <th className="text-left p-3">Feed</th>
                <th className="text-left p-3">Severity</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Resource</th>
                <th className="text-left p-3">Cluster</th>
                <th className="text-left p-3">Detected</th>
              </tr>
            </thead>
            <tbody>
              {iocs.map(ioc => (
                <tr key={ioc.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs uppercase">{ioc.ioc_type}</span></td>
                  <td className="p-3 font-mono text-blue-300 text-xs">{ioc.indicator}</td>
                  <td className="p-3 text-gray-300">{ioc.feed_name}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${SEVERITY_BG[ioc.severity]} ${SEVERITY_COLORS[ioc.severity]}`}>
                      {ioc.severity}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="flex items-center gap-1.5">
                      {IOC_STATUS_ICON[ioc.status]}
                      <span className="text-gray-300 capitalize">{ioc.status.replace('_', ' ')}</span>
                    </span>
                  </td>
                  <td className="p-3 text-white">{ioc.matched_resource}</td>
                  <td className="p-3 text-gray-300">{ioc.cluster}</td>
                  <td className="p-3 text-gray-300 text-xs">{new Date(ioc.detected_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
})

export default ThreatIntelDashboard
