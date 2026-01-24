/**
 * Shared Libraries for YAML-Based Builders
 *
 * This module provides the foundation for building dashboards, cards,
 * modals, and stats declaratively. Components can be defined in YAML
 * and rendered consistently using the runtime components.
 *
 * @example
 * ```typescript
 * import {
 *   CardRuntime,
 *   DashboardRuntime,
 *   ModalRuntime,
 *   StatsRuntime,
 *   registry,
 * } from '@/lib'
 *
 * // Register definitions
 * registry.cards.register(myCardDefinition)
 * registry.dashboards.register(myDashboardDefinition)
 *
 * // Use runtime components
 * <CardRuntime definition={cardDef} />
 * <DashboardRuntime definition={dashboardDef} data={data} />
 * ```
 */

// ============================================================================
// Card Library
// ============================================================================

export {
  // Runtime
  CardRuntime,
  registerCard,
  getCardDefinition,
  getAllCardDefinitions,
  registerDataHook,
  registerDrillAction,
  registerRenderer,
  parseCardYAML,
  // Hooks
  useCardFilters,
  useCardSort,
  useCardData,
  commonComparators,
  // Components
  CardSkeleton,
  CardEmptyState,
  CardErrorState,
  CardSearchInput,
  CardClusterFilter,
  CardClusterIndicator,
  CardListItem,
  CardHeader,
  CardStatusBadge,
  CardFilterChips,
} from './cards'

// ============================================================================
// Dashboard Library
// ============================================================================

export {
  // Runtime
  DashboardRuntime,
  registerDashboard,
  getDashboardDefinition,
  getAllDashboardDefinitions,
  registerStatsValueGetter,
  parseDashboardYAML,
  // Hooks
  useDashboardDnD,
  useDashboardCards,
  useDashboardAutoRefresh,
  useDashboardModals,
  useDashboardShowCards,
  useDashboard,
  // Components
  SortableDashboardCard,
  DragPreviewCard,
  DashboardHeader,
  DashboardCardsSection,
  DashboardEmptyCards,
  DashboardCardsGrid,
} from './dashboards'

// ============================================================================
// Modal Library
// ============================================================================

export {
  // Runtime
  ModalRuntime,
  registerModal,
  getModalDefinition,
  getAllModalDefinitions,
  registerSectionRenderer,
  parseModalYAML,
  // Base Modal
  BaseModal,
  // Hooks
  useModalNavigation,
  useModalBackdropClose,
  useModalFocusTrap,
  useModal,
  // Sections
  KeyValueSection,
  TableSection,
  CollapsibleSection,
  AlertSection,
  EmptySection,
  LoadingSection,
  BadgesSection,
  QuickActionsSection,
} from './modals'

// ============================================================================
// Stats Library
// ============================================================================

export {
  // Runtime
  StatsRuntime,
  registerStats,
  getStatsDefinition,
  getAllStatsDefinitions,
  registerStatValueGetter,
  parseStatsYAML,
  createStatBlock,
  createStatsDefinition,
  // Formatters
  formatStatNumber,
  formatBytes,
  formatPercent,
  formatCurrency,
  formatDuration,
  formatValue,
  // Constants
  COLOR_CLASSES,
  VALUE_COLORS,
} from './stats'

// ============================================================================
// Centralized Registry
// ============================================================================

export {
  registry,
  registerCards,
  registerDashboards,
  registerModals,
  registerAllStats,
  getRegistryCounts,
  listRegistered,
} from './registry'

// ============================================================================
// Types
// ============================================================================

export * from './types'
