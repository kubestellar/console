import { useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, ExternalLink, Loader2, ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useKubescape } from '../../../hooks/useKubescape'
import { useMissions } from '../../../hooks/useMissions'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useCardLoadingState } from '../CardDataContext'
import { KubescapeDetailModal } from '../kubescape/KubescapeDetailModal'
import { StatusBadge } from '../../ui/StatusBadge'
import { getFrameworkInfo, getScoreContext } from '../../../lib/constants/compliance'
import { CARD_UI_STRINGS } from '../strings'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import type { CardConfig } from './cardTypes'
import { TROUBLESHOOT_MISSIONS } from './complianceConstants'

export function KubescapeScanCard({ config: _config }: CardConfig) {
  const { t } = useTranslation(['common', 'cards'])
  const { statuses, aggregated, isLoading, isRefreshing, installed, hasErrors, isDemoData, clustersChecked, totalClusters, unavailableReason, refetch } = useKubescape()
  const { startMission } = useMissions()
  const { selectedClusters } = useGlobalFilters()
  const [modalCluster, setModalCluster] = useState<string | null>(null)

  const installedClusters = useMemo(
    () => Object.keys(statuses).filter((cluster) => statuses[cluster].installed),
    [statuses],
  )
  const allChecked = clustersChecked >= totalClusters && totalClusters > 0
  const filtered = useMemo(() => {
    if (selectedClusters.length === 0) {
      return aggregated
    }

    const clusterStatuses = Object.entries(statuses)
      .filter(([name, status]) => status.installed && selectedClusters.includes(name))
      .map(([, status]) => status)

    if (clusterStatuses.length === 0) {
      return aggregated
    }

    const totalScore = clusterStatuses.reduce((sum, status) => sum + status.overallScore, 0)
    return {
      overallScore: Math.round(totalScore / clusterStatuses.length),
      frameworks: clusterStatuses[0]?.frameworks || [],
      totalControls: clusterStatuses.reduce((sum, status) => sum + status.totalControls, 0),
      passedControls: clusterStatuses.reduce((sum, status) => sum + status.passedControls, 0),
      failedControls: clusterStatuses.reduce((sum, status) => sum + status.failedControls, 0),
    }
  }, [aggregated, selectedClusters, statuses])

  const hasData = installed || isDemoData
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData, isFailed: hasErrors })

  const isDegraded = (() => {
    if (!installed || isLoading) {
      return false
    }

    const activeClusters = Object.values(statuses).filter((status) => status.installed && !status.error)
    return activeClusters.length > 0 && activeClusters.every((status) => status.totalControls === 0)
  })()

  const handleInstall = () => {
    startMission({
      title: 'Install Kubescape',
      description: 'Install Kubescape Operator for security posture management',
      type: 'deploy',
      initialPrompt: `I want to install the Kubescape Operator for security posture scanning on my clusters.

Please help me:
1. Install Kubescape Operator via Helm (scan-only, no enforcement)
2. Verify it's running and scanning
3. Check initial scan results

Use: helm install kubescape-operator kubescape/kubescape-operator --version 1.30.5 --namespace kubescape --create-namespace --set capabilities.continuousScan=enable

Please proceed step by step.`,
      context: {},
    })
  }

  const handleTroubleshoot = () => {
    const mission = TROUBLESHOOT_MISSIONS.kubescape
    startMission({
      title: mission.title,
      description: mission.description,
      type: 'troubleshoot',
      initialPrompt: mission.prompt,
      context: {},
    })
  }

  const score = filtered.overallScore

  if (unavailableReason) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <ShieldOff className="w-8 h-8 opacity-50" />
        <p>{CARD_UI_STRINGS.compliance.kubescapeUnavailable}</p>
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
            {t('cards:kubescapeScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}
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
          <span>{t('cards:kubescapeScan.checkingClusters', { checked: clustersChecked, total: totalClusters })}</span>
        </div>
      )}

      {hasErrors && !isDemoData && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">{t('cards:kubescapeScan.failedToFetch')}</p>
            <p className="text-muted-foreground">
              {t('cards:kubescapeScan.checkConnectivity')}{' '}
              <button onClick={() => refetch()} className="text-red-400 hover:underline">
                {t('cards:kubescapeScan.retry')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {!installed && !isLoading && !isRefreshing && !hasErrors && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs">
          <AlertCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-400 font-medium">{t('cards:kubescapeScan.integration')}</p>
            <p className="text-muted-foreground">
              {t('cards:kubescapeScan.installDescription')}{' '}
              <button onClick={handleInstall} className="text-green-400 hover:underline">
                {t('cards:kubescapeScan.installWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {isDegraded && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">{t('cards:kubescapeScan.noScanData')}</p>
            <p className="text-muted-foreground">
              {t('cards:kubescapeScan.installedNoResults')}{' '}
              <button onClick={handleTroubleshoot} className="text-amber-400 hover:underline">
                {t('cards:kubescapeScan.fixWithMission')} →
              </button>
            </p>
          </div>
        </div>
      )}

      {installed && Object.values(statuses).some((status) => status.installed) && (
        <div className="flex flex-wrap gap-1">
          {Object.values(statuses).filter((status) => status.installed).map((status) => (
            <button key={status.cluster} onClick={() => setModalCluster(status.cluster)} className="cursor-pointer">
              <StatusBadge color={status.overallScore >= 80 ? 'green' : status.overallScore >= 60 ? 'yellow' : 'red'} size="xs">
                {status.cluster}: {status.overallScore}%
              </StatusBadge>
            </button>
          ))}
        </div>
      )}

      <div
        className="cursor-pointer"
        onClick={() => {
          const firstCluster = Object.values(statuses).find((status) =>
            status.installed && (selectedClusters.length === 0 || selectedClusters.includes(status.cluster)),
          )
          if (firstCluster) {
            setModalCluster(firstCluster.cluster)
          }
        }}
        role="button"
        aria-label={t('cards:kubescapeScan.viewDetailsAria')}
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
        <div className="flex items-center justify-center py-2">
          <div className="relative w-20 h-20">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-secondary" />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${score}, 100`}
                className={score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-foreground">{score}%</span>
            </div>
          </div>
        </div>

        {(() => {
          const context = getScoreContext(score)
          return (
            <div className="text-center mb-2">
              <span className={`text-xs font-semibold ${context.color}`}>{context.label}</span>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{context.description}</p>
            </div>
          )
        })()}

        <div className="flex items-center justify-center gap-3 mb-2 text-[10px] text-muted-foreground">
          <span>{filtered.passedControls} {t('cards:kubescapeScan.passed')}</span>
          <span className="text-muted-foreground/30">|</span>
          <span className={filtered.failedControls > 0 ? 'text-red-400' : ''}>{filtered.failedControls} {t('cards:kubescapeScan.failed')}</span>
          <span className="text-muted-foreground/30">|</span>
          <span>{filtered.totalControls} {t('cards:kubescapeScan.total')}</span>
        </div>

        <div className="space-y-1.5">
          {(filtered.frameworks || []).map((framework, index) => {
            const frameworkInfo = getFrameworkInfo(framework.name)
            return (
              <div key={index} className="rounded-md px-2 py-1.5 hover:bg-secondary/30 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-medium text-foreground truncate">
                      {frameworkInfo?.label || framework.name}
                    </span>
                    {frameworkInfo?.url && (
                      <a
                        href={sanitizeUrl(frameworkInfo.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="text-muted-foreground/50 hover:text-blue-400 transition-colors shrink-0"
                        title={t('cards:kubescapeScan.viewFrameworkSpec')}
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  <span className={`text-xs font-bold ${framework.score >= 80 ? 'text-green-400' : framework.score >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {framework.score}%
                  </span>
                </div>
                {frameworkInfo && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{frameworkInfo.description}</p>
                )}
                <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${framework.score >= 80 ? 'bg-green-400/60' : framework.score >= 60 ? 'bg-yellow-400/60' : 'bg-red-400/60'}`}
                    style={{ width: `${framework.score}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {modalCluster && statuses[modalCluster] && (
        <KubescapeDetailModal
          isOpen={!!modalCluster}
          onClose={() => setModalCluster(null)}
          clusterName={modalCluster}
          status={statuses[modalCluster]}
          clusters={installedClusters}
          onClusterChange={(cluster) => setModalCluster(cluster)}
          onRefresh={() => refetch()}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  )
}
