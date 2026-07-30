import { useMemo, useState } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { ClusterInfo } from '../../../hooks/useMCP'

const DRAG_ACTIVATION_DISTANCE_PX = 8

export function useResourcesDrillDown(
  initialClusters: ClusterInfo[] | undefined
) {
  const [clusterOrder, setClusterOrder] = useState<string[]>([])
  const clusters = useMemo(() => {
    const availableClusters = initialClusters || []
    if (clusterOrder.length === 0) {
      return [...availableClusters].sort((a, b) => a.name.localeCompare(b.name))
    }

    const orderMap = new Map(clusterOrder.map((name, index) => [name, index]))
    return [...availableClusters].sort((a, b) => {
      const aOrder = orderMap.get(a.name)
      const bOrder = orderMap.get(b.name)
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder
      if (aOrder !== undefined) return -1
      if (bOrder !== undefined) return 1
      return a.name.localeCompare(b.name)
    })
  }, [initialClusters, clusterOrder])

  const clusterNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    ;(clusters || []).forEach((cluster) => {
      map[cluster.name] = cluster.name
      ;(cluster.aliases || []).forEach((alias) => {
        map[alias] = cluster.name
      })
    })
    return map
  }, [clusters])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX }
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = (clusters || []).findIndex(
        (cluster) => cluster.name === active.id
      )
      const newIndex = (clusters || []).findIndex(
        (cluster) => cluster.name === over.id
      )
      setClusterOrder(
        arrayMove(
          (clusters || []).map((cluster) => cluster.name),
          oldIndex,
          newIndex
        )
      )
    }
  }

  return { clusters, clusterNameMap, sensors, handleDragEnd }
}
