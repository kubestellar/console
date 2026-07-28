import { useTranslation } from 'react-i18next'
import type { StellarAction, StellarNotification } from '../../types/stellar'
import { ApprovalCard } from './ApprovalCard'

const FLEX_SPACER_STYLE = { flex: 1 } as const

interface EventsPanelHeaderProps {
  notifications: StellarNotification[]
  unreadCount: number
  pendingActions: StellarAction[]
  dismissAllNotifications: () => Promise<void>
  approveAction: (id: string, confirmToken?: string) => Promise<void>
  rejectAction: (id: string, reason: string) => Promise<void>
}

export function EventsPanelHeader({
  notifications,
  unreadCount,
  pendingActions,
  dismissAllNotifications,
  approveAction,
  rejectAction,
}: EventsPanelHeaderProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex items-center gap-1.5 px-3 py-2" style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--s-border)',
      }}>
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--s-text-muted)',
        }}>
          {t('common.events', 'Events')}
        </span>
        {unreadCount > 0 && (
          <span className="px-1.5" style={{
            fontFamily: 'var(--s-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--s-warning)',
            background: 'rgba(227,179,65,0.12)',
            border: '1px solid rgba(227,179,65,0.3)',
            borderRadius: 10,
          }}>
            {unreadCount} {t('common.new', 'new')}
          </span>
        )}
        <div style={FLEX_SPACER_STYLE} />
        {notifications.length > 0 && (
          <button
            onClick={() => {
              void dismissAllNotifications()
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 10,
              color: 'var(--s-text-dim)',
              padding: 0,
            }}
          >
            {t('common.clearAll', 'clear all')}
          </button>
        )}
      </div>

      {pendingActions.length > 0 && (
        <div className="px-2.5 py-2" style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--s-border)',
          background: 'rgba(227,179,65,0.05)',
        }}>
          <div className="mb-1.5" style={{
            fontFamily: 'var(--s-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--s-warning)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            ⚠ {t('stellar.events.approvalRequired', 'Approval required')}
          </div>
          {pendingActions.map(action => (
            <ApprovalCard
              key={action.id}
              action={action}
              onApprove={(confirmToken) => approveAction(action.id, confirmToken)}
              onReject={(reason) => rejectAction(action.id, reason)}
            />
          ))}
        </div>
      )}
    </>
  )
}
