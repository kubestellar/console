import { useTranslation } from 'react-i18next'
import {
  Plus,
  LayoutDashboard } from 'lucide-react'
import { SortableGpuCard } from './SortableGpuCard'
import type { GpuDashCard } from './SortableGpuCard'
import {
  DndContext,
  closestCenter,
  type DragEndEvent } from '@dnd-kit/core'
import type { SensorDescriptor, SensorOptions } from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy } from '@dnd-kit/sortable'
import { useClusters } from '../../hooks/useMCP'
import { StatusIndicator } from '../charts/StatusIndicator'

export interface GPUDashboardTabProps {
  dashboardCards: GpuDashCard[]
  dashCardIds: string[]
  gpuDashSensors: SensorDescriptor<SensorOptions>[]
  gpuLiveMode: boolean
  isRefreshingDashboard: boolean
  onDashDragEnd: (event: DragEndEvent) => void
  onRemoveDashboardCard: (index: number) => void
  onDashCardWidthChange: (index: number, newWidth: number) => void
  onTriggerRefresh: () => void
  onShowAddCardModal: () => void
}

export function GPUDashboardTab({
  dashboardCards,
  dashCardIds,
  gpuDashSensors,
  gpuLiveMode,
  isRefreshingDashboard,
  onDashDragEnd,
  onRemoveDashboardCard,
  onDashCardWidthChange,
  onTriggerRefresh,
  onShowAddCardModal }: GPUDashboardTabProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: clusters } = useClusters()

  const clusterHealth = (() => {
    const all = clusters || []
    const connected = all.filter(c => c.reachable !== false)
    const disconnected = all.filter(c => c.reachable === false)
    return { total: all.length, connected: connected.length, disconnected: disconnected.length }
  })()

  return (
    <div className="space-y-4">
      {/* Cluster health summary */}
      {clusterHealth.total > 0 && (
        <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-secondary/30 border border-border">
          <span className="text-sm font-medium text-foreground">Cluster Health</span>
          <div className="flex items-center gap-1.5">
            <StatusIndicator status="healthy" size="sm" />
            <span className="text-sm text-foreground">{clusterHealth.connected} connected</span>
          </div>
          {clusterHealth.disconnected > 0 && (
            <div className="flex items-center gap-1.5">
              <StatusIndicator status="error" size="sm" />
              <span className="text-sm text-red-400">{clusterHealth.disconnected} disconnected</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('gpuReservations.dashboard.customizable')}
        </p>
        <button
          onClick={onShowAddCardModal}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('gpuReservations.dashboard.addCard')}
        </button>
      </div>
      <DndContext
        sensors={gpuDashSensors}
        collisionDetection={closestCenter}
        onDragEnd={onDashDragEnd}
      >
        <SortableContext items={dashCardIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-12 gap-2">
            {dashboardCards.map((card, index) => (
              <SortableGpuCard
                key={dashCardIds[index]}
                id={dashCardIds[index]}
                card={card}
                index={index}
                forceLive={gpuLiveMode}
                onRemove={() => onRemoveDashboardCard(index)}
                onWidthChange={(newWidth) => onDashCardWidthChange(index, newWidth)}
                onRefresh={onTriggerRefresh}
                isRefreshing={isRefreshingDashboard}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {dashboardCards.length === 0 && (
        <div className="p-12 rounded-lg bg-card/50 border border-border text-center">
          <LayoutDashboard className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">{t('gpuReservations.dashboard.noCardsYet')}</p>
          <button
            onClick={onShowAddCardModal}
            className="mt-3 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600 transition-colors"
          >
            {t('gpuReservations.dashboard.addFirstCard')}
          </button>
        </div>
      )}
    </div>
  )
}
