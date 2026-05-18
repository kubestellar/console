import { useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, Info, Loader2, ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTrivy } from '../../../hooks/useTrivy'
import { useMissions } from '../../../hooks/useMissions'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useCardLoadingState } from '../CardDataContext'
import { TrivyDetailModal } from '../trivy/TrivyDetailModal'
import { StatusBadge } from '../../ui/StatusBadge'
import { TRIVY_SEVERITY } from '../../../lib/constants/compliance'
import { CARD_UI_STRINGS } from '../strings'
import type { CardConfig } from './cardTypes'
import { TROUBLESHOOT_MISSIONS } from './complianceConstants'

export function TrivyScanCard({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses, aggregated, isLoading, isRefreshing, installed, hasErrors, isDemoData, clustersChecked, totalClusters, unavailableReason, refetch } = useTrivy()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [modalCluster, setModalCluster] = useState<string | null>(null)

  const allChecked = clustersChecked >= totalClusters && totalClusters > 0
  const filtered = useMemo(() => {
    if (selectedClusters.length === 0) {
      return aggregated
    }

    const aggregate = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 }
    for (const [name, status] of Object.entries(statuses)) {
      if (!status.installed || !selectedClusters.includes(name)) continue
      const vulnerabilities = status.vulnerabilities
      if (!vulnerabilities) continue
      aggregate.critical += vulnerabilities.critical
      aggregate.high += vulnerabilities.high
      aggregate.medium += vulnerabilities.medium
      aggregate.low += vulnerabilities.low
      aggregate.unknown += vulnerabilities.unknown
    }

    return aggregate
  }, [aggregated, selectedClusters, statuses])

  const hasData = installed || isDemoData
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData, isFailed: hasErrors })

  const isDegraded = (() => {
    if (!installed || isLoading) {
      return false
    }

    const installedClusters = Object.values(statuses).filter((status) => status.installed && !status.error)
    return installedClusters.length > 0 && installedClusters.every((status) => status.totalReports === 0)
  })()

  const handleInstall = () => {
    startMission({
      title: 'Install Trivy Operator',
      description: 'Install Trivy Operator for container vulnerability scanning',
      type: 'deploy',
      initialPrompt: `I want to install the Trivy Operator for vulnerability scanning on my clusters.

Please help me:
1. Install Trivy Operator via Helm (scan-only mode, no enforcement)
2. Verify the operator is running and scanning
3. Check for initial vulnerability reports

Use: helm install trivy-operator aquasecurity/trivy-operator --version 0.23.0 --namespace trivy --create-namespace

Please proceed step by step.`,
      context: {},
    })
  }

  const handleTroubleshoot = () => {
    const mission = TROUBLESHOOT_MISSIONS.trivy
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'troubleshoot',
      initialPrompt: mission.prompt,
      context: {},
    })
  }

  if (unavailableReason) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <ShieldOff className="w-8 h-8 opacity-50" />
        <p>{CARD_UI_STRINGS.compliance.trivyUnavailable}</p>
        <p className="text-xs opacity-70">{CARD_UI_STRINGS.compliance.requiresLocalAgent}</p>
      </div>
    )
  }

  if (isLoading && Object.keys(statuses).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        {totalClusters > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('cards:trivyScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!allChecked && totalClusters > 0 && !isRefreshing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{t('cards:trivyScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}</span>
        </div>
      )}

      {hasErrors && !isDemoData && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">{t('cards:trivyScan.failedToFetch')}</p>
            <p className="text-muted-foreground">
              {t('cards:trivyScan.checkConnectivity')}{' '}
              <button onClick={() => refetch()} className="text-red-400 hover:underline">
                {t('cards:trivyScan.retry')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {!installed && !isLoading && !isRefreshing && !hasErrors && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-cyan-400 font-medium">{t('cards:trivyScan.integration')}</p>
            <p className="text-muted-foreground">
              {t('cards:trivyScan.installDescription')}{' '}
              <button onClick={handleInstall} className="text-cyan-400 hover:underline">
                {t('cards:trivyScan.installWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {isDegraded && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">{t('cards:trivyScan.noScanData')}</p>
            <p className="text-muted-foreground">
              {t('cards:trivyScan.installedNoReports')}{' '}
              <button onClick={handleTroubleshoot} className="text-amber-400 hover:underline">
                {t('cards:trivyScan.fixWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {installed && Object.values(statuses).some((status) => status.installed) && (
        <div className="flex flex-wrap gap-1">
          {Object.values(statuses).filter((status) => status.installed).map((status) => (
            <button key={status.cluster} onClick={() => setModalCluster(status.cluster)} className="cursor-pointer">
              <StatusBadge color={(status.vulnerabilities?.critical ?? 0) > 0 ? 'red' : 'green'} size="xs">
                {status.cluster}: {status.vulnerabilities?.critical ?? 0}C/{status.vulnerabilities?.high ?? 0}H
              </StatusBadge>
            </button>
          ))}
        </div>
      )}

      <div
        className="grid grid-cols-2 gap-2 cursor-pointer"
        onClick={() => {
          const firstCluster = Object.values(statuses).find((status) =>
            status.installed && (selectedClusters.length === 0 || selectedClusters.includes(status.cluster)),
          )
          if (firstCluster) {
            setModalCluster(firstCluster.cluster)
          }
        }}
        role="button"
        aria-label={t('cards:trivyScan.viewDetailsAria')}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            const firstCluster = Object.values(statuses).find((status) =>
              status.installed && (selectedClusters.length === 0 || selectedClusters.includes(status.cluster)),
            )
            if (firstCluster) {
              setModalCluster(firstCluster.cluster)
            }
          }
        }}
      >
        <SeverityCard value={filtered.critical} label={t('common.critical')} description={TRIVY_SEVERITY.critical.description} className="bg-red-500/10 text-red-400 hover:bg-red-500/20" />
        <SeverityCard value={filtered.high} label={t('cards:trivyScan.high')} description={TRIVY_SEVERITY.high.description} className="bg-orange-500/10 text-orange-400 hover:bg-orange-500/20" />
        <SeverityCard value={filtered.medium} label={t('cards:trivyScan.medium')} description={TRIVY_SEVERITY.medium.description} className="bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20" />
        <SeverityCard value={filtered.low} label={t('cards:trivyScan.low')} description={TRIVY_SEVERITY.low.description} className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" />
      </div>

      {filtered.critical > 0 && (
        <div className="flex items-start gap-1.5 px-1 text-[10px] text-red-400/80">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{TRIVY_SEVERITY.critical.action}</span>
        </div>
      )}

      {modalCluster && statuses[modalCluster] && (
        <TrivyDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={statuses[modalCluster]}
          onRefresh={() => refetch()}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  )
}

function SeverityCard({
  value,
  label,
  description,
  className,
}: {
  value: number
  label: string
  description: string
  className: string
}) {
  return (
    <div className={`p-2 rounded-lg text-center transition-colors relative ${className}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-[9px] mt-0.5 leading-tight opacity-70">{description}</p>
    </div>
  )
}
