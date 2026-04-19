/**
 * Modal showing per-tool compliance score breakdown.
 *
 * Opens when clicking the ComplianceScore card gauge.
 * Shows tabs for each tool (Kubescape, Kyverno) with pass/fail counts.
 */

import { useState, useRef, useEffect } from 'react'
import { Shield } from 'lucide-react'
import { BaseModal } from '../../../lib/modals/BaseModal'
import { StatusBadge } from '../../ui/StatusBadge'
import { getScoreContext } from '../../../lib/constants/compliance'
import { emitModalOpened, emitModalTabViewed, emitModalClosed } from '../../../lib/analytics'

interface ToolBreakdown {
  name: string
  value: number
}

interface ComplianceScoreBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  score: number
  breakdown: ToolBreakdown[]
  kubescapeData?: {
    totalControls: number
    passedControls: number
    failedControls: number
    frameworks: Array<{ name: string; score: number; passCount?: number; failCount?: number }>
  }
  kyvernoData?: {
    totalPolicies: number
    totalViolations: number
    enforcingCount: number
    auditCount: number
  }
}

const MODAL_TYPE = 'compliance_score'

/** Maximum top failing items to show per tool */
const MAX_TOP_FAILING = 5

/** Tab id for the always-present Overview tab. */
const OVERVIEW_TAB_ID = 'Overview'

/** Score thresholds for color grading. Keep in sync with getScoreContext(). */
const SCORE_GOOD_THRESHOLD = 80
const SCORE_WARN_THRESHOLD = 60

export function ComplianceScoreBreakdownModal({
  isOpen, onClose, score, breakdown, kubescapeData, kyvernoData }: ComplianceScoreBreakdownModalProps) {
  const toolNames = breakdown.map(b => b.name)
  // Default to Overview — clicking the percentage shows score context first,
  // then users drill into per-tool tabs. Fixes #7892.
  const [activeTab, setActiveTab] = useState(OVERVIEW_TAB_ID)
  const openTimeRef = useRef<number>(0)

  useEffect(() => {
    if (isOpen) {
      openTimeRef.current = Date.now()
      emitModalOpened(MODAL_TYPE, 'compliance_score')
      setActiveTab(OVERVIEW_TAB_ID)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleClose = () => {
    if (openTimeRef.current > 0) {
      emitModalClosed(MODAL_TYPE, Date.now() - openTimeRef.current)
      openTimeRef.current = 0
    }
    onClose()
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    emitModalTabViewed(MODAL_TYPE, tab)
  }

  const scoreCtx = getScoreContext(score)

  const tabs = toolNames.map(name => ({
    id: name,
    label: name,
    badge: String(breakdown.find(b => b.name === name)?.value ?? '—') + '%' }))

  // Always include Overview — it's the landing tab and summarizes the aggregate
  // across all tools so the modal has context even with a single tool. Fixes #7893.
  tabs.unshift({ id: OVERVIEW_TAB_ID, label: OVERVIEW_TAB_ID, badge: `${score}%` })

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="lg">
      <BaseModal.Header
        title="Compliance Score Breakdown"
        icon={Shield}
        onClose={handleClose}
        extra={
          <StatusBadge
            color={score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'}
            size="md"
          >
            {score}% — {scoreCtx.label}
          </StatusBadge>
        }
      />
      {tabs.length > 1 && (
        <BaseModal.Tabs tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />
      )}
      <BaseModal.Content>
        {activeTab === OVERVIEW_TAB_ID && (
          <OverviewTab
            score={score}
            breakdown={breakdown}
            scoreCtx={scoreCtx}
            kubescapeData={kubescapeData}
            kyvernoData={kyvernoData}
          />
        )}
        {activeTab === 'Kubescape' && (
          kubescapeData
            ? <KubescapeTab data={kubescapeData} />
            : <ToolDataUnavailable tool="Kubescape" />
        )}
        {activeTab === 'Kyverno' && (
          kyvernoData
            ? <KyvernoTab data={kyvernoData} />
            : <ToolDataUnavailable tool="Kyverno" />
        )}
        {/* Fallback for tools without detailed data */}
        {activeTab !== OVERVIEW_TAB_ID && activeTab !== 'Kubescape' && activeTab !== 'Kyverno' && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Score: {breakdown.find(b => b.name === activeTab)?.value}%</p>
            <p className="text-xs mt-1">Detailed breakdown not available for {activeTab}</p>
          </div>
        )}
      </BaseModal.Content>
      <BaseModal.Footer showKeyboardHints />
    </BaseModal>
  )
}

function OverviewTab({ score, breakdown, scoreCtx, kubescapeData, kyvernoData }: {
  score: number
  breakdown: ToolBreakdown[]
  scoreCtx: { label: string; color: string; description: string }
  kubescapeData?: ComplianceScoreBreakdownModalProps['kubescapeData']
  kyvernoData?: ComplianceScoreBreakdownModalProps['kyvernoData']
}) {
  // Kubescape uses a true "checks" model where passed + failed == total per control.
  // Kyverno, on the other hand, reports policies and violations — a single policy can
  // have N violations (one per offending resource), so violations often EXCEEDS the
  // policy count and passed != (policies - violations). Prior to #8974, the Overview
  // tab summed Kubescape's controls with Kyverno's policies/violations into a single
  // "Total Checks / Passing / Failing" row. That produced impossible totals like
  // "126 checks, 121 passing, 167 failing" because Kyverno's violations are
  // incommensurable with Kubescape's pass/fail counts.
  //
  // Fix: show each tool's counts in its own row with its own labels, so the numbers
  // in each row add up correctly (Kubescape: passed + failed == total) and Kyverno
  // uses its native vocabulary (policies / violations) without implying a pass/fail
  // relationship. Also display an aggregated "Total Checks" row ONLY across tools
  // that share the same pass+fail==total model (currently just Kubescape), so the
  // top-line number always reconciles with the per-bucket sums.
  const kubescapeTotal = kubescapeData?.totalControls ?? 0
  const kubescapePassed = kubescapeData?.passedControls ?? 0
  const kubescapeFailed = kubescapeData?.failedControls ?? 0

  const kyvernoTotalPolicies = kyvernoData?.totalPolicies ?? 0
  const kyvernoTotalViolations = kyvernoData?.totalViolations ?? 0

  const hasKubescapeChecks = kubescapeTotal > 0
  const hasKyvernoPolicies = kyvernoTotalPolicies > 0
  const hasAnyToolData = hasKubescapeChecks || hasKyvernoPolicies

  const scoreColorClass = score >= SCORE_GOOD_THRESHOLD
    ? 'text-green-400'
    : score >= SCORE_WARN_THRESHOLD
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <div className="space-y-4">
      {/* Score gauge */}
      <div className="flex items-center justify-center py-4">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
            <circle
              cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3"
              strokeDasharray={`${score}, 100`}
              className={scoreColorClass}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{score}%</span>
          </div>
        </div>
      </div>
      <div className="text-center">
        <span className={`text-sm font-semibold ${scoreCtx.color}`}>{scoreCtx.label}</span>
        <p className="text-xs text-muted-foreground mt-0.5">{scoreCtx.description}</p>
      </div>

      {/*
       * Per-tool stats. Each row's numbers use the tool's native semantics and
       * reconcile internally (Kubescape: passed + failed == total). Mixing them
       * into a single aggregate row hides the fact that Kyverno violations are
       * event counts, not "failed checks", and led to impossible totals (issue 8974).
       */}
      {hasKubescapeChecks && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Kubescape checks</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatBox label="Total Checks" value={kubescapeTotal} />
            <StatBox label="Passing" value={kubescapePassed} color="text-green-400" />
            <StatBox label="Failing" value={kubescapeFailed} color="text-red-400" />
          </div>
        </div>
      )}
      {hasKyvernoPolicies && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Kyverno policies</h4>
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="Policies" value={kyvernoTotalPolicies} />
            <StatBox label="Violations" value={kyvernoTotalViolations} color="text-red-400" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Violations count individual offending resources — a single policy may contribute
            multiple violations, so the violation count is not comparable to the policy count.
          </p>
        </div>
      )}

      {/* Per-tool bars */}
      {breakdown && breakdown.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground">By tool</h4>
          {breakdown.map(item => (
            <div key={item.name} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-y-2">
                <span className="text-sm font-medium text-foreground">{item.name}</span>
                <span className={`text-sm font-bold ${item.value >= SCORE_GOOD_THRESHOLD ? 'text-green-400' : item.value >= SCORE_WARN_THRESHOLD ? 'text-yellow-400' : 'text-red-400'}`}>
                  {item.value}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${item.value >= SCORE_GOOD_THRESHOLD ? 'bg-green-400/60' : item.value >= SCORE_WARN_THRESHOLD ? 'bg-yellow-400/60' : 'bg-red-400/60'}`}
                  style={{ width: `${item.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — no tool data at all */}
      {!hasAnyToolData && (!breakdown || breakdown.length === 0) && (
        <div className="text-center py-4 text-muted-foreground">
          <p className="text-sm">No compliance tools are reporting data.</p>
          <p className="text-xs mt-1">Install Kubescape or Kyverno in a connected cluster to see detailed breakdowns.</p>
        </div>
      )}
    </div>
  )
}

function KubescapeTab({ data }: { data: NonNullable<ComplianceScoreBreakdownModalProps['kubescapeData']> }) {
  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatBox label="Total Controls" value={data.totalControls} />
        <StatBox label="Passed" value={data.passedControls} color="text-green-400" />
        <StatBox label="Failed" value={data.failedControls} color="text-red-400" />
      </div>

      {/* Framework scores */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Framework Scores</h4>
        <div className="space-y-2">
          {(data.frameworks || []).slice(0, MAX_TOP_FAILING).map((fw, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-foreground w-32 truncate">{fw.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full ${fw.score >= 80 ? 'bg-green-400/60' : fw.score >= 60 ? 'bg-yellow-400/60' : 'bg-red-400/60'}`}
                  style={{ width: `${fw.score}%` }}
                />
              </div>
              <span className={`text-xs font-medium w-12 text-right ${fw.score >= 80 ? 'text-green-400' : fw.score >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {fw.score}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KyvernoTab({ data }: { data: NonNullable<ComplianceScoreBreakdownModalProps['kyvernoData']> }) {
  const complianceRate = data.totalPolicies > 0
    ? Math.max(0, Math.round(100 - (data.totalViolations / data.totalPolicies) * 100))
    : null

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatBox label="Total Policies" value={data.totalPolicies} />
        <StatBox label="Total Violations" value={data.totalViolations} color="text-red-400" />
        <StatBox label="Enforcing" value={data.enforcingCount} color="text-blue-400" />
        <StatBox label="Audit Mode" value={data.auditCount} color="text-yellow-400" />
      </div>

      {/* Compliance rate */}
      <div className="text-center py-2">
        {complianceRate !== null ? (
          <>
            <span className={`text-lg font-bold ${complianceRate >= 80 ? 'text-green-400' : complianceRate >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
              {complianceRate}% Compliance Rate
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {data.totalViolations} violations across {data.totalPolicies} policies
            </p>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">No policies configured</span>
        )}
      </div>
    </div>
  )
}

function ToolDataUnavailable({ tool }: { tool: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <p className="text-sm">{tool} data not available</p>
      <p className="text-xs mt-1">No data from connected clusters</p>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/30 text-center">
      <p className={`text-xl font-bold ${color || 'text-foreground'}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
