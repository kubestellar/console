import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Info, Loader2, Shield, ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useKyverno } from '../../../hooks/useKyverno'
import { useMissions } from '../../../hooks/useMissions'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useCardLoadingState } from '../CardDataContext'
import { StatusBadge } from '../../ui/StatusBadge'
import { KyvernoDetailModal } from '../kyverno/KyvernoDetailModal'
import { PolicyViolationDetailModal } from './PolicyViolationDetailModal'
import { CARD_DESCRIPTIONS } from '../../../lib/constants/compliance'
import { CARD_UI_STRINGS } from '../strings'
import type { CardConfig } from './cardTypes'
import { MAX_VIOLATION_ENTRIES, TROUBLESHOOT_MISSIONS } from './complianceConstants'

export function PolicyViolationsCard({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses, isLoading, isRefreshing, isDemoData, installed, hasErrors, clustersChecked, totalClusters, unavailableReason, refetch } = useKyverno()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [modalCluster, setModalCluster] = useState<string | null>(null)
  const [selectedViolation, setSelectedViolation] = useState<{ policy: string; count: number; tool: string; clusters: string[] } | null>(null)

  const allChecked = clustersChecked >= totalClusters && totalClusters > 0
  const violations = useMemo(() => {
    const result: Array<{ policy: string; count: number; tool: string; clusters: string[] }> = []
    const clusterViolations = new Map<string, { count: number; clusters: string[] }>()

    for (const [clusterName, status] of Object.entries(statuses)) {
      if (!status.installed) continue
      if (selectedClusters.length > 0 && !selectedClusters.includes(clusterName)) continue

      if ((status.reports || []).length > 0) {
        for (const report of (status.reports || [])) {
          if (report.fail === 0) continue
          const key = report.namespace || 'cluster-scoped'
          if (!clusterViolations.has(key)) {
            clusterViolations.set(key, { count: 0, clusters: [] })
          }
          const entry = clusterViolations.get(key)
          if (!entry) continue
          entry.count += report.fail
          if (!entry.clusters.includes(clusterName)) {
            entry.clusters.push(clusterName)
          }
        }
      } else if (status.totalViolations > 0) {
        const key = 'all-policies'
        if (!clusterViolations.has(key)) {
          clusterViolations.set(key, { count: 0, clusters: [] })
        }
        const entry = clusterViolations.get(key)
        if (!entry) continue
        entry.count += status.totalViolations
        if (!entry.clusters.includes(clusterName)) {
          entry.clusters.push(clusterName)
        }
      }
    }

    for (const [policy, data] of clusterViolations.entries()) {
      result.push({ policy, tool: 'Kyverno', ...data })
    }

    return result.sort((a, b) => b.count - a.count).slice(0, MAX_VIOLATION_ENTRIES)
  }, [selectedClusters, statuses])

  const isDegraded = (() => {
    if (!installed || isLoading) {
      return false
    }

    const installedClusters = Object.values(statuses).filter((status) => status.installed)
    return installedClusters.length > 0 && installedClusters.every((status) => status.totalPolicies === 0)
  })()

  const handleTroubleshoot = () => {
    const mission = TROUBLESHOOT_MISSIONS.kyverno
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'troubleshoot',
      initialPrompt: mission.prompt,
      context: {},
    })
  }

  const participatingClusters = useMemo(
    () => Object.values(statuses).filter((status) => status.installed).map((status) => status.cluster),
    [statuses],
  )
  const hasData = violations.length > 0 || isDemoData
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData, isFailed: hasErrors })

  if (unavailableReason) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <ShieldOff className="w-8 h-8 opacity-50" />
        <p>{CARD_UI_STRINGS.compliance.policyViolationsUnavailable}</p>
        <p className="text-xs opacity-70">{CARD_UI_STRINGS.compliance.requiresLocalAgent}</p>
      </div>
    )
  }

  if (violations.length === 0 && !isDemoData) {
    if (isLoading || isRefreshing) {
      return (
        <div className="space-y-3">
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
            <Loader2 className="w-8 h-8 mb-2 opacity-50 animate-spin" />
            <p className="text-sm">{t('cards:policyViolations.scanning')}</p>
            {totalClusters > 0 ? (
              <p className="text-xs mt-1">{t('cards:policyViolations.checkingClusters', { checked: clustersChecked, total: totalClusters })}</p>
            ) : (
              <p className="text-xs mt-1">{t('cards:policyViolations.checkingReports')}</p>
            )}
          </div>
        </div>
      )
    }

    if (hasErrors) {
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-400 font-medium">{t('cards:policyViolations.failedToFetch')}</p>
              <p className="text-muted-foreground">
                {t('cards:policyViolations.checkConnectivity')}{' '}
                <button onClick={() => refetch()} className="text-red-400 hover:underline">
                  {t('cards:policyViolations.retry')} →
                </button>
              </p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {isDegraded && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 font-medium">{t('cards:policyViolations.noPoliciesConfigured')}</p>
              <p className="text-muted-foreground">
                {t('cards:policyViolations.kyvernoNoPolicies')}{' '}
                <button onClick={handleTroubleshoot} className="text-amber-400 hover:underline">
                  {t('cards:policyViolations.fixWithMission')} →
                </button>
              </p>
            </div>
          </div>
        )}
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
          <Shield className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">{t('cards:policyViolations.noViolationsDetected')}</p>
          <p className="text-xs mt-1">{t('cards:policyViolations.allResourcesComply')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!allChecked && totalClusters > 0 && !isRefreshing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:policyViolations.checkingClusters', { checked: clustersChecked, total: totalClusters })}</span>
        </div>
      )}

      {participatingClusters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {participatingClusters.map((cluster) => (
            <StatusBadge key={cluster} color="purple" size="xs">{cluster}</StatusBadge>
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground bg-secondary/20 rounded-md px-2 py-1.5">
        <Info className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/60" />
        <span>{CARD_DESCRIPTIONS.policy_violations.description}</span>
      </div>

      <div className="space-y-2">
        {(violations || []).map((violation, index) => (
          <div
            key={index}
            className="group flex flex-wrap items-center justify-between gap-y-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
            onClick={() => setSelectedViolation(violation)}
            role="button"
            aria-label={t('cards:policyViolations.viewViolationAria', { policy: violation.policy })}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelectedViolation(violation)
              }
            }}
          >
            <div>
              <p className="text-sm font-medium text-foreground">{violation.policy}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{violation.tool}</span>
                {violation.clusters.length > 0 && <span>· {(violation.clusters || []).join(', ')}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge color="orange" size="md">{violation.count}</StatusBadge>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>

      {modalCluster && statuses[modalCluster] && (
        <KyvernoDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={statuses[modalCluster]}
          onRefresh={() => refetch()}
          isRefreshing={isRefreshing}
        />
      )}

      <PolicyViolationDetailModal
        isOpen={!!selectedViolation}
        onClose={() => setSelectedViolation(null)}
        violation={selectedViolation}
      />
    </div>
  )
}
