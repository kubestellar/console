/**
 * Modal and section-renderer registries used by ModalRuntime.
 */

import type { ComponentType } from 'react'
import type { ModalDefinition, SectionRendererProps } from './types'

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

export function getSectionRenderer(
  type: string
): ComponentType<SectionRendererProps> | undefined {
  return sectionRendererRegistry.get(type)
}
