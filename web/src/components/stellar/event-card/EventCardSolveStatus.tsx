import { useTranslation } from 'react-i18next'
import type { StellarNotification } from '../../../types/stellar'
import type { SolveStatus } from '../lib/derive'
import { formatCountdownShort, type TranslateFn } from './eventCardHelpers'
import {
  EVENT_CARD_COUNTDOWN_STYLE,
  EVENT_CARD_MONITORING_BADGE_STYLE,
  EVENT_CARD_MUTED_TEXT_STYLE,
  EVENT_CARD_PERCENT_STYLE,
  EVENT_CARD_PROGRESS_BAR_STYLE,
  EVENT_CARD_PROGRESS_CONTAINER_STYLE,
  EVENT_CARD_SOLVE_STATUS_LABEL_STYLE,
} from './eventCardStyles'

export function EventCardSolveStatus({ solveStatus }: { solveStatus: SolveStatus }) {
  return (
    <div className="mt-1.5">
      <div className="mb-1 flex items-center gap-2">
        <span
          className="text-[11px] font-mono"
          style={{
            ...EVENT_CARD_SOLVE_STATUS_LABEL_STYLE,
            color: solveStatus.color,
          }}
        >
          {solveStatus.label}
        </span>
        {solveStatus.phase === 'resolved_monitored' && solveStatus.nextRecheckAt && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={EVENT_CARD_COUNTDOWN_STYLE}>
            {formatCountdownShort(solveStatus.nextRecheckAt)}
          </span>
        )}
        <span
          className="text-[10px] font-mono"
          style={{
            ...EVENT_CARD_PERCENT_STYLE,
            color: solveStatus.color,
          }}
        >
          {solveStatus.percent}%
        </span>
      </div>
      <div style={EVENT_CARD_PROGRESS_CONTAINER_STYLE}>
        <div
          style={{
            ...EVENT_CARD_PROGRESS_BAR_STYLE,
            width: `${Math.min(100, Math.max(0, solveStatus.percent))}%`,
            background: solveStatus.color,
          }}
        />
      </div>
    </div>
  )
}

export function EventCardMonitoringBadge({
  solveStatus,
  notification,
}: {
  solveStatus: SolveStatus
  notification: StellarNotification
}) {
  const { t: tTyped } = useTranslation()
  const t = tTyped as unknown as TranslateFn

  return (
    <div
      className="mt-1 inline-flex flex-wrap items-center gap-1 rounded-[10px] px-1.5 py-1 text-[10px] font-mono"
      style={EVENT_CARD_MONITORING_BADGE_STYLE}
    >
      <span>{t('stellar.eventCard.monitoring')}</span>
      <span style={EVENT_CARD_MUTED_TEXT_STYLE}>·</span>
      <span>
        {solveStatus.monitoringTarget ||
          notification.namespace ||
          notification.cluster ||
          t('stellar.eventCard.defaultMonitoringTarget')}
      </span>
      {solveStatus.nextRecheckAt ? (
        <>
          <span style={EVENT_CARD_MUTED_TEXT_STYLE}>·</span>
          <span>
            {solveStatus.nextRecheckAt <= Date.now()
              ? t('stellar.eventCard.recheckNow')
              : t('stellar.eventCard.recheckIn', { countdown: formatCountdownShort(solveStatus.nextRecheckAt) })}
          </span>
        </>
      ) : null}
    </div>
  )
}
