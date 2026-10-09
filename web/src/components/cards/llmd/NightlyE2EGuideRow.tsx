import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Loader2,
  Minus,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import type { NightlyGuideStatus, NightlyRun } from '../../../lib/llmd/nightlyE2EDemoData'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import { moveFocusByKey } from '../../../lib/a11y/rovingFocus'
import { Skeleton } from '../../ui/Skeleton'
import { RunDot } from './NightlyE2ERunDot'
export { RunDot } from './NightlyE2ERunDot'

const GUIDE_RUN_DOT_COUNT = 7

export function TrendIndicator({ trend, passRate }: { trend: 'up' | 'down' | 'steady'; passRate: number }) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const color = passRate === 100
    ? 'text-green-400'
    : passRate >= 70
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Icon size={12} />
      <span className="text-xs font-mono">{passRate}%</span>
    </div>
  )
}

export function GuideRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <Skeleton variant="circular" width={14} height={14} />
      <Skeleton variant="text" width={200} height={16} />
      <div className="flex items-center gap-1.5 shrink-0">
        {Array.from({ length: GUIDE_RUN_DOT_COUNT }).map((_, index) => (
          <Skeleton key={index} variant="circular" width={12} height={12} />
        ))}
      </div>
      <Skeleton variant="text" width={48} height={14} className="ml-auto" />
    </div>
  )
}

export function GuideRow({ guide, delay, isSelected, onMouseEnter, onRunHover }: {
  guide: NightlyGuideStatus
  delay: number
  isSelected: boolean
  onMouseEnter: () => void
  onRunHover: (run: NightlyRun | null) => void
}) {
  const { isDemoMode } = useDemoMode()
  const workflowUrl = `https://github.com/${guide.repo}/actions/workflows/${guide.workflowFile}`
  const StatusIcon = guide.latestConclusion === 'success'
    ? CheckCircle
    : guide.latestConclusion === 'failure'
      ? XCircle
      : guide.latestConclusion === 'in_progress'
        ? Loader2
        : AlertTriangle

  const iconColor = guide.latestConclusion === 'success'
    ? 'text-green-400'
    : guide.latestConclusion === 'failure'
      ? 'text-red-400'
      : guide.latestConclusion === 'in_progress'
        ? 'text-blue-400 animate-spin'
        : 'text-muted-foreground'

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors group cursor-pointer ${
        isSelected ? 'bg-secondary/50 ring-1 ring-border/50' : 'hover:bg-secondary/40'
      }`}
      onMouseEnter={onMouseEnter}
    >
      <StatusIcon size={14} className={`shrink-0 ${iconColor}`} />
      <span className="text-xs text-foreground w-48 truncate shrink-0" title={guide.guide}>
        <span className="font-mono font-semibold text-muted-foreground mr-1.5">{guide.acronym}</span>
        {guide.guide}
      </span>
      <div
        className="flex items-center gap-1.5 shrink-0"
        role="group"
        aria-label={`Recent runs for ${guide.guide}`}
        onKeyDown={(event) => {
          moveFocusByKey(event, { selector: 'a[data-run-dot="true"]', orientation: 'horizontal' })
        }}
      >
        {guide.runs.map((run) => (
          <RunDot key={run.id} run={run} guide={guide} isDemoMode={isDemoMode}
            onMouseEnter={() => { onMouseEnter(); onRunHover(run) }}
            onMouseLeave={() => onRunHover(null)}
          />
        ))}
        {/* Pad with empty dots if fewer than 7 runs */}
        {Array.from({ length: Math.max(0, GUIDE_RUN_DOT_COUNT - guide.runs.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="w-3 h-3 rounded-full bg-border/50" />
        ))}
      </div>
      <TrendIndicator trend={guide.trend} passRate={guide.passRate} />
      <a
        href={sanitizeUrl(workflowUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity p-0.5 rounded hover:bg-secondary"
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink size={12} className="text-muted-foreground" />
      </a>
    </motion.div>
  )
}
