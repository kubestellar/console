import { ShieldCheck, Zap, AlertTriangle, CheckCircle2, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCardLoadingState } from './CardDataContext'
import { useAIPredictions } from '../../hooks/useAIPredictions'

/**
 * KubeStellar Console Quality Dashboard
 * 
 * Part of the "AI-Driven Bug Discovery & Remediation Architect" Mentorship.
 * Displays real-time metrics on state integrity, bug sweeps, and auto-remediations.
 */

// Resilience Metrics Constants (#12000)
const BUGS_FOUND_COUNT = 1418
const REMEDIATIONS_FIXED = 12
const DRIFT_EVENTS_COUNT = 4
const HEALTH_SCORE_VAL = 94
const PROGRESS_PCT = "15%"

export default function QualityDashboard() {
  const { t } = useTranslation('cards')
  const { isStale } = useAIPredictions() // Use predictions hook to get sync status

  useCardLoadingState({
    isLoading: false,
    isRefreshing: false,
    hasAnyData: true,
    isDemoData: true, // Marked as demo data since it uses POC constants
    isFailed: false,
    consecutiveFailures: 0,
  })

  return (
    <div className="h-full flex flex-col space-y-3 p-1">
      {/* Top Header Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-medium text-purple-400">{t('quality.bug_sweep')}</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{BUGS_FOUND_COUNT}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{t('quality.issues_detected')}</div>
        </div>

        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium text-blue-400">{t('quality.state_integrity')}</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {isStale ? t('quality.stale') : t('quality.synced')}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {isStale ? t('quality.drift_detected') : t('quality.digest_active')}
          </div>
        </div>
      </div>

      {/* Progress Section */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-muted-foreground">{t('quality.remediation_progress')}</span>
          <span className="text-foreground font-medium">{REMEDIATIONS_FIXED} {t('quality.fixed')}</span>
        </div>
        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-green-500" style={{ width: PROGRESS_PCT }} />
        </div>

        <div className="space-y-1.5 mt-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            <span className="flex-1">{t('quality.fix_guards_applied')}</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            <span className="flex-1 text-muted-foreground">
              {BUGS_FOUND_COUNT} {t('quality.paths_flagged')}
            </span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-xs opacity-60">
            <Terminal className="w-3.5 h-3.5" />
            <span className="flex-1">{t('quality.sweep_scheduled')}</span>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-center text-muted-foreground py-1 border-t border-border/50">
        {t('quality.version_poc')}
      </div>
    </div>
  )
}
