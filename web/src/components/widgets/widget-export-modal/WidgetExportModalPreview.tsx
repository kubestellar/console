/**
 * Widget export modal preview dispatcher and shared sizing helpers.
 */

import { Smartphone } from 'lucide-react'
import type { CSSProperties } from 'react'
import { WIDGET_CARDS, WIDGET_STATS, WIDGET_TEMPLATES } from '../../../lib/widgets/widgetRegistry'
import { type WidgetConfig } from '../../../lib/widgets/codeGenerator'
import {
  PREV_CARD_PAD,
  PREV_CLR_DIM,
  PREV_FS_BODY,
  PREV_FS_LABEL,
  PREV_FS_MICRO,
  PREV_FS_STAT,
  PREV_FS_STAT_SM,
  PREV_ITEM_PAD,
  PREV_SM,
  PREV_XS,
  SAMPLE_STATS,
  WIDGET_EXPORT_MODAL_PREVIEW_MAX_HEIGHT_PX,
  WIDGET_EXPORT_MODAL_PREVIEW_MAX_WIDTH_PX,
  ps,
} from './previewStyles'
import { CardPreviewA } from './CardPreviewA'
import { CardPreviewB } from './CardPreviewB'

export function getWidgetPreviewDimensions(config: WidgetConfig | null): { width: number; height: number } | null {
  if (!config) return null

  if (config.type === 'card' && config.cardType) {
    const card = WIDGET_CARDS[config.cardType]
    return card ? card.defaultSize : null
  }

  if (config.type === 'stat' && config.statIds) {
    const selectedStats = config.statIds
      .map((statId) => WIDGET_STATS[statId])
      .filter((stat): stat is NonNullable<(typeof WIDGET_STATS)[keyof typeof WIDGET_STATS]> => Boolean(stat))

    if (selectedStats.length === 0) return null

    return {
      width: selectedStats.reduce((totalWidth, stat) => totalWidth + stat.size.width, 0),
      height: Math.max(...selectedStats.map((stat) => stat.size.height)),
    }
  }

  if (config.type === 'template' && config.templateId) {
    const template = WIDGET_TEMPLATES[config.templateId]
    return template ? template.size : null
  }

  return null
}

export function getWidgetPreviewScale(dimensions: { width: number; height: number } | null): number {
  if (!dimensions) return 1

  return Math.min(
    1,
    WIDGET_EXPORT_MODAL_PREVIEW_MAX_WIDTH_PX / dimensions.width,
    WIDGET_EXPORT_MODAL_PREVIEW_MAX_HEIGHT_PX / dimensions.height,
  )
}

const CARD_PREVIEW_A_TYPES = new Set([
  'cluster_health', 'pod_issues', 'gpu_overview', 'hardware_health', 'nightly_e2e_status',
  'security_issues', 'active_alerts', 'helm_releases', 'top_pods', 'event_summary',
  'warning_events', 'operator_status', 'storage_overview', 'pvc_status', 'network_overview',
  'service_status', 'opencost_overview', 'provider_health', 'nightly_release_pulse',
])

function CardPreview({ cardType }: { cardType: string }) {
  const card = WIDGET_CARDS[cardType]
  if (!card) return null
  if (CARD_PREVIEW_A_TYPES.has(cardType)) return <CardPreviewA cardType={cardType} card={card} />
  return <CardPreviewB cardType={cardType} card={card} />
}

function StatPreview({ statIds }: { statIds: string[] }) {
  return (
    <div style={{ ...ps.card, display: 'flex', flexWrap: 'wrap', gap: PREV_SM, padding: PREV_CARD_PAD, overflow: 'hidden' }}>
      {statIds.map((id) => {
        const stat = WIDGET_STATS[id]
        const value = SAMPLE_STATS[id] ?? '—'
        return (
          <div key={id} style={{ ...ps.statBlock, borderTop: `3px solid ${stat?.color || '#9333ea'}`, textAlign: 'center' }}>
            <span style={{ ...ps.statVal, fontSize: PREV_FS_STAT, color: stat?.color || '#fff' }}>{value}</span>
            <span style={ps.statLbl}>{stat?.displayName}</span>
          </div>
        )
      })}
    </div>
  )
}

function TemplatePreview({ templateId }: { templateId: string }) {
  const template = WIDGET_TEMPLATES[templateId]
  if (!template) return null

  const statsRow = template.stats && template.stats.length > 0 ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: PREV_XS, marginBottom: PREV_SM, overflow: 'hidden' }}>
      {template.stats.map((id) => {
        const stat = WIDGET_STATS[id]
        const value = SAMPLE_STATS[id] ?? '—'
        return (
          <div key={id} className="px-2 py-1" style={{ ...ps.statBlock, flex: 1, borderTop: `2px solid ${stat?.color || '#9333ea'}`, textAlign: 'center' }}>
            <span style={{ fontSize: PREV_FS_STAT_SM, fontWeight: 700, color: stat?.color || '#fff' }}>{value}</span>
            <span style={{ ...ps.statLbl, fontSize: PREV_FS_LABEL }}>{stat?.displayName}</span>
          </div>
        )
      })}
    </div>
  ) : null

  const cardMiniStyle: CSSProperties = {
    flex: 1,
    backgroundColor: 'rgba(31, 41, 55, 0.5)',
    borderRadius: '6px',
    padding: PREV_ITEM_PAD,
    border: '1px solid rgba(255, 255, 255, 0.05)' }

  const isGrid = template.layout === 'grid'
  const isRow = template.layout === 'row'
  const cardsContainer: CSSProperties = isGrid
    ? { display: 'grid', gridTemplateColumns: `repeat(${template.gridCols || 2}, 1fr)`, gap: PREV_XS }
    : isRow
    ? { display: 'flex', gap: PREV_XS }
    : { display: 'flex', flexDirection: 'column', gap: PREV_XS }

  return (
    <div style={{ ...ps.card, maxWidth: 320 }}>
      <div style={{ ...ps.title, fontSize: PREV_FS_BODY, marginBottom: PREV_SM }}>{template.displayName}</div>
      {statsRow}
      {template.cards.length > 0 && (
        <div style={cardsContainer}>
          {template.cards.map((cardType) => {
            const c = WIDGET_CARDS[cardType]
            return (
              <div key={cardType} style={cardMiniStyle}>
                <div style={{ fontSize: PREV_FS_MICRO, fontWeight: 600, color: PREV_CLR_DIM, marginBottom: PREV_XS }}>{c?.displayName || cardType}</div>
                <div style={{ fontSize: PREV_FS_STAT_SM, fontWeight: 700, color: ps.colors.purple }}>
                  {cardType === 'cluster_health' ? '3/4' : cardType === 'pod_issues' ? '4' : cardType === 'gpu_overview' ? '72%' : cardType === 'security_issues' ? '20' : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function WidgetPreview({ config }: { config: WidgetConfig | null }) {
  if (!config) {
    return (
      <div className="text-center text-muted-foreground">
        <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select an item to preview</p>
      </div>
    )
  }

  if (config.type === 'card' && config.cardType) {
    return <CardPreview cardType={config.cardType} />
  }

  if (config.type === 'stat' && config.statIds) {
    return <StatPreview statIds={config.statIds} />
  }

  if (config.type === 'template' && config.templateId) {
    return <TemplatePreview templateId={config.templateId} />
  }

  return null
}
