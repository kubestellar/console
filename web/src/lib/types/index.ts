/**
 * Centralized Type Definitions
 *
 * This file re-exports all types from the YAML-based builder libraries.
 * Import from here for consistent type access across the codebase.
 *
 * @example
 * ```typescript
 * import {
 *   CardDefinition,
 *   DashboardDefinition,
 *   ModalDefinition,
 *   StatsDefinition,
 * } from '@/lib/types'
 * ```
 */

// ============================================================================
// Card Types
// ============================================================================

export type {
  CardDefinition,
  CardVisualization,
  CardDataSource,
  CardFilterDefinition,
  CardColumnDefinition,
  CardDrillDownConfig,
  CardEmptyState,
  CardRuntimeProps,
  FilterConfig,
  SortConfig,
  CardDataConfig,
  SortDirection,
  SortOption,
  UseCardFiltersResult,
  UseCardSortResult,
  UseCardDataResult,
  CardSkeletonProps,
  CardEmptyStateProps,
  CardErrorStateProps,
  CardSearchInputProps,
  CardClusterFilterProps,
  CardClusterIndicatorProps,
  CardListItemProps,
  CardHeaderProps,
  CardStatusBadgeProps,
  FilterChip,
  CardFilterChipsProps,
} from '../cards'

// ============================================================================
// Dashboard Types
// ============================================================================

export type {
  DashboardDefinition,
  DashboardStatsConfig,
  DashboardCardPlacement,
  DashboardFeatures,
  DashboardDataSource,
  DashboardSection,
  DashboardCard,
  DashboardContextValue,
  NewCardInput,
  DashboardTemplate,
  DashboardRuntimeProps,
  UseDashboardDnDResult,
  UseDashboardCardsResult,
  UseDashboardAutoRefreshResult,
  UseDashboardModalsResult,
  UseDashboardShowCardsResult,
  UseDashboardOptions,
  UseDashboardResult,
  SortableDashboardCardProps,
  DragPreviewCardProps,
  DashboardHeaderProps,
  DashboardCardsSectionProps,
  DashboardEmptyCardsProps,
  DashboardCardsGridProps,
} from '../dashboards'

// ============================================================================
// Modal Types
// ============================================================================

export type {
  ModalDefinition,
  ModalSize,
  ModalKeyboardConfig,
  ModalFooterConfig,
  ModalTabDefinition,
  ModalSectionType,
  ModalSectionDefinition,
  ModalFieldDefinition,
  ModalActionType,
  ModalActionDefinition,
  ModalRuntimeProps,
  SectionRendererProps,
  NavigationTarget,
  Breadcrumb,
  NavigationStack,
  BaseModalProps,
  ModalHeaderProps,
  ModalContentProps,
  ModalFooterProps,
  ModalTabsProps,
  UseModalNavigationOptions,
  UseModalNavigationResult,
  UseModalOptions,
  StatusColors,
  KeyValueItem,
  KeyValueSectionProps,
  TableColumn,
  TableSectionProps,
  CollapsibleSectionProps,
  AlertSectionProps,
  EmptySectionProps,
  LoadingSectionProps,
  Badge,
  BadgesSectionProps,
  QuickAction,
  QuickActionsSectionProps,
} from '../modals'

// ============================================================================
// Stats Types
// ============================================================================

export type {
  StatsDefinition,
  StatBlockDefinition,
  StatBlockColor,
  StatBlockValueSource,
  StatBlockAction,
  StatBlockValue,
  StatValueGetter,
  StatsRuntimeProps,
  StatBlockConfig,
  UseStatsConfigResult,
} from '../stats'
