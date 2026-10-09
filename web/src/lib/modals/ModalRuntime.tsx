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

import { useState } from 'react'
import { getIcon } from '../icons'
import {
  ModalDefinition,
  ModalRuntimeProps,
  ModalActionDefinition } from './types'
import { BaseModal } from './BaseModal'
import { useModalNavigation } from './useModalNavigation'
import { renderSection } from './modalSectionRenderers'

export {
  registerModal,
  getModalDefinition,
  getAllModalDefinitions,
  registerSectionRenderer,
} from './modalRegistry'

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
  children }: ModalRuntimeProps) {
  const {
    title,
    icon,
    size = 'lg',
    keyboard = { escape: 'close', backspace: 'back' },
    headerSections,
    tabs,
    actions,
    footer } = definition

  // Resolve title with data placeholders.
  //
  // #6720 — Use a global regex so repeated occurrences of the same
  // placeholder (e.g. `{name}` appearing twice in the title) are all
  // replaced, not just the first. We escape the key since it may contain
  // regex metacharacters when callers use dotted data paths.
  const resolvedTitle = (() => {
    let resolved = title
    Object.entries(data).forEach(([key, value]) => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      resolved = resolved.replace(new RegExp(`\\{${escaped}\\}`, 'g'), String(value))
    })
    return resolved
  })()

  // Tab state
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.id || '')

  // #6719 — Derive the *effective* active tab id by validating the
  // stored value against the current tabs list. When tabs change (e.g.
  // definition swap, dynamic filter), a stale `activeTab` id can no
  // longer match any tab, leaving the modal body empty. Instead of
  // resetting state in an effect, derive the effective id at render
  // time and use that for lookups. The stored `activeTab` only changes
  // via explicit user clicks (setActiveTab).
  const effectiveActiveTab =
    tabs && tabs.length > 0
      ? (tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0].id)
      : activeTab

  // Icon component
  const Icon = getIcon(icon)

  // Set up keyboard navigation
  useModalNavigation({
    isOpen,
    onClose,
    onBack: keyboard.backspace === 'back' ? onBack : undefined,
    enableEscape: keyboard.escape === 'close',
    enableBackspace: keyboard.backspace !== 'none' })

  // Handle action
  const handleAction = (action: ModalActionDefinition) => {
      if (onAction) {
        onAction(action)
      }
    }

  // Get current tab — uses the validated effective id (#6719)
  const currentTab = tabs?.find((t) => t.id === effectiveActiveTab)

  // Build tabs for BaseModal.Tabs
  const tabsForComponent = tabs?.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon ? getIcon(tab.icon) : undefined,
    badge: typeof tab.badge === 'string' ? data[tab.badge] as string | number : tab.badge }))

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
          activeTab={effectiveActiveTab}
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
                warning: 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400' }

              return (
                <button
                  key={action.id}
                  onClick={() => handleAction(action)}
                  disabled={action.disabled}
                  title={action.description}
                  aria-label={action.description || action.label}
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
      {/*
        #6721 — Keyboard hints must match what the keydown handler
        actually listens for. `useModalNavigation` treats Backspace AND
        Space as back triggers (see useModalNavigation.ts), and Esc as
        close — so we surface both back keys, and we gate the Esc hint
        on `keyboard.escape === 'close'` so we never advertise a key
        that's been disabled via config.
      */}
      <BaseModal.Footer
        showKeyboardHints={footer?.showKeyboardHints ?? false}
        keyboardHints={(() => {
          const hints: { key: string; label: string }[] = []
          if (keyboard.escape === 'close') {
            hints.push({ key: 'Esc', label: 'close' })
          }
          if (onBack && keyboard.backspace === 'back') {
            hints.push({ key: 'Backspace', label: 'back' })
            hints.push({ key: 'Space', label: 'back' })
          }
          return hints
        })()}
      />
    </BaseModal>
  )
}

// ============================================================================
// YAML Parser (future implementation)
// ============================================================================

// eslint-disable-next-line react-refresh/only-export-components
export function parseModalYAML(_yaml: string): ModalDefinition {
  // YAML parsing intentionally not implemented - use registerModal() with JS objects
  // If YAML config becomes a requirement, add js-yaml library and implement parser here
  throw new Error('YAML parsing not yet implemented. Use registerModal() with JS objects.')
}
