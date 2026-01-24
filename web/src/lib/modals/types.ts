/**
 * Modal Types - Type definitions for YAML-based Modal Builder
 *
 * Future: modals will be defined declaratively in YAML like:
 *
 * ```yaml
 * kind: Pod
 * title: Pod Details
 * size: lg
 * icon: Box
 *
 * keyboard:
 *   escape: close
 *   backspace: back
 *
 * sections:
 *   - type: badges
 *     config:
 *       badges: [cluster, namespace, status]
 *
 * tabs:
 *   - id: overview
 *     label: Overview
 *     icon: Info
 *     sections:
 *       - type: key-value
 *         fields:
 *           - { key: name, label: Name }
 *           - { key: namespace, label: Namespace }
 *           - { key: status, label: Status, render: statusBadge }
 *
 *   - id: containers
 *     label: Containers
 *     icon: Box
 *     sections:
 *       - type: container-list
 *
 *   - id: events
 *     label: Events
 *     icon: Activity
 *     badge: eventCount
 *     sections:
 *       - type: event-stream
 *
 * actions:
 *   - id: diagnose
 *     icon: Stethoscope
 *     label: Diagnose
 *     type: ai
 *     mission: pod-health-check
 *
 *   - id: logs
 *     icon: FileText
 *     label: View Logs
 *     type: navigate
 *     target: logs
 * ```
 */

import { ComponentType, ReactNode } from 'react'

// ============================================================================
// Core Modal Definition Types
// ============================================================================

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

/**
 * Complete modal definition - future YAML format
 */
export interface ModalDefinition {
  /** Resource kind this modal is for */
  kind: string
  /** Modal title (can use {name} placeholder) */
  title: string
  /** Icon name from lucide-react */
  icon: string
  /** Modal size */
  size: ModalSize
  /** Keyboard shortcuts */
  keyboard?: ModalKeyboardConfig
  /** Header sections (badges, breadcrumbs) */
  headerSections?: ModalSectionDefinition[]
  /** Main content tabs */
  tabs?: ModalTabDefinition[]
  /** Actions (AI, kubectl, navigate) */
  actions?: ModalActionDefinition[]
  /** Footer configuration */
  footer?: ModalFooterConfig
  /** Related resource kinds for navigation */
  relatedKinds?: {
    parents: string[]
    children: string[]
    references: string[]
  }
}

export interface ModalKeyboardConfig {
  /** Action when Escape is pressed */
  escape?: 'close' | 'none'
  /** Action when Backspace is pressed */
  backspace?: 'back' | 'close' | 'none'
  /** Custom keyboard shortcuts */
  shortcuts?: Array<{
    key: string
    modifiers?: Array<'ctrl' | 'alt' | 'shift' | 'meta'>
    action: string
  }>
}

export interface ModalFooterConfig {
  /** Show keyboard hints */
  showKeyboardHints?: boolean
  /** Custom actions */
  actions?: ModalActionDefinition[]
}

// ============================================================================
// Tab Definitions
// ============================================================================

export interface ModalTabDefinition {
  /** Unique tab ID */
  id: string
  /** Tab label */
  label: string
  /** Icon name from lucide-react */
  icon?: string
  /** Badge value (can be field reference like 'eventCount') */
  badge?: string | number
  /** Sections to render in this tab */
  sections: ModalSectionDefinition[]
}

// ============================================================================
// Section Definitions
// ============================================================================

export type ModalSectionType =
  | 'badges'
  | 'breadcrumbs'
  | 'key-value'
  | 'container-list'
  | 'event-stream'
  | 'log-viewer'
  | 'yaml-viewer'
  | 'related-resources'
  | 'metrics-chart'
  | 'table'
  | 'ai-actions'
  | 'quick-actions'
  | 'custom'

export interface ModalSectionDefinition {
  /** Section type */
  type: ModalSectionType
  /** Section title (optional) */
  title?: string
  /** Section-specific configuration */
  config?: Record<string, unknown>
  /** For key-value sections */
  fields?: ModalFieldDefinition[]
  /** For custom sections */
  component?: string
}

export interface ModalFieldDefinition {
  /** Field key in data object */
  key: string
  /** Display label */
  label: string
  /** Render type */
  render?: 'text' | 'status' | 'timestamp' | 'json' | 'link' | 'badge' | 'code' | 'copyable'
  /** Link target for navigation */
  linkTo?: string
  /** Whether field is copyable */
  copyable?: boolean
  /** Tooltip text */
  tooltip?: string
}

// ============================================================================
// Action Definitions
// ============================================================================

export type ModalActionType = 'ai' | 'kubectl' | 'navigate' | 'callback' | 'custom'

export interface ModalActionDefinition {
  /** Unique action ID */
  id: string
  /** Display label */
  label: string
  /** Icon name from lucide-react */
  icon: string
  /** Action type */
  type: ModalActionType
  /** Description for tooltip */
  description?: string
  /** For AI actions: mission template ID */
  mission?: string
  /** For kubectl actions: command template */
  command?: string
  /** For navigate actions: target view/modal */
  target?: string
  /** Action variant */
  variant?: 'default' | 'primary' | 'danger' | 'warning'
  /** Whether action is disabled */
  disabled?: boolean
  /** Disabled reason */
  disabledReason?: string
}

// ============================================================================
// Runtime Props
// ============================================================================

export interface ModalRuntimeProps {
  /** Modal definition (from YAML or registry) */
  definition: ModalDefinition
  /** Whether modal is open */
  isOpen: boolean
  /** Close handler */
  onClose: () => void
  /** Resource data */
  data: Record<string, unknown>
  /** Back handler (for navigation) */
  onBack?: () => void
  /** Navigate handler */
  onNavigate?: (target: NavigationTarget) => void
  /** Action handler */
  onAction?: (action: ModalActionDefinition) => void
  /** Custom section renderers */
  sectionRenderers?: Record<string, ComponentType<SectionRendererProps>>
  /** Extra content to render */
  children?: ReactNode
}

export interface SectionRendererProps {
  section: ModalSectionDefinition
  data: Record<string, unknown>
  onNavigate?: (target: NavigationTarget) => void
}

// ============================================================================
// Navigation Types
// ============================================================================

export interface NavigationTarget {
  kind: string
  name: string
  namespace?: string
  cluster: string
  data?: Record<string, unknown>
}

export interface Breadcrumb {
  id: string
  label: string
  kind: string
  icon?: ComponentType<{ className?: string }>
  onClick?: () => void
}

export interface NavigationStack {
  items: NavigationTarget[]
  currentIndex: number
}

// ============================================================================
// Base Modal Props
// ============================================================================

export interface BaseModalProps {
  /** Whether modal is open */
  isOpen: boolean
  /** Close handler */
  onClose: () => void
  /** Modal size */
  size?: ModalSize
  /** Additional className for modal container */
  className?: string
  /** Children to render */
  children: ReactNode
  /** Whether to close on backdrop click */
  closeOnBackdrop?: boolean
  /** Whether to close on Escape key */
  closeOnEscape?: boolean
}

export interface ModalHeaderProps {
  /** Title */
  title: string
  /** Description below title */
  description?: string
  /** Icon component */
  icon?: ComponentType<{ className?: string }>
  /** Badges to show */
  badges?: ReactNode
  /** Close handler */
  onClose?: () => void
  /** Back handler */
  onBack?: () => void
  /** Whether to show back button */
  showBack?: boolean
  /** Extra content (right side) */
  extra?: ReactNode
  /** Children (below title) */
  children?: ReactNode
}

export interface ModalContentProps {
  /** Children to render */
  children: ReactNode
  /** Whether to remove padding */
  noPadding?: boolean
  /** Whether content is scrollable */
  scrollable?: boolean
  /** Additional className */
  className?: string
}

export interface ModalFooterProps {
  /** Children to render */
  children?: ReactNode
  /** Whether to show keyboard hints */
  showKeyboardHints?: boolean
  /** Custom keyboard hints */
  keyboardHints?: Array<{ key: string; label: string }>
  /** Additional className */
  className?: string
}

export interface ModalTabsProps {
  /** Tab definitions */
  tabs: Array<{
    id: string
    label: string
    icon?: ComponentType<{ className?: string }>
    badge?: string | number
  }>
  /** Currently active tab ID */
  activeTab: string
  /** Tab change handler */
  onTabChange: (tabId: string) => void
  /** Additional className */
  className?: string
}

// ============================================================================
// Hook Types
// ============================================================================

export interface UseModalNavigationOptions {
  /** Whether modal is open */
  isOpen: boolean
  /** Close handler */
  onClose: () => void
  /** Back handler */
  onBack?: () => void
  /** Whether to enable Escape to close */
  enableEscape?: boolean
  /** Whether to enable Backspace to go back */
  enableBackspace?: boolean
  /** Whether to disable body scroll when open */
  disableBodyScroll?: boolean
}

export interface UseModalNavigationResult {
  /** Handler for keyboard events */
  handleKeyDown: (event: KeyboardEvent) => void
}

// ============================================================================
// Status Helpers
// ============================================================================

export interface StatusColors {
  bg: string
  text: string
  border: string
}

export const STATUS_COLORS: Record<string, StatusColors> = {
  // Success states
  Running: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  Succeeded: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  Healthy: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  Ready: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  Active: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  Bound: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },

  // Warning states
  Pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  Progressing: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  Waiting: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  Unknown: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },

  // Error states
  Failed: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  Error: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  CrashLoopBackOff: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  Unhealthy: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },

  // Info states
  Terminated: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
  Completed: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
}

export function getStatusColors(status: string): StatusColors {
  return STATUS_COLORS[status] || { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' }
}
