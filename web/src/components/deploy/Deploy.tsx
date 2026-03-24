import { useState, useCallback } from 'react'
import { useDeployments, useHelmReleases } from '../../hooks/useMCP'
import { useCachedDeployments } from '../../hooks/useCachedData'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { emitDeployWorkload } from '../../lib/analytics'
import { useCardPublish, type DeployResultPayload } from '../../lib/cardEvents'
import { DeployConfirmDialog } from './DeployConfirmDialog'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { usePersistence } from '../../hooks/usePersistence'
import { useWorkloadDeployments, useManagedWorkloads } from '../../hooks/useConsoleCRs'
import { useToast } from '../ui/Toast'
import { useTranslation } from 'react-i18next'

const DEPLOY_CARDS_KEY = 'kubestellar-deploy-cards'
const DEFAULT_DEPLOY_CARDS = getDefaultCards('deploy')

export function Deploy() {
  const { t } = useTranslation(['cards', 'common'])
  const { isLoading: deploymentsLoading, isRefreshing: deploymentsRefreshing, lastUpdated, refetch } = useDeployments()
  const { deployments: cachedDeployments } = useCachedDeployments()
  const { releases: helmReleases } = useHelmReleases()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  const publishCardEvent = useCardPublish()
  const { mutate: deployWorkload } = useDeployWorkload()
  const { showToast } = useToast()

  // Persistence hooks for CR-backed state
  const { isEnabled: persistenceEnabled, isActive: persistenceActive } = usePersistence()
  const shouldPersist = persistenceEnabled && persistenceActive
  const { createItem: createWorkloadDeployment } = useWorkloadDeployments()
  const { createItem: createManagedWorkload } = useManagedWorkloads()

  // Deploy stats from cached data (works in demo mode too)
  const runningCount = cachedDeployments.filter(d => d.status === 'running' || (d.readyReplicas === d.replicas && d.replicas > 0)).length
  const progressingCount = cachedDeployments.filter(d => d.status === 'deploying').length
  const failedCount = cachedDeployments.filter(d => d.status === 'failed').length

  const getDeployStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'deployments':
        return { value: cachedDeployments.length, sublabel: t('common:deploy.totalDeployments') }
      case 'healthy':
        return { value: runningCount, sublabel: t('common:common.running') }
      case 'progressing':
        return { value: progressingCount, sublabel: t('common:deploy.deploying') }
      case 'failed':
        return { value: failedCount, sublabel: t('common:common.failed') }
      case 'helm':
        return { value: helmReleases.length, sublabel: t('common:deploy.releases') }
      case 'argocd':
        return { value: 0, sublabel: t('common:deploy.applications'), isDemo: true }
      default:
        return { value: '-' }
    }
  }, [cachedDeployments.length, runningCount, progressingCount, failedCount, helmReleases.length, t])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDeployStatValue, getUniversalStatValue)(blockId),
    [getDeployStatValue, getUniversalStatValue]
  )

  // Pending deploy state for confirmation dialog
  const [pendingDeploy, setPendingDeploy] = useState<{
    workloadName: string
    namespace: string
    sourceCluster: string
    targetClusters: string[]
    groupName: string
  } | null>(null)

  // Handle confirmed deploy
  const handleConfirmDeploy = useCallback(async () => {
    if (!pendingDeploy) return
    const { workloadName, namespace, sourceCluster, targetClusters, groupName } = pendingDeploy
    setPendingDeploy(null)
    emitDeployWorkload(workloadName, groupName)

    const deployId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    publishCardEvent({
      type: 'deploy:started',
      payload: {
        id: deployId,
        workload: workloadName,
        namespace,
        sourceCluster,
        targetClusters,
        groupName,
        timestamp: Date.now(),
      },
    })

    // Create CRs when persistence is enabled
    if (shouldPersist) {
      try {
        // Create ManagedWorkload CR to track the workload
        const workloadCRName = `${workloadName}-${namespace}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
        await createManagedWorkload({
          metadata: { name: workloadCRName },
          spec: {
            sourceCluster,
            sourceNamespace: namespace,
            workloadRef: {
              kind: 'Deployment',
              name: workloadName,
            },
            targetClusters,
            targetGroups: groupName ? [groupName] : undefined,
          },
        })

        // Create WorkloadDeployment CR to track the deployment action
        const deploymentCRName = `${workloadName}-to-${groupName || 'clusters'}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 63)
        await createWorkloadDeployment({
          metadata: { name: deploymentCRName },
          spec: {
            workloadRef: { name: workloadCRName },
            targetGroupRef: groupName ? { name: groupName } : undefined,
            targetClusters: groupName ? undefined : targetClusters,
            strategy: 'RollingUpdate',
          },
        })
      } catch (err) {
        console.error('Failed to create persistence CRs:', err)
        showToast('Failed to create deployment tracking records', 'warning')
        // Continue with deploy even if CR creation fails
      }
    }

    try {
      await deployWorkload({
        workloadName,
        namespace,
        sourceCluster,
        targetClusters,
        groupName,
      }, {
        onSuccess: (result) => {
          const resp = result as unknown as {
            success?: boolean
            message?: string
            deployedTo?: string[]
            failedClusters?: string[]
            dependencies?: { kind: string; name: string; action: string }[]
            warnings?: string[]
          }
          if (resp && typeof resp === 'object') {
            publishCardEvent({
              type: 'deploy:result',
              payload: {
                id: deployId,
                success: resp.success ?? true,
                message: resp.message ?? '',
                deployedTo: resp.deployedTo,
                failedClusters: resp.failedClusters,
                dependencies: resp.dependencies as DeployResultPayload['dependencies'],
                warnings: resp.warnings,
              },
            })
          }
        },
      })
    } catch (err) {
      console.error('Deploy failed:', err)
      publishCardEvent({
        type: 'deploy:result',
        payload: {
          id: deployId,
          success: false,
          message: err instanceof Error ? err.message : 'Deploy failed',
          deployedTo: [],
          failedClusters: targetClusters,
        },
      })
    }
  }, [pendingDeploy, publishCardEvent, deployWorkload, shouldPersist, createManagedWorkload, createWorkloadDeployment, showToast])

  return (
    <DashboardPage
      title={t('common:deploy.title')}
      subtitle={t('common:deploy.subtitle')}
      icon="Rocket"
      storageKey={DEPLOY_CARDS_KEY}
      defaultCards={DEFAULT_DEPLOY_CARDS}
      statsType="deploy"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={deploymentsLoading}
      isRefreshing={deploymentsRefreshing}
      lastUpdated={lastUpdated}
      hasData={cachedDeployments.length > 0}
      emptyState={{
        title: t('common:deploy.dashboardTitle'),
        description: t('common:deploy.emptyDescription'),
      }}
    >
      {/* Pre-deploy Confirmation Dialog */}
      <DeployConfirmDialog
        isOpen={pendingDeploy !== null}
        onClose={() => setPendingDeploy(null)}
        onConfirm={handleConfirmDeploy}
        workloadName={pendingDeploy?.workloadName ?? ''}
        namespace={pendingDeploy?.namespace ?? ''}
        sourceCluster={pendingDeploy?.sourceCluster ?? ''}
        targetClusters={pendingDeploy?.targetClusters ?? []}
        groupName={pendingDeploy?.groupName}
      />
    </DashboardPage>
  )
}
