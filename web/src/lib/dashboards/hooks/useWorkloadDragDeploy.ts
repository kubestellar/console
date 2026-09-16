/**
 * Workload drag-to-deploy behavior for DashboardRuntime.
 *
 * Wraps the base card-reorder DnD handlers with support for dragging a
 * workload card onto a cluster group to trigger deployment. Split out of
 * DashboardRuntime.tsx (issue 23019) since it's a self-contained piece of
 * stateful logic.
 */

import { useState } from 'react'
import { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { DraggedWorkload } from '../../../components/cards/ClusterDropZone'
import { useDeployWorkload } from '../../../hooks/useWorkloads'
import { useToast } from '../../../components/ui/Toast'

interface BaseDndHandlers {
  handleDragStart: (event: DragStartEvent) => void
  handleDragEnd: (event: DragEndEvent) => void
}

export function useWorkloadDragDeploy(baseDnd: BaseDndHandlers) {
  const [draggedWorkload, setDraggedWorkload] = useState<DraggedWorkload | null>(null)
  const deployWorkload = useDeployWorkload()
  const { showToast } = useToast()

  const handleDeployWorkload = (
    workload: { name: string; namespace: string; sourceCluster: string },
    targetCluster: string
  ) => {
    deployWorkload.mutate({
      workloadName: workload.name,
      namespace: workload.namespace,
      sourceCluster: workload.sourceCluster,
      targetClusters: [targetCluster] }, {
      onSuccess: () => {
        showToast(`Deployed ${workload.name} to ${targetCluster}`, 'success')
      },
      onError: (error: Error) => {
        showToast(`Failed to deploy: ${error.message}`, 'error')
      } }).catch(console.error)
  }

  // Extended drag handlers to support workload-to-cluster deployment
  const handleDragStart = (event: DragStartEvent) => {
    // First call the original handler for card ordering
    baseDnd.handleDragStart(event)

    // Check if this is a workload being dragged
    const data = event.active.data.current
    if (data?.type === 'workload' && data?.workload) {
      setDraggedWorkload(data.workload)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    // First call the original handler for card ordering
    baseDnd.handleDragEnd(event)

    // Check if workload was dropped on a cluster
    const activeData = event.active.data.current
    const overData = event.over?.data.current

    if (activeData?.type === 'workload' && overData?.type === 'cluster') {
      handleDeployWorkload(activeData.workload, overData.cluster)
    }

    // Clear dragged workload state
    setDraggedWorkload(null)
  }

  return { draggedWorkload, handleDragStart, handleDragEnd, handleDeployWorkload }
}
