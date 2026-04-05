import { useState, useCallback, useMemo, useRef } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useClusterGroups } from '../../hooks/useClusterGroups'
import { useClusters, useDeployments } from '../../hooks/useMCP'
import { useCachedDeployments } from '../../hooks/useCachedData'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { RotatingTip } from '../ui/RotatingTip'
import { emitDeployWorkload } from '../../lib/analytics'
import { useCardPublish, type DeployResultPayload } from '../../lib/cardEvents'
import { DeployConfirmDialog } from './DeployConfirmDialog'
import { useDeployWorkload } from '../../hooks/useWorkloads'
import { usePersistence } from '../../hooks/usePersistence'
import { useWorkloadDeployments, useManagedWorkloads } from '../../hooks/useConsoleCRs'
import { useToast } from '../ui/Toast'
import { useModalNavigation, useModalFocusTrap } from '../../lib/modals/useModalNavigation'
import { useTranslation } from 'react-i18next'

const DEPLOY_CARDS_KEY = 'kubestellar-deploy-cards'
const DEFAULT_DEPLOY_CARDS = getDefaultCards('deploy')

export function Deploy() {
  const { t } = useTranslation(['cards', 'common'])
  const { isLoading: deploymentsLoading, isRefreshing: deploymentsRefreshing, lastUpdated, refetch } = useDeployments()
  const { deployments: cachedDeployments } = useCachedDeployments()
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
      case 'argocd':
        return { value: 0, sublabel: t('common:deploy.applications'), isDemo: true }
      default:
        return { value: '-' }
    }
  }, [cachedDeployments.length, runningCount, progressingCount, failedCount, t])

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
      const errorMessage = (err instanceof Error && err.message.trim()) ? err.message.trim() : 'Deploy failed'
      showToast(errorMessage, 'error')
      publishCardEvent({
        type: 'deploy:result',
        payload: {
          id: deployId,
          success: false,
          message: errorMessage,
          deployedTo: [],
          failedClusters: targetClusters,
        },
      })
    }
  }, [pendingDeploy, publishCardEvent, deployWorkload, shouldPersist, createManagedWorkload, createWorkloadDeployment, showToast])

  // Cluster groups for the picker fallback
  const { groups: clusterGroups } = useClusterGroups()
  const { deduplicatedClusters: allClusters } = useClusters()
  const builtInGroup = useMemo(() => ({
    name: 'all-healthy-clusters',
    clusters: allClusters.filter(c => c.healthy).map(c => c.name),
  }), [allClusters])
  const allGroups = useMemo(() => [
    builtInGroup,
    ...clusterGroups.map(g => ({ name: g.name, clusters: g.clusters })),
  ], [builtInGroup, clusterGroups])

  // Workload dropped on card but not a specific group → show group picker
  const [groupPickerWorkload, setGroupPickerWorkload] = useState<{
    name: string; namespace: string; sourceCluster: string; currentClusters: string[]
  } | null>(null)

  // Handle workload dropped on a cluster group → open deploy dialog
  const handleWorkloadDrop = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    const activeData = active.data.current as Record<string, unknown> | undefined
    if (activeData?.type !== 'workload') return

    const workload = activeData.workload as {
      name: string
      namespace: string
      sourceCluster: string
      currentClusters: string[]
    }

    const overData = over?.data.current as Record<string, unknown> | undefined

    // Dropped on a specific cluster group
    if (overData?.type === 'cluster-group') {
      const clusters = (overData.clusters as string[]) || []
      const groupName = overData.groupName as string
      setPendingDeploy({
        workloadName: workload.name,
        namespace: workload.namespace,
        sourceCluster: workload.sourceCluster,
        targetClusters: clusters,
        groupName,
      })
      return
    }

    // Dropped anywhere else (or nowhere) → show group picker
    setGroupPickerWorkload(workload)
  }, [])

  // Group picker modal ref for focus trap
  const groupPickerRef = useRef<HTMLDivElement>(null)

  // Standardized keyboard navigation (Escape to close) and body scroll lock
  useModalNavigation({
    isOpen: groupPickerWorkload !== null,
    onClose: () => setGroupPickerWorkload(null),
    enableEscape: true,
    enableBackspace: false,
  })

  // Trap focus within group picker modal
  useModalFocusTrap(groupPickerRef as React.RefObject<HTMLElement>, groupPickerWorkload !== null)

  return (
    <DashboardPage
      title={t('common:deploy.title')}
      subtitle={t('common:deploy.subtitle')}
      icon="Rocket"
      rightExtra={<RotatingTip page="deploy" />}
      storageKey={DEPLOY_CARDS_KEY}
      defaultCards={DEFAULT_DEPLOY_CARDS}
      statsType="deploy"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={deploymentsLoading}
      isRefreshing={deploymentsRefreshing}
      lastUpdated={lastUpdated}
      hasData={cachedDeployments.length > 0}
      onDragEnd={handleWorkloadDrop}
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

      {/* Group Picker — shown when workload is dropped on the card but not a specific group */}
      {groupPickerWorkload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setGroupPickerWorkload(null)}>
          <div ref={groupPickerRef} className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5" role="dialog" aria-modal="true" aria-labelledby="group-picker-dialog-title" onClick={e => e.stopPropagation()}>
            <h3 id="group-picker-dialog-title" className="text-base font-medium text-foreground mb-1">
              Choose a cluster group
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Deploy <span className="font-medium text-foreground">{groupPickerWorkload.name}</span> to:
            </p>
            <div className="space-y-2">
              {allGroups.map(g => (
                <button
                  key={g.name}
                  onClick={() => {
                    setPendingDeploy({
                      workloadName: groupPickerWorkload.name,
                      namespace: groupPickerWorkload.namespace,
                      sourceCluster: groupPickerWorkload.sourceCluster,
                      targetClusters: g.clusters,
                      groupName: g.name,
                    })
                    setGroupPickerWorkload(null)
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg bg-secondary/50 hover:bg-secondary border border-border/50 hover:border-blue-400/50 transition-colors"
                >
                  <span className="block font-medium text-sm text-foreground">{g.name}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {g.clusters.length} cluster{g.clusters.length !== 1 ? 's' : ''}: {g.clusters.slice(0, 3).join(', ')}{g.clusters.length > 3 ? ` +${g.clusters.length - 3} more` : ''}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setGroupPickerWorkload(null)}
              className="mt-4 w-full px-4 py-2 text-sm rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
