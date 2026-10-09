/**
 * Built-in section renderers used by ModalRuntime.
 */

import type { ComponentType } from 'react'
import {
  ModalSectionDefinition,
  SectionRendererProps,
  NavigationTarget } from './types'
import {
  KeyValueSection,
  TableSection,
  BadgesSection,
  KeyValueItem,
  TableColumn } from './ModalSections'
import { getSectionRenderer } from './modalRegistry'

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
      namespace: data.namespace as string | undefined } : undefined }))

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
  // #6718 — `data[dataKey]` can be an object or string (both truthy), so
  // the previous `tableData || []` fallback didn't protect against non-
  // array inputs and the downstream table would crash on `.map`. Use an
  // Array.isArray() check so the empty-state path is always taken for
  // non-array data.
  const rawTableData = dataKey ? data[dataKey] : data
  const tableData: Record<string, unknown>[] = Array.isArray(rawTableData)
    ? (rawTableData as Record<string, unknown>[])
    : []
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
    align: col.align }))

  return (
    <TableSection
      data={tableData}
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
    value: String(data[key] || '-') }))

  return <BadgesSection badges={badges} />
}

export function renderSection(
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
  const RegisteredRenderer = getSectionRenderer(section.type)
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
