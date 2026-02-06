/**
 * ModalRuntime - Renders modals from declarative definitions
 *
 * This is the foundation for the YAML-based Modal Builder.
 * Modals are defined declaratively and this runtime interprets
 * and renders them with consistent behavior.
 *
 * Future: definitions will be loaded from YAML files like:
 *
 * ```yaml
 * kind: Pod
 * title: Pod Details - {name}
 * size: lg
 * icon: Box
 *
 * keyboard:
 *   escape: close
 *   backspace: back
 *
 * tabs:
 *   - id: overview
 *     label: Overview
 *     icon: Info
 *     sections:
 *       - type: key-value
 *         fields:
 *           - { key: name, label: Name, copyable: true }
 *           - { key: namespace, label: Namespace }
 *           - { key: status, label: Status, render: status }
 *           - { key: nodeName, label: Node, linkTo: node }
 *
 *   - id: containers
 *     label: Containers
 *     icon: Box
 *     badge: containerCount
 *     sections:
 *       - type: table
 *         config:
 *           dataKey: containers
 *           columns:
 *             - { key: name, header: Name }
 *             - { key: image, header: Image }
 *             - { key: ready, header: Ready, render: status }
 *
 * actions:
 *   - id: diagnose
 *     icon: Stethoscope
 *     label: Diagnose
 *     type: ai
 *     mission: pod-health-check
 * ```
 */

import { useState, useMemo, useCallback, ComponentType } from 'react'
// NOTE: Wildcard import is required for dynamic icon resolution
// Modal definitions specify icon names as strings at runtime (e.g., "Server", "CheckCircle")
// The getIcon() helper function resolves these names dynamically via Icons[name]
// Tree-shaking is not applicable as icon names are determined at runtime, not build time
import * as Icons from 'lucide-react'
import { LucideIcon } from 'lucide-react'
import {
  ModalDefinition,
  ModalRuntimeProps,
  ModalSectionDefinition,
  ModalActionDefinition,
  SectionRendererProps,
  NavigationTarget,
} from './types'
import { BaseModal } from './BaseModal'
import { useModalNavigation } from './useModalNavigation'
import {
  KeyValueSection,
  TableSection,
  BadgesSection,
  KeyValueItem,
  TableColumn,
} from './ModalSections'

// ============================================================================
// Modal Registry
// ============================================================================

const modalRegistry = new Map<string, ModalDefinition>()

export function registerModal(definition: ModalDefinition) {
  modalRegistry.set(definition.kind, definition)
}

export function getModalDefinition(kind: string): ModalDefinition | undefined {
  return modalRegistry.get(kind)
}

export function getAllModalDefinitions(): ModalDefinition[] {
  return Array.from(modalRegistry.values())
}

// ============================================================================
// Section Renderer Registry
// ============================================================================

const sectionRendererRegistry = new Map<string, ComponentType<SectionRendererProps>>()

export function registerSectionRenderer(
  type: string,
  renderer: ComponentType<SectionRendererProps>
) {
  sectionRendererRegistry.set(type, renderer)
}

// ============================================================================
// Icon Resolver
// ============================================================================

function getIcon(name: string): LucideIcon {
  return (Icons as unknown as Record<string, LucideIcon>)[name] || Icons.HelpCircle
}

// ============================================================================
// Default Section Renderers
// ============================================================================

function renderKeyValueSection(
  section: ModalSectionDefinition,
  data: Record<string, unknown>,
  onNavigate?: (target: NavigationTarget) => void
) {
  const fields = section.fields || []
  const items: KeyValueItem[] = fields.map((field) => ({
    label: field.label,
    value: data[field.key] as string,
    render: field.render,
    copyable: field.copyable,
    linkTo: field.linkTo ? {
      kind: field.linkTo,
      name: String(data[field.key]),
      cluster: data.cluster as string,
      namespace: data.namespace as string | undefined,
    } : undefined,
  }))

  return (
    <KeyValueSection
      items={items}
      columns={(section.config?.columns as 1 | 2 | 3) || 2}
      onNavigate={onNavigate}
    />
  )
}

function renderTableSection(
  section: ModalSectionDefinition,
  data: Record<string, unknown>
) {
  const config = section.config || {}
  const dataKey = config.dataKey as string
  const tableData = (dataKey ? data[dataKey] : data) as Record<string, unknown>[]
  const columnDefs = config.columns as Array<{
    key: string
    header: string
    render?: string
    width?: number
    align?: 'left' | 'center' | 'right'
  }> || []

  const columns: TableColumn[] = columnDefs.map((col) => ({
    key: col.key,
    header: col.header,
    render: col.render as TableColumn['render'],
    width: col.width,
    align: col.align,
  }))

  return (
    <TableSection
      data={tableData || []}
      columns={columns}
      emptyMessage={config.emptyMessage as string}
      maxHeight={config.maxHeight as string}
    />
  )
}

function renderBadgesSection(
  section: ModalSectionDefinition,
  data: Record<string, unknown>
) {
  const config = section.config || {}
  const badgeKeys = config.badges as string[] || []

  const badges = badgeKeys.map((key) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    value: String(data[key] || '-'),
  }))

  return <BadgesSection badges={badges} />
}

function renderSection(
  section: ModalSectionDefinition,
  data: Record<string, unknown>,
  onNavigate?: (target: NavigationTarget) => void,
  customRenderers?: Record<string, ComponentType<SectionRendererProps>>
): React.ReactNode {
  // Check custom renderers first
  if (customRenderers?.[section.type]) {
    const CustomRenderer = customRenderers[section.type]
    return <CustomRenderer section={section} data={data} onNavigate={onNavigate} />
  }

  // Check registry
  const RegisteredRenderer = sectionRendererRegistry.get(section.type)
  if (RegisteredRenderer) {
    return <RegisteredRenderer section={section} data={data} onNavigate={onNavigate} />
  }

  // Built-in renderers
  switch (section.type) {
    case 'key-value':
      return renderKeyValueSection(section, data, onNavigate)

    case 'table':
      return renderTableSection(section, data)

    case 'badges':
      return renderBadgesSection(section, data)

    case 'custom':
      return section.config?.content as React.ReactNode || null

    default:
      return (
        <div className="text-sm text-muted-foreground">
          Unknown section type: {section.type}
        </div>
      )
  }
}

// ============================================================================
// ModalRuntime Component
// ============================================================================

export function ModalRuntime({
  definition,
  isOpen,
  onClose,
  data,
  onBack,
  onNavigate,
  onAction,
  sectionRenderers,
  children,
}: ModalRuntimeProps) {
  const {
    kind: _kind,
    title,
    icon,
    size = 'lg',
    keyboard = { escape: 'close', backspace: 'back' },
    headerSections,
    tabs,
    actions,
    footer,
  } = definition

  // Resolve title with data placeholders
  const resolvedTitle = useMemo(() => {
    let resolved = title
    Object.entries(data).forEach(([key, value]) => {
      resolved = resolved.replace(`{${key}}`, String(value))
    })
    return resolved
  }, [title, data])

  // Tab state
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.id || '')

  // Icon component
  const Icon = getIcon(icon)

  // Set up keyboard navigation
  useModalNavigation({
    isOpen,
    onClose,
    onBack: keyboard.backspace === 'back' ? onBack : undefined,
    enableEscape: keyboard.escape === 'close',
    enableBackspace: keyboard.backspace !== 'none',
  })

  // Handle action
  const handleAction = useCallback(
    (action: ModalActionDefinition) => {
      if (onAction) {
        onAction(action)
      }
    },
    [onAction]
  )

  // Get current tab
  const currentTab = tabs?.find((t) => t.id === activeTab)

  // Build tabs for BaseModal.Tabs
  const tabsForComponent = tabs?.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon ? getIcon(tab.icon) : undefined,
    badge: typeof tab.badge === 'string' ? data[tab.badge] as string | number : tab.badge,
  }))

  if (!isOpen) return null

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size={size}>
      {/* Header */}
      <BaseModal.Header
        title={resolvedTitle}
        icon={Icon}
        onClose={onClose}
        onBack={onBack}
        showBack={!!onBack}
      >
        {/* Header sections (badges, etc.) */}
        {headerSections?.map((section, index) => (
          <div key={index} className="mt-2">
            {renderSection(section, data, onNavigate, sectionRenderers)}
          </div>
        ))}
      </BaseModal.Header>

      {/* Tabs */}
      {tabs && tabs.length > 0 && tabsForComponent && (
        <BaseModal.Tabs
          tabs={tabsForComponent}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}

      {/* Content */}
      <BaseModal.Content>
        {/* Tab content */}
        {currentTab?.sections.map((section, index) => (
          <div key={index} className={index > 0 ? 'mt-6' : ''}>
            {section.title && (
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {section.title}
              </h3>
            )}
            {renderSection(section, data, onNavigate, sectionRenderers)}
          </div>
        ))}

        {/* Custom children */}
        {children}
      </BaseModal.Content>

      {/* Action Bar */}
      {actions && actions.length > 0 && (
        <BaseModal.ActionBar>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const ActionIcon = getIcon(action.icon)
              const variantStyles = {
                default: 'bg-secondary hover:bg-secondary/80 text-foreground',
                primary: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400',
                danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
                warning: 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400',
              }

              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action)}
                  disabled={action.disabled}
                  title={action.description}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    variantStyles[action.variant || 'default']
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <ActionIcon className="w-4 h-4" />
                  {action.label}
                </button>
              )
            })}
          </div>
        </BaseModal.ActionBar>
      )}

      {/* Footer */}
      <BaseModal.Footer
        showKeyboardHints={footer?.showKeyboardHints ?? true}
        keyboardHints={
          onBack
            ? [
                { key: 'Esc', label: 'close' },
                { key: 'Space', label: 'back' },
              ]
            : [{ key: 'Esc', label: 'close' }]
        }
      />
    </BaseModal>
  )
}

// ============================================================================
// YAML Parser (future implementation)
// ============================================================================

export function parseModalYAML(_yaml: string): ModalDefinition {
  // YAML parsing intentionally not implemented - use registerModal() with JS objects
  // If YAML config becomes a requirement, add js-yaml library and implement parser here
  throw new Error('YAML parsing not yet implemented. Use registerModal() with JS objects.')
}
