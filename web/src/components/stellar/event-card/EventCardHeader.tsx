import { useTranslation } from 'react-i18next'
import type { StellarNotification } from '../../../types/stellar'
import type { TranslateFn } from './eventCardHelpers'
import {
  EVENT_CARD_BADGE_BASE_STYLE,
  EVENT_CARD_DETAILS_TEXT_STYLE,
  EVENT_CARD_TIME_STYLE,
  EVENT_CARD_TITLE_STYLE,
} from './eventCardStyles'

export interface EventCardStatusBadge {
  label: string
  color: string
}

export function EventCardHeader({
  notification,
  importance,
  importanceCol,
  statusBadge,
  relativeCreatedAt,
  onOpenDetail,
}: {
  notification: StellarNotification
  importance: { label: string; score: number }
  importanceCol: string
  statusBadge: EventCardStatusBadge | null
  relativeCreatedAt: string
  onOpenDetail?: (n: StellarNotification) => void
}) {
  const { t: tTyped } = useTranslation()
  const t = tTyped as unknown as TranslateFn

  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="text-xs" style={EVENT_CARD_TITLE_STYLE}>
        {notification.title}
      </div>
      <div className="flex items-baseline justify-end gap-2">
        {!notification.read && (
          <span
            className="px-1.5 text-[9px] font-mono"
            title={t('stellar.eventCard.importanceScore', { score: importance.score })}
            style={{
              ...EVENT_CARD_BADGE_BASE_STYLE,
              color: importanceCol,
              border: `1px solid ${importanceCol}`,
            }}
          >
            {importance.label}
          </span>
        )}
        {statusBadge && (
          <span
            className="px-1.5 text-[9px] font-mono"
            style={{
              ...EVENT_CARD_BADGE_BASE_STYLE,
              color: statusBadge.color,
              border: `1px solid ${statusBadge.color}`,
            }}
          >
            {statusBadge.label}
          </span>
        )}
        {onOpenDetail && (
          <span className="text-[10px] font-mono" style={EVENT_CARD_DETAILS_TEXT_STYLE}>
            {t('stellar.eventCard.details')}
          </span>
        )}
        {relativeCreatedAt && (
          <span className="text-[10px] text-muted-foreground" style={EVENT_CARD_TIME_STYLE}>
            {relativeCreatedAt}
          </span>
        )}
      </div>
    </div>
  )
}
