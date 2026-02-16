import { useCallback } from 'react'
import { useClusters, useDeployments } from '../../hooks/useMCP'
import { useCachedProwJobs } from '../../hooks/useCachedData'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { useTranslation } from 'react-i18next'

const CICD_CARDS_KEY = 'kubestellar-cicd-cards'

// Default cards for CI/CD dashboard
const DEFAULT_CICD_CARDS = getDefaultCards('ci-cd')

export function CICD() {
  const { t: _t } = useTranslation()
  const { clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch, error } = useClusters()
  const { jobs: prowJobs, isLoading: prowLoading, status: prowStatus } = useCachedProwJobs()
  const { deployments, isLoading: deploymentsLoading } = useDeployments()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Filter reachable clusters
  const reachableClusters = clusters.filter(c => c.reachable !== false)

  // Calculate pipeline/job stats
  const runningJobs = prowJobs.filter(j => j.state === 'pending' || j.state === 'running').length
  const failedJobs = prowJobs.filter(j => j.state === 'failure' || j.state === 'error').length

  // Count active deployments (currently deploying or recently deployed)
  const deploymentsToday = deployments.filter(d => d.status === 'deploying' || d.status === 'running').length

  // Determine if we have real data
  const hasRealData = prowJobs.length > 0 || deployments.length > 0
  const isDemoData = !hasRealData && !prowLoading && !deploymentsLoading

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: reachableClusters.length, sublabel: 'clusters', isClickable: false }
      case 'pipelines':
        return {
          value: prowJobs.length,
          sublabel: `${runningJobs} running`,
          isClickable: false,
          isDemo: prowJobs.length === 0 && !prowLoading
        }
      case 'running_jobs':
        return {
          value: runningJobs,
          sublabel: 'running jobs',
          isClickable: false,
          isDemo: prowJobs.length === 0 && !prowLoading
        }
      case 'failed_jobs':
        return {
          value: failedJobs,
          sublabel: 'failed jobs',
          isClickable: false,
          isDemo: prowJobs.length === 0 && !prowLoading
        }
      case 'success_rate':
        const successRate = prowStatus?.successRate || 0
        return {
          value: `${Math.round(successRate)}%`,
          sublabel: 'success rate',
          isClickable: false,
          isDemo: prowJobs.length === 0 && !prowLoading
        }
      case 'deployments':
        return {
          value: deploymentsToday,
          sublabel: 'deployments today',
          isClickable: false,
          isDemo: deployments.length === 0 && !deploymentsLoading
        }
      default:
        return { value: '-' }
    }
  }, [reachableClusters, prowJobs, runningJobs, failedJobs, prowStatus, deploymentsToday, deployments, prowLoading, deploymentsLoading])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="CI/CD"
      subtitle="Monitor continuous integration and deployment pipelines"
      icon="GitPullRequest"
      storageKey={CICD_CARDS_KEY}
      defaultCards={DEFAULT_CICD_CARDS}
      statsType="gitops"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading || prowLoading || deploymentsLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={reachableClusters.length > 0 || hasRealData}
      isDemoData={isDemoData}
      emptyState={{
        title: 'CI/CD Dashboard',
        description: 'Add cards to monitor pipelines, builds, and deployment status across your clusters.',
      }}
    >
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          <div className="font-medium">Error loading cluster data</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
      )}
    </DashboardPage>
  )
}
