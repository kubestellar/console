/**
 * ModalSections - Reusable section components for modals
 *
 * Barrel export re-exporting components from focused sub-modules.
 *
 * @example
 * ```tsx
 * <KeyValueSection items={[
 *   { label: 'Name', value: pod.name },
 *   { label: 'Namespace', value: pod.namespace },
 *   { label: 'Status', value: pod.status, render: 'status' },
 * ]} />
 *
 * <TableSection
 *   data={containers}
 *   columns={[
 *     { key: 'name', header: 'Name' },
 *     { key: 'image', header: 'Image' },
 *     { key: 'status', header: 'Status', render: 'status' },
 *   ]}
 * />
 * ```
 */

// Re-export KeyValueSection and types
export { KeyValueSection, type KeyValueItem, type KeyValueSectionProps } from './KeyValueSection'

// Re-export TableSection and types
export { TableSection, type TableColumn, type TableSectionProps } from './TableSection'

// Re-export UtilitySections and types
export {
  CollapsibleSection,
  AlertSection,
  EmptySection,
  LoadingSection,
  BadgesSection,
  QuickActionsSection,
  type CollapsibleSectionProps,
  type AlertSectionProps,
  type EmptySectionProps,
  type LoadingSectionProps,
  type Badge,
  type BadgesSectionProps,
  type QuickAction,
  type QuickActionsSectionProps,
} from './UtilitySections'
