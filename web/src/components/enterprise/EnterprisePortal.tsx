/**
 * Enterprise Portal — Landing page at /enterprise
 *
 * Shows a dashboard overview of all compliance verticals with
 * status cards linking to each epic's dashboards.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Landmark, Heart, Shield, KeyRound, Radar, Container, Scale, TrendingUp,
  CheckCircle2, AlertTriangle, Clock, ArrowRight, Plus,
} from 'lucide-react'
import { ENTERPRISE_NAV_SECTIONS } from './enterpriseNav'
import { DashboardHeader } from '../shared/DashboardHeader'
import { RotatingTip } from '../ui/RotatingTip'
import { useDashboardContextOptional } from '../../hooks/useDashboardContext'

const VERTICAL_META: Record<string, {
  icon: React.ComponentType<{ className?: string }>
  gradient: string
  status: 'active' | 'coming-soon'
  score?: number
  controls?: { total: number; passed: number }
}> = {
  fintech: {
    icon: Landmark,
    gradient: 'from-blue-600/20 to-blue-900/20',
    status: 'active',
    score: 91,
    controls: { total: 47, passed: 43 },
  },
  healthcare: {
    icon: Heart,
    gradient: 'from-rose-600/20 to-rose-900/20',
    status: 'active',
    score: 87,
    controls: { total: 32, passed: 28 },
  },
  government: {
    icon: Shield,
    gradient: 'from-amber-600/20 to-amber-900/20',
    status: 'active',
    score: 81,
    controls: { total: 58, passed: 47 },
  },
  identity: {
    icon: KeyRound,
    gradient: 'from-cyan-600/20 to-cyan-900/20',
    status: 'active',
    score: 78,
    controls: { total: 24, passed: 19 },
  },
  secops: {
    icon: Radar,
    gradient: 'from-purple-600/20 to-purple-900/20',
    status: 'active',
    score: 74,
    controls: { total: 31, passed: 23 },
  },
  'supply-chain': {
    icon: Container,
    gradient: 'from-emerald-600/20 to-emerald-900/20',
    status: 'active',
    score: 68,
    controls: { total: 28, passed: 19 },
  },
  erm: {
    icon: Scale,
    gradient: 'from-orange-600/20 to-orange-900/20',
    status: 'active',
    score: 72,
    controls: { total: 36, passed: 26 },
  },
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className={`text-3xl font-bold ${color}`}>
      {score}<span className="text-lg">%</span>
    </div>
  )
}

function VerticalCard({ sectionId, title, items, onNavigate }: {
  sectionId: string
  title: string
  items: { label: string; href: string }[]
  onNavigate: (href: string) => void
}) {
  const meta = VERTICAL_META[sectionId]
  if (!meta) return null
  const Icon = meta.icon

  return (
    <div className={`rounded-xl border border-gray-800 bg-linear-to-br ${meta.gradient} p-5 flex flex-col`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-800/50">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="text-xs text-gray-400">{items.length} dashboard{items.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {meta.status === 'active' && meta.score != null && <ScoreGauge score={meta.score} />}
        {meta.status === 'coming-soon' && (
          <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-400 font-medium">
            Coming Soon
          </span>
        )}
      </div>

      {meta.status === 'active' && meta.controls && (
        <div className="flex items-center gap-4 mb-4 text-xs">
          <div className="flex items-center gap-1 text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{meta.controls.passed} passed</span>
          </div>
          <div className="flex items-center gap-1 text-yellow-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{meta.controls.total - meta.controls.passed} gaps</span>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-1">
        {items.filter((i) => !i.href.includes('enterprise/enterprise')).map((item) => (
          <button
            key={item.href}
            onClick={() => onNavigate(item.href)}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-gray-700/40 hover:text-white transition-colors group"
          >
            <span>{item.label}</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Interval between auto-refresh ticks in milliseconds */
const AUTO_REFRESH_INTERVAL_MS = 30_000

export default function EnterprisePortal() {
  const navigate = useNavigate()
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(() => new Date())
  const dashboardContext = useDashboardContextOptional()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleRefresh = useCallback(() => {
    setLastUpdated(new Date())
  }, [])

  // Wire autoRefresh toggle to a periodic refresh interval
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(handleRefresh, AUTO_REFRESH_INTERVAL_MS)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefresh, handleRefresh])

  const handleAddMore = useCallback(() => {
    if (dashboardContext?.openAddCardModal) {
      dashboardContext.openAddCardModal('dashboards')
    }
  }, [dashboardContext])

  const sections = ENTERPRISE_NAV_SECTIONS.filter((s) => s.id !== 'overview')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header with tip bar, auto-refresh, and refresh button */}
      <DashboardHeader
        title="Enterprise Compliance Portal"
        subtitle="Unified governance, risk, and compliance across all Kubernetes clusters"
        isFetching={false}
        onRefresh={handleRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="enterprise-auto-refresh"
        lastUpdated={lastUpdated}
        rightExtra={<RotatingTip page="enterprise" />}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400 mb-1">Overall Score</div>
          <div className="text-2xl font-bold text-green-400">83%</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400 mb-1">Active Verticals</div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span className="text-2xl font-bold text-white">7</span>
            <span className="text-xs text-gray-500">of 7</span>
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400 mb-1">Controls Passed</div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-2xl font-bold text-white">179</span>
            <span className="text-xs text-gray-500">of 220</span>
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400 mb-1">Next Audit</div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <span className="text-lg font-bold text-white">14 days</span>
          </div>
        </div>
      </div>

      {/* Vertical Cards */}
      <div className="grid grid-cols-3 gap-5">
        {sections.map((section) => (
          <VerticalCard
            key={section.id}
            sectionId={section.id}
            title={section.title}
            items={section.items.map((i) => ({ label: i.label, href: i.href }))}
            onNavigate={(href) => navigate(href)}
          />
        ))}

        {/* Add More tile */}
        <button
          onClick={handleAddMore}
          className="rounded-xl border-2 border-dashed border-gray-700 hover:border-purple-500/50 bg-gray-900/30 hover:bg-purple-500/5 p-5 flex flex-col items-center justify-center gap-3 transition-all group min-h-[200px]"
        >
          <div className="p-3 rounded-full bg-gray-800 group-hover:bg-purple-500/20 transition-colors">
            <Plus className="w-6 h-6 text-gray-400 group-hover:text-purple-400 transition-colors" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-400 group-hover:text-purple-300 transition-colors">
              Add More
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Dashboards, cards &amp; widgets
            </p>
          </div>
        </button>
      </div>
    </div>
  )
}
