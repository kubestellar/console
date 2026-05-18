import { useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, Info, Loader2, ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useKubescape } from '../../../hooks/useKubescape'
import { useKyverno } from '../../../hooks/useKyverno'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useMissions } from '../../../hooks/useMissions'
import { useCardLoadingState } from '../CardDataContext'
import { StatusBadge } from '../../ui/StatusBadge'
import { ComplianceScoreBreakdownModal } from './ComplianceScoreBreakdownModal'
import { buildComplianceScoreSummary } from '../../../lib/complianceScore'
import { CARD_DESCRIPTIONS, getScoreContext } from '../../../lib/constants/compliance'
import { CARD_UI_STRINGS } from '../strings'
import type { CardConfig } from './cardTypes'
import { COMPLIANCE_INSTALL_PROMPT } from './complianceConstants'

export function ComplianceScoreCard({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses: kubescapeStatuses, aggregated: kubescapeAgg, isLoading: ksLoading, isRefreshing: ksRefreshing, isDemoData: ksDemoData, installed: ksInstalled, hasErrors: ksHasErrors, clustersChecked: ksChecked, totalClusters: ksTotal, unavailableReason: ksUnavailable } = useKubescape()
  const { statuses: kyvernoStatuses, isLoading: kyLoading, isRefreshing: kyRefreshing, isDemoData: kyDemoData, installed: kyInstalled, hasErrors: kyHasErrors, clustersChecked: kyChecked, totalClusters: kyTotal, unavailableReason: kyUnavailable } = useKyverno()
  const { selectedClusters } = useGlobalFilters()
  const { startMission } = useMissions()
  const [showBreakdown, setShowBreakdown] = useState(false)

  const isLoading = ksLoading || kyLoading
  const totalChecking = Math.max(ksTotal, kyTotal)
  const minChecked = Math.min(ksChecked, kyChecked)
  const allChecked = minChecked >= totalChecking && totalChecking > 0
  const { score, breakdown, usingFallback } = useMemo(() => buildComplianceScoreSummary({
    kubescapeStatuses,
    kyvernoStatuses,
    selectedClusters,
  }), [kubescapeStatuses, kyvernoStatuses, selectedClusters])

  const kyvernoBreakdownData = useMemo(() => {
    let totalPolicies = 0
    let totalViolations = 0
    let enforcingCount = 0
    let auditCount = 0

    for (const [clusterName, status] of Object.entries(kyvernoStatuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue
      totalPolicies += status.totalPolicies
      totalViolations += status.totalViolations
      enforcingCount += status.enforcingCount
      auditCount += status.auditCount
    }

    return totalPolicies > 0 ? { totalPolicies, totalViolations, enforcingCount, auditCount } : undefined
  }, [kyvernoStatuses, selectedClusters])

  const isDemoData = ksDemoData || kyDemoData
  const scoreHasData = !usingFallback || isDemoData
  const scoreFailed = ksHasErrors && kyHasErrors
  useCardLoadingState({
    isLoading: isLoading && !scoreHasData,
    isRefreshing: ksRefreshing || kyRefreshing,
    hasAnyData: scoreHasData,
    isDemoData,
    isFailed: scoreFailed,
  })

  const handleInstallCompliance = () => {
    startMission({
      title: 'Install Compliance Tools',
      description: 'Install Kubescape and/or Kyverno for compliance score tracking',
      type: 'deploy',
      initialPrompt: COMPLIANCE_INSTALL_PROMPT,
      context: {},
    })
  }

  const scoreContext = getScoreContext(score)
  const scoreClusters = useMemo(() => {
    const clusters = new Set<string>()
    for (const status of Object.values(kubescapeStatuses)) {
      if (status.installed) {
        clusters.add(status.cluster)
      }
    }
    for (const status of Object.values(kyvernoStatuses)) {
      if (status.installed) {
        clusters.add(status.cluster)
      }
    }
    return Array.from(clusters)
  }, [kubescapeStatuses, kyvernoStatuses])
  const noToolsInstalled = !isLoading && !ksInstalled && !kyInstalled && !isDemoData

  if (ksUnavailable && kyUnavailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <ShieldOff className="w-8 h-8 opacity-50" />
        <p>{CARD_UI_STRINGS.compliance.complianceScoreUnavailable}</p>
        <p className="text-xs opacity-70">{CARD_UI_STRINGS.compliance.requiresLocalAgent}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!allChecked && totalChecking > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:complianceScore.checkingClusters', { checked: minChecked, total: totalChecking })}</span>
        </div>
      )}

      {scoreClusters.length > 0 && !isDemoData && (
        <div className="flex flex-wrap gap-1">
          {scoreClusters.map((cluster) => (
            <StatusBadge key={cluster} color="purple" size="xs">{cluster}</StatusBadge>
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-secondary/20 rounded-md px-2 py-1.5">
        <Info className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/60" />
        <span>{CARD_DESCRIPTIONS.compliance_score.description}</span>
      </div>

      {!isDemoData && !usingFallback && allChecked && totalChecking > 0 && scoreClusters.length < totalChecking && (
        <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>{t('cards:complianceScore.partialCoverage', { reporting: scoreClusters.length, total: totalChecking })}</span>
        </div>
      )}

      {noToolsInstalled ? (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">{t('cards:complianceScore.noToolsDetected')}</p>
            <p className="text-muted-foreground">
              {t('cards:complianceScore.installDescription')}{' '}
              <button onClick={handleInstallCompliance} className="text-cyan-400 hover:underline">
                {t('cards:complianceScore.installWithMission')} →
              </button>
            </p>
          </div>
        </div>
      ) : (
        <>
          <div
            className="flex items-center justify-center py-4 cursor-pointer group"
            onClick={() => setShowBreakdown(true)}
            role="button"
            aria-label={t('cards:complianceScore.viewBreakdownAria')}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setShowBreakdown(true)
              }
            }}
            title={t('cards:complianceScore.clickForBreakdown')}
          >
            <div className="relative w-24 h-24 group-hover:scale-105 transition-transform">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
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
            <span className={`text-xs font-semibold ${scoreContext.color}`}>{scoreContext.label}</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">{scoreContext.description}</p>
          </div>

          <div className="space-y-1.5">
            {(breakdown || []).map((item, index) => (
              <div key={index} className="flex items-center gap-2 px-1">
                <span className="text-xs text-muted-foreground w-20 truncate">{item.name}</span>
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${item.value >= 80 ? 'bg-green-400/60' : item.value >= 60 ? 'bg-yellow-400/60' : 'bg-red-400/60'}`}
                    style={{ width: `${item.value}%` }}
                  />
                </div>
                <span className={`text-xs font-medium w-10 text-right ${item.value >= 80 ? 'text-green-400' : item.value >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {item.value}%
                </span>
              </div>
            ))}
          </div>

          <ComplianceScoreBreakdownModal
            isOpen={showBreakdown}
            onClose={() => setShowBreakdown(false)}
            score={score}
            breakdown={breakdown}
            kubescapeData={kubescapeAgg.totalControls > 0 ? {
              totalControls: kubescapeAgg.totalControls,
              passedControls: kubescapeAgg.passedControls,
              failedControls: kubescapeAgg.failedControls,
              frameworks: kubescapeAgg.frameworks || [],
            } : undefined}
            kyvernoData={kyvernoBreakdownData}
          />
        </>
      )}
    </div>
  )
}
