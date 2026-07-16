import { useTranslation } from 'react-i18next'
import type { StellarNotification } from '../../../types/stellar'
import type { SolveStatus } from '../lib/derive'
import {
  ACTION_CONFIG,
  HINT_TO_ACTION_TYPE,
  type PendingAction,
  type TranslateFn,
  buildActionPrompt,
  buildRollbackPrompt,
  extractResourceName,
} from './eventCardHelpers'
import {
  EVENT_CARD_ACTIONS_CLASS,
  EVENT_CARD_AUTO_HANDLING_STYLE,
  EVENT_CARD_BUTTON_STYLE,
  EVENT_CARD_ESCALATE_BUTTON_STYLE,
} from './eventCardStyles'

export function EventCardActions({
  notification,
  solveStatus,
  hints,
  showRollback,
  onSolve,
  onDismiss,
  onRollback,
  onAction,
}: {
  notification: StellarNotification
  solveStatus?: SolveStatus | null
  hints: string[]
  showRollback: boolean
  onSolve?: (eventID: string) => Promise<unknown>
  onDismiss: () => void
  onRollback?: (prompt: string) => void
  onAction?: (prompt: string, action?: PendingAction) => void
}) {
  const { t: tTyped } = useTranslation()
  const t = tTyped as unknown as TranslateFn

  // When Stellar is autonomously solving (or already finished resolving
  // successfully), hide manual action buttons — the user shouldn't have to
  // click anything in those cases. EXCEPTION: when Stellar escalated or
  // exhausted, the operator needs an obvious next step. We surface a
  // single "Try AI mission" button there so they can hand it off without
  // hunting through the mission sidebar.
  const isAutoActive = solveStatus?.isActive ?? false
  const isResolved = solveStatus?.phase === 'resolved'
  const isResolvedMonitored = solveStatus?.phase === 'resolved_monitored'
  const isEscalated = solveStatus?.phase === 'escalated' || solveStatus?.phase === 'exhausted'
  const hideManualActions = isAutoActive || isResolved || isResolvedMonitored

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      role="button"
      tabIndex={0}
      aria-label={`Event actions for ${notification.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      className={EVENT_CARD_ACTIONS_CLASS}
    >
      <button className="px-2 py-0.5 text-[11px]" onClick={onDismiss} style={EVENT_CARD_BUTTON_STYLE}>
        {t('actions.dismiss')}
      </button>
      {showRollback && onRollback && (
        <button
          className="px-2 py-0.5 text-[11px]"
          onClick={() => onRollback(buildRollbackPrompt(notification))}
          style={EVENT_CARD_BUTTON_STYLE}
        >
          ↩ {t('stellar.eventCard.undoThis')}
        </button>
      )}
      {isEscalated && onSolve && (
        <button
          className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px]"
          onClick={() => {
            void onSolve(notification.id)
          }}
          title={t('stellar.eventCard.tryAiMissionTitle')}
          style={EVENT_CARD_ESCALATE_BUTTON_STYLE}
        >
          <span>✦</span>
          <span>{t('stellar.eventCard.tryAiMission')}</span>
        </button>
      )}
      {!hideManualActions && !isEscalated &&
        hints.map(hint => {
          const cfg = ACTION_CONFIG[hint] ?? { labelKey: '', icon: '→', color: 'var(--s-text-muted)' }
          const actionLabel = cfg.labelKey ? t(cfg.labelKey) : hint.charAt(0).toUpperCase() + hint.slice(1)
          const isSolveActive = hint === 'solve' && solveStatus?.isActive
          return (
            <button
              key={hint}
              disabled={isSolveActive}
              onClick={() => {
                // The Solve button on Stellar v2 fires a headless solve loop
                // server-side instead of pre-filling the chat. JARVIS doesn't
                // ask you to draft the prompt — it just gets to work.
                if (hint === 'solve' && onSolve) {
                  void onSolve(notification.id)
                  return
                }
                const prompt = buildActionPrompt(hint, notification)
                const action: PendingAction = {
                  prompt,
                  actionType: HINT_TO_ACTION_TYPE[hint] ?? hint,
                  cluster: notification.cluster || '',
                  namespace: notification.namespace || '',
                  name: extractResourceName(notification),
                }
                onAction?.(prompt, action)
              }}
              title={
                isSolveActive
                  ? t('stellar.eventCard.solveAlreadyInProgress')
                  : t('stellar.eventCard.actionTitle', { action: actionLabel, title: notification.title })
              }
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px]"
              style={{
                background: 'none',
                border: `1px solid ${cfg.color}`,
                borderRadius: 'var(--s-rs)',
                color: cfg.color,
                cursor: isSolveActive ? 'not-allowed' : 'pointer',
                opacity: isSolveActive ? 0.5 : 1,
              }}
            >
              <span>{cfg.icon}</span>
              <span>{isSolveActive ? t('stellar.eventCard.solving') : actionLabel}</span>
            </button>
          )
        })}
      {hideManualActions && isAutoActive && (
        <span className="text-[10px] font-mono" style={EVENT_CARD_AUTO_HANDLING_STYLE}>
          {t('stellar.eventCard.autoHandling')}
        </span>
      )}
    </div>
  )
}
