// Modal Runtime (for YAML-based builder)
export {
  ModalRuntime,
  registerModal,
  getModalDefinition,
  getAllModalDefinitions,
  registerSectionRenderer,
  parseModalYAML,
} from './ModalRuntime'

// Base Modal (compound component)
export { BaseModal } from './BaseModal'

// Modal Hooks
export {
  useModalNavigation,
  useModalBackdropClose,
  useModalFocusTrap,
  useModal,
  type UseModalOptions,
} from './useModalNavigation'

// Modal Sections
export {
  KeyValueSection,
  TableSection,
  CollapsibleSection,
  AlertSection,
  EmptySection,
  LoadingSection,
  BadgesSection,
  QuickActionsSection,
  type KeyValueItem,
  type KeyValueSectionProps,
  type TableColumn,
  type TableSectionProps,
  type CollapsibleSectionProps,
  type AlertSectionProps,
  type EmptySectionProps,
  type LoadingSectionProps,
  type Badge,
  type BadgesSectionProps,
  type QuickAction,
  type QuickActionsSectionProps,
} from './ModalSections'

// Modal Types
export * from './types'
