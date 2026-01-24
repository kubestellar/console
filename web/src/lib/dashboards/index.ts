// Dashboard Runtime (for YAML-based builder)
export {
  DashboardRuntime,
  registerDashboard,
  getDashboardDefinition,
  getAllDashboardDefinitions,
  registerStatsValueGetter,
  parseDashboardYAML,
  type DashboardRuntimeProps,
} from './DashboardRuntime'

// Dashboard Hooks
export {
  useDashboardDnD,
  useDashboardCards,
  useDashboardAutoRefresh,
  useDashboardModals,
  useDashboardShowCards,
  useDashboard,
  type UseDashboardDnDResult,
  type UseDashboardCardsResult,
  type UseDashboardAutoRefreshResult,
  type UseDashboardModalsResult,
  type UseDashboardShowCardsResult,
  type UseDashboardOptions,
  type UseDashboardResult,
} from './dashboardHooks'

// Dashboard UI Components
export {
  SortableDashboardCard,
  DragPreviewCard,
  DashboardHeader,
  DashboardCardsSection,
  DashboardEmptyCards,
  DashboardCardsGrid,
  type SortableDashboardCardProps,
  type DragPreviewCardProps,
  type DashboardHeaderProps,
  type DashboardCardsSectionProps,
  type DashboardEmptyCardsProps,
  type DashboardCardsGridProps,
} from './DashboardComponents'

// Dashboard Types
export * from './types'
