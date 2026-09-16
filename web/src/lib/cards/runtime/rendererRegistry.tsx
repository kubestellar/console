/**
 * Renderer Registry - Maps render names to components
 */

import { ReactNode } from 'react'
import { CardColumnDefinition } from '../types'
import { CardStatusBadge } from '../CardComponents'
import { ClusterBadge } from '../../../components/ui/ClusterBadge'

export type CellRenderer<T = unknown> = (value: unknown, item: T, column: CardColumnDefinition) => ReactNode

export const rendererRegistry = new Map<string, CellRenderer>()

export function registerRenderer<T>(name: string, renderer: CellRenderer<T>) {
  rendererRegistry.set(name, renderer as CellRenderer)
}

// Register default renderers
registerRenderer('statusBadge', (value) => {
  const status = String(value).toLowerCase()
  let variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'neutral'
  if (status.includes('running') || status.includes('healthy') || status.includes('ready')) {
    variant = 'success'
  } else if (status.includes('pending') || status.includes('waiting')) {
    variant = 'warning'
  } else if (status.includes('failed') || status.includes('error') || status.includes('crash')) {
    variant = 'error'
  }
  return <CardStatusBadge status={String(value)} variant={variant} />
})

registerRenderer('clusterBadge', (value) => (
  <ClusterBadge cluster={String(value || 'default')} />
))

registerRenderer('number', (value) => (
  <span className="font-mono text-sm">{Number(value).toLocaleString()}</span>
))

registerRenderer('percentage', (value) => (
  <span className="font-mono text-sm">{Number(value).toFixed(1)}%</span>
))
