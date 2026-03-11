/**
 * Modal showing per-tool compliance score breakdown.
 *
 * Opens when clicking the ComplianceScore card gauge.
 * Shows tabs for each tool (Kubescape, Kyverno) with pass/fail counts.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
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

export function ComplianceScoreBreakdownModal({
  isOpen, onClose, score, breakdown, kubescapeData, kyvernoData,
}: ComplianceScoreBreakdownModalProps) {
  const toolNames = breakdown.map(b => b.name)
  const [activeTab, setActiveTab] = useState(toolNames[0] || 'Overview')
  const openTimeRef = useRef<number>(0)

  useEffect(() => {
    if (isOpen) {
      openTimeRef.current = Date.now()
      emitModalOpened(MODAL_TYPE, 'compliance_score')
      setActiveTab(toolNames[0] || 'Overview')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleClose = useCallback(() => {
    if (openTimeRef.current > 0) {
      emitModalClosed(MODAL_TYPE, Date.now() - openTimeRef.current)
      openTimeRef.current = 0
    }
    onClose()
  }, [onClose])

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab)
    emitModalTabViewed(MODAL_TYPE, tab)
  }, [])

  const scoreCtx = getScoreContext(score)

  const tabs = toolNames.map(name => ({
    id: name,
    label: name,
    badge: String(breakdown.find(b => b.name === name)?.value ?? '—') + '%',
  }))

  // Add overview tab if multiple tools
  if (tabs.length > 1) {
    tabs.unshift({ id: 'Overview', label: 'Overview', badge: `${score}%` })
  }

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
        {activeTab === 'Overview' && (
          <OverviewTab score={score} breakdown={breakdown} scoreCtx={scoreCtx} />
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
        {activeTab !== 'Overview' && activeTab !== 'Kubescape' && activeTab !== 'Kyverno' && (
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

function OverviewTab({ score, breakdown, scoreCtx }: { score: number; breakdown: ToolBreakdown[]; scoreCtx: { label: string; color: string; description: string } }) {
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
              className={score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'}
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

      {/* Per-tool bars */}
      <div className="space-y-3">
        {(breakdown || []).map(item => (
          <div key={item.name} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{item.name}</span>
              <span className={`text-sm font-bold ${item.value >= 80 ? 'text-green-400' : item.value >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                {item.value}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${item.value >= 80 ? 'bg-green-400/60' : item.value >= 60 ? 'bg-yellow-400/60' : 'bg-red-400/60'}`}
                style={{ width: `${item.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function KubescapeTab({ data }: { data: NonNullable<ComplianceScoreBreakdownModalProps['kubescapeData']> }) {
  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
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
