/**
 * Shared plumbing for Enterprise Compliance cards.
 *
 * Lightweight summary cards for the Console Studio that link to full dashboards.
 * Each card fetches summary data and renders a compact view.
 */
import { RefreshCcw } from 'lucide-react'
import { SCORE_GOOD, SCORE_WARN, SCORE_BAD, RING_BG, SCORE_THRESHOLDS, DEFAULT_RING_SIZE } from '../EnterpriseComplianceCards.constants'

export function ScoreRing({ score, size = DEFAULT_RING_SIZE }: { score: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= SCORE_THRESHOLDS.GOOD ? SCORE_GOOD : score >= SCORE_THRESHOLDS.WARN ? SCORE_WARN : SCORE_BAD
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={RING_BG} strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} data-testid="score-ring-progress" />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fill="currentColor" fontSize={size/4} fontWeight="bold">
        {score}%
      </text>
    </svg>
  )
}

export function CardShell({ title, icon: Icon, children, onClick }: {
  title: React.ReactNode; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; onClick?: () => void
}) {
  return (
    <div
      className={`h-full flex flex-col ${onClick ? 'cursor-pointer hover:bg-secondary transition-colors min-h-11 min-w-11' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{title}</span>
        <RefreshCcw className="w-3 h-3 animate-spin text-muted-foreground ml-auto" aria-hidden="true" />
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}

export function MiniStat({ label, value, color = 'text-foreground' }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}
