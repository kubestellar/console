import type { ReactNode } from 'react'
import type { StatBlockValue } from '../../ui/StatsOverview'
import { StatsOverview } from '../../ui/StatsOverview'
import { DashboardHeader } from '../../shared/DashboardHeader'
import { CardRecommendations } from '../CardRecommendations'
import { MissionSuggestions } from '../MissionSuggestions'
import { DashboardHealthIndicator } from '../DashboardHealthIndicator'

interface CustomDashboardToolbarProps {
  title: string
  subtitle: string
  isFetching: boolean
  onRefresh: () => void
  autoRefresh: boolean
  onAutoRefreshChange: (value: boolean) => void
  lastUpdated: Date | null
  rightExtra: ReactNode
  getStatValue: (blockId: string) => StatBlockValue
  hasClusterData: boolean
  isStatsLoading: boolean
  statsCollapsedStorageKey: string
  currentCardTypes: string[]
  onAddRecommendedCard: (cardType: string, config?: Record<string, unknown>) => void
}

export function CustomDashboardToolbar({
  title,
  subtitle,
  isFetching,
  onRefresh,
  autoRefresh,
  onAutoRefreshChange,
  lastUpdated,
  rightExtra,
  getStatValue,
  hasClusterData,
  isStatsLoading,
  statsCollapsedStorageKey,
  currentCardTypes,
  onAddRecommendedCard,
}: CustomDashboardToolbarProps) {
  return (
    <>
      <DashboardHeader
        title={title}
        subtitle={subtitle}
        isFetching={isFetching}
        onRefresh={onRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={onAutoRefreshChange}
        lastUpdated={lastUpdated}
        showTimestamp={false}
        afterTitle={<DashboardHealthIndicator />}
        rightExtra={rightExtra}
      />

      <StatsOverview
        dashboardType="dashboard"
        getStatValue={getStatValue}
        hasData={hasClusterData}
        isLoading={isStatsLoading}
        lastUpdated={lastUpdated}
        collapsedStorageKey={statsCollapsedStorageKey}
      />

      <CardRecommendations
        currentCardTypes={currentCardTypes}
        onAddCard={onAddRecommendedCard}
      />

      <MissionSuggestions />
    </>
  )
}
