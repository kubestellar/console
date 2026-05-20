import { memo, useState, type CSSProperties } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { AlertTriangle, GripVertical, Loader2, Check, Minus } from 'lucide-react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ClusterBadge } from '../ui/ClusterBadge'
import { cn } from '../../lib/cn'
import { useScaleWorkload } from '../../hooks/useWorkloads'
import { BaseModal } from '../../lib/modals/BaseModal'
import { Button } from '../ui/Button'
import {
  PROTECTED_NAMESPACES,
  SCALE_SUCCESS_RESET_MS,
  ZERO_REPLICAS,
  getStatusIconClassName,
  getTypeIconComponent,
  scaleViaAgent,
  statusColors,
  type Workload,
  type WorkloadStatus,
  type WorkloadType,
} from './WorkloadDeployment.utils'

// useCardLoadingState is handled by the parent WorkloadDeployment card.

interface StatusIconProps {
  status: WorkloadStatus
}

function StatusIcon({ status }: StatusIconProps) {
  const Icon = getStatusIconClassName(status)
  const className = status === 'Running'
    ? 'h-4 w-4 text-green-500'
    : status === 'Degraded'
      ? 'h-4 w-4 text-yellow-500'
      : status === 'Pending'
        ? 'h-4 w-4 text-blue-500'
        : status === 'Failed'
          ? 'h-4 w-4 text-red-500'
          : 'h-4 w-4 text-muted-foreground'

  return <Icon className={className} />
}

interface TypeIconProps {
  type: WorkloadType
}

function TypeIcon({ type }: TypeIconProps) {
  const Icon = getTypeIconComponent(type)
  const className = type === 'Deployment'
    ? 'h-4 w-4 text-blue-500'
    : type === 'StatefulSet'
      ? 'h-4 w-4 text-purple-500'
      : type === 'DaemonSet'
        ? 'h-4 w-4 text-orange-500'
        : type === 'Job' || type === 'CronJob'
          ? 'h-4 w-4 text-green-500'
          : 'h-4 w-4 text-muted-foreground'

  return <Icon className={className} />
}

interface ScaleToZeroConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  workloadName: string
  namespace: string
}

function ScaleToZeroConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  workloadName,
  namespace,
}: ScaleToZeroConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('workloads.scaleToZero.title')}
        description={t('workloads.scaleToZero.description')}
        icon={AlertTriangle}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-sm text-yellow-300">
            {t('workloads.scaleToZero.warning', { workload: workloadName, namespace })}
          </p>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t('workloads.scaleToZero.impact')}</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>{t('workloads.scaleToZero.impactItem1')}</li>
            <li>{t('workloads.scaleToZero.impactItem2')}</li>
            <li>{t('workloads.scaleToZero.impactItem3')}</li>
          </ul>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          <Button variant="ghost" size="lg" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" size="lg" onClick={onConfirm}>
            {t('workloads.scaleToZero.confirm')}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

interface DraggableWorkloadItemProps {
  workload: Workload
  isSelected: boolean
  onSelect: () => void
  onScaled?: () => void
}

function DraggableWorkloadItemComponent({ workload, isSelected, onSelect, onScaled }: DraggableWorkloadItemProps) {
  const [replicaDraft, setReplicaDraft] = useState({ baseline: workload.replicas, desired: workload.replicas })
  const [isScaling, setIsScaling] = useState(false)
  const [scaleError, setScaleError] = useState<string | null>(null)
  const [scaleSuccess, setScaleSuccess] = useState(false)
  const [showScaleToZeroDialog, setShowScaleToZeroDialog] = useState(false)
  const { mutate: scaleWorkload } = useScaleWorkload()
  const { t } = useTranslation()
  const isProtectedNamespace = PROTECTED_NAMESPACES.has(workload.namespace.toLowerCase())
  const desiredReplicas = !isScaling && replicaDraft.baseline !== workload.replicas
    ? workload.replicas
    : replicaDraft.desired

  const setDesiredReplicas = (nextDesiredReplicas: number | ((currentReplicas: number) => number)) => {
    const resolvedDesiredReplicas = typeof nextDesiredReplicas === 'function'
      ? nextDesiredReplicas(desiredReplicas)
      : nextDesiredReplicas

    setReplicaDraft({ baseline: workload.replicas, desired: resolvedDesiredReplicas })
  }

  const performScale = async () => {
    if (isProtectedNamespace) {
      setScaleError(t('workloads.protectedNamespace'))
      return
    }

    if (desiredReplicas === workload.replicas || isScaling) {
      return
    }

    setIsScaling(true)
    setScaleError(null)
    setScaleSuccess(false)

    try {
      await scaleWorkload({
        workloadName: workload.name,
        namespace: workload.namespace,
        targetClusters: workload.targetClusters || [],
        replicas: desiredReplicas,
      })
      setScaleSuccess(true)
      onScaled?.()
      setTimeout(() => setScaleSuccess(false), SCALE_SUCCESS_RESET_MS)
    } catch {
      try {
        const clusters = (workload.targetClusters || []).length > 0 ? workload.targetClusters : ['unknown']
        const results = await Promise.all(
          (clusters || []).map(async cluster => {
            const result = await scaleViaAgent(cluster, workload.namespace, workload.name, desiredReplicas)
            return { cluster, ...result }
          }),
        )
        const failures = (results || []).filter(result => !result.success)
        if (failures.length === 0) {
          setScaleSuccess(true)
          onScaled?.()
          setTimeout(() => setScaleSuccess(false), SCALE_SUCCESS_RESET_MS)
        } else {
          setScaleError((failures || []).map(result => `${result.cluster}: ${result.message || 'Scale failed'}`).join('; '))
        }
      } catch (agentErr: unknown) {
        if (
          agentErr &&
          typeof agentErr === 'object' &&
          'name' in agentErr &&
          (agentErr as { name?: unknown }).name === 'AbortError'
        ) {
          setScaleError('Scaling request was aborted')
        } else if (
          agentErr &&
          typeof agentErr === 'object' &&
          'message' in agentErr &&
          typeof (agentErr as { message?: unknown }).message === 'string'
        ) {
          setScaleError((agentErr as { message: string }).message)
        } else {
          setScaleError('Scale failed')
        }
      }
    } finally {
      setIsScaling(false)
    }
  }

  const handleApplyScale = async () => {
    if (desiredReplicas === workload.replicas || isScaling) {
      return
    }

    if (desiredReplicas === ZERO_REPLICAS) {
      setShowScaleToZeroDialog(true)
      return
    }

    await performScale()
  }

  const handleConfirmScaleToZero = async () => {
    setShowScaleToZeroDialog(false)
    await performScale()
  }

  const sourceCluster = (workload.targetClusters || [])[0] || 'unknown'

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `workload-${sourceCluster}-${workload.namespace}-${workload.name}`,
    data: {
      type: 'workload',
      workload: {
        name: workload.name,
        namespace: workload.namespace,
        type: workload.type,
        sourceCluster,
        currentClusters: workload.targetClusters || [],
      },
    },
  })

  const style: CSSProperties = isDragging ? { opacity: 0.3, pointerEvents: 'none' } : {}

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-dnd-workload="true"
      className={cn(
        'p-3 transition-colors cursor-grab active:cursor-grabbing',
        !isDragging && 'hover:bg-gray-50 dark:hover:bg-secondary/50',
        isSelected && !isDragging && 'bg-blue-50 dark:bg-blue-900/20',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <TypeIcon type={workload.type} />
          <div
            className="min-w-0 cursor-pointer"
            onClick={event => {
              event.stopPropagation()
              onSelect()
            }}
            role="button"
            tabIndex={0}
            aria-label={`Select workload ${workload.name}`}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect()
              }
            }}
          >
            <div className="flex items-center gap-2 cursor-pointer">
              <span className="font-medium text-sm text-gray-900 dark:text-foreground truncate">
                {workload.name}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[workload.status]}`}>
                {workload.status}
              </span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <span className="truncate">{workload.namespace}</span>
              <span className="text-muted-foreground">|</span>
              <span>{workload.type}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs shrink-0">
          <StatusIcon status={workload.status} />
          <span className="text-muted-foreground">
            {workload.readyReplicas}/{workload.replicas}
          </span>
        </div>
      </div>

      <div className="mt-1.5 ml-10 text-xs text-muted-foreground truncate font-mono">
        {workload.image}
      </div>

      <div className="mt-2 ml-10 flex flex-wrap gap-1">
        {(workload.deployments || []).map(deployment => (
          <div
            key={deployment.cluster}
            className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-muted px-1.5 py-0.5 rounded"
          >
            <StatusIcon status={deployment.status} />
            <ClusterBadge cluster={deployment.cluster} size="sm" />
            <span className="text-muted-foreground">
              {deployment.readyReplicas}/{deployment.replicas}
            </span>
          </div>
        ))}
      </div>

      {isSelected && !isDragging && (
        <div className="mt-3 pt-3 ml-10 border-t border-gray-200 dark:border-border space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-y-2">
            <span className="text-xs text-muted-foreground">Target Clusters</span>
            <div className="flex gap-1">
              {(workload.targetClusters || []).map(cluster => (
                <ClusterBadge key={cluster} cluster={cluster} size="sm" />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-y-2">
            <span className="text-xs text-muted-foreground">{t('common.labels')}</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {Object.entries(workload.labels || {}).map(([key, value]) => (
                <span
                  key={key}
                  className="text-xs bg-gray-100 dark:bg-muted px-1.5 py-0.5 rounded font-mono"
                >
                  {key}={value}
                </span>
              ))}
            </div>
          </div>
          {(workload.type === 'Deployment' || workload.type === 'StatefulSet') && (
            <div className="mt-2" onPointerDown={event => event.stopPropagation()}>
              {isProtectedNamespace ? (
                <p className="text-xs text-yellow-400/70 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t('workloads.protectedNamespace')}
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground mr-1">Replicas</span>
                    <button
                      onClick={() => setDesiredReplicas(currentReplicas => Math.max(0, currentReplicas - 1))}
                      disabled={isScaling || desiredReplicas <= 0}
                      className={cn(
                        'w-7 h-7 flex items-center justify-center rounded transition-colors',
                        isScaling || desiredReplicas <= 0
                          ? 'bg-secondary/30 text-muted-foreground cursor-not-allowed'
                          : 'bg-secondary hover:bg-secondary/80 text-foreground',
                      )}
                      aria-label="Decrease replicas"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={desiredReplicas}
                      onChange={event => setDesiredReplicas(Math.max(0, Math.min(100, parseInt(event.target.value, 10) || 0)))}
                      disabled={isScaling}
                      className="w-12 h-7 text-center text-xs rounded border border-border bg-secondary/30 focus:outline-hidden focus:ring-1 focus:ring-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                    />
                    <button
                      onClick={() => setDesiredReplicas(currentReplicas => Math.min(100, currentReplicas + 1))}
                      disabled={isScaling || desiredReplicas >= 100}
                      className={cn(
                        'w-7 h-7 flex items-center justify-center rounded transition-colors',
                        isScaling || desiredReplicas >= 100
                          ? 'bg-secondary/30 text-muted-foreground cursor-not-allowed'
                          : 'bg-secondary hover:bg-secondary/80 text-foreground',
                      )}
                      aria-label="Increase replicas"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    {desiredReplicas !== workload.replicas && !isScaling && (
                      <button
                        onClick={handleApplyScale}
                        className="ml-1 px-2 h-7 text-xs rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors flex items-center gap-1"
                      >
                        Apply
                        <span className="text-2xs text-blue-400/70">
                          {workload.replicas} → {desiredReplicas}
                        </span>
                      </button>
                    )}
                    {isScaling && <Loader2 className="h-4 w-4 animate-spin text-blue-400 ml-1" />}
                    {scaleSuccess && <Check className="h-4 w-4 text-green-400 ml-1" />}
                  </div>
                  {scaleError && <p className="text-2xs text-red-400 mt-1">{scaleError}</p>}
                </>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground italic mt-1">
            Drag workload to a cluster group to deploy
          </p>
        </div>
      )}

      <ScaleToZeroConfirmDialog
        isOpen={showScaleToZeroDialog}
        onClose={() => setShowScaleToZeroDialog(false)}
        onConfirm={handleConfirmScaleToZero}
        workloadName={workload.name}
        namespace={workload.namespace}
      />
    </div>
  )
}

export const DraggableWorkloadItem = memo(DraggableWorkloadItemComponent)
