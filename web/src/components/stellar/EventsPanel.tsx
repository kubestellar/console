import { useMemo, useRef, useState } from 'react'
import type { StellarAction, StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'
import { EventCard, type PendingAction } from './EventCard'
import { ApprovalCard } from './ApprovalCard'
import { EventModal } from './EventModal'
import { DigestCard } from './DigestCard'
import { SolveProgressCard, SolveEscalatedCard } from './SolveCards'
import { countSolveAttempts, getSolveStatus } from './lib/derive'

interface GroupConfig {
  key: 'critical' | 'warning' | 'info'
  label: string
  subtitle: string
  color: string
  background: string
}

const GROUP_CONFIGS: GroupConfig[] = [
  {
    key: 'critical',
    label: 'Critical alerts',
    subtitle: 'Auto-investigation in progress',
    color: 'var(--s-critical)',
    background: 'rgba(229,73,73,0.06)',
  },
  {
    key: 'warning',
    label: 'High priority',
    subtitle: 'Investigation complete, awaiting input',
    color: 'var(--s-warning)',
    background: 'rgba(227,179,65,0.05)',
  },
  {
    key: 'info',
    label: 'Info',
    subtitle: 'On-demand investigation',
    color: 'var(--s-info)',
    background: 'transparent',
  },
]

interface EventsPanelProps {
  notifications: StellarNotification[]
  pendingActions: StellarAction[]
  acknowledgeNotification: (id: string) => Promise<void>
  dismissAllNotifications: () => Promise<void>
  approveAction: (id: string, confirmToken?: string) => Promise<void>
  rejectAction: (id: string, reason: string) => Promise<void>
  // Stellar v2: solve loop + digest.
  solves?: StellarSolve[]
  solveProgress?: Record<string, StellarSolveProgress>
  startSolve?: (eventID: string) => Promise<unknown>
  /** Optional controlled detail modal — when provided, the StellarPage owns
   *  the modal state so the activity log can open the same modal. */
  detailNotification?: StellarNotification | null
  setDetailNotification?: (n: StellarNotification | null) => void
  onRollback?: (prompt: string) => void
  onAction?: (prompt: string, action?: PendingAction) => void
}

export function EventsPanel({
  notifications,
  pendingActions,
  acknowledgeNotification,
  dismissAllNotifications,
  approveAction,
  rejectAction,
  solves = [],
  solveProgress = {},
  startSolve,
  detailNotification: detailNotificationProp,
  setDetailNotification: setDetailNotificationProp,
  onRollback,
  onAction,
}: EventsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Allow the parent (StellarPage) to control the modal so the activity log
  // can also open it. Fall back to internal state when uncontrolled.
  const [detailLocal, setDetailLocal] = useState<StellarNotification | null>(null)
  const detailNotification = detailNotificationProp !== undefined ? detailNotificationProp : detailLocal
  const setDetailNotification = setDetailNotificationProp ?? setDetailLocal

  // Pull the latest digest notification (if any) so we can pin it at the top.
  const digest = useMemo(() => {
    return (notifications || []).find(n => n.type === 'digest' && !n.read) || null
  }, [notifications])

  // Stellar v2: derive escalated/exhausted solves that don't have a live
  // progress entry — these are completed terminal states the operator needs
  // to acknowledge.
  const terminalSolves = useMemo(() => {
    return (solves || []).filter(s => s.status === 'escalated' || s.status === 'exhausted')
      .slice(0, 5)
  }, [solves])

  const activeProgress = useMemo(() => Object.values(solveProgress || {}), [solveProgress])

  const { unread, groups, stellarResolved, hasAny } = useMemo(() => {
    const unreadItems = notifications.filter(n => !n.read)
    const readItems = notifications.filter(n => n.read)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Pull out "Stellar acted on its own" notifications — both unread and read —
    // into a dedicated band so the user can see at a glance what Stellar did.
    const isStellarResolution = (n: StellarNotification) =>
      n.type === 'action' && (
        n.title.startsWith('Stellar auto-fixed') ||
        n.title.startsWith('Stellar auto-fix failed') ||
        n.title.startsWith('Action completed')
      )

    const stellarActed: StellarNotification[] = []
    const remainingUnread: StellarNotification[] = []
    for (const n of unreadItems) {
      if (isStellarResolution(n)) stellarActed.push(n)
      else remainingUnread.push(n)
    }
    const remainingResolved: StellarNotification[] = []
    for (const n of readItems) {
      if (isStellarResolution(n)) stellarActed.push(n)
      else remainingResolved.push(n)
    }
    stellarActed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const byKey: Record<string, StellarNotification[]> = { critical: [], warning: [], info: [] }
    for (const n of remainingUnread) {
      const key = byKey[n.severity] ? n.severity : 'info'
      byKey[key].push(n)
    }
    for (const key of Object.keys(byKey)) {
      byKey[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    void remainingResolved // user dismissed — gone from view; see note below
    return {
      unread: unreadItems,
      groups: byKey as Record<'critical' | 'warning' | 'info', StellarNotification[]>,
      stellarResolved: stellarActed,
      hasAny: notifications.length > 0,
    }
  }, [notifications])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 12px',
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
          Events
        </span>
        {unread.length > 0 && (
          <span style={{
            fontFamily: 'var(--s-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--s-warning)',
            background: 'rgba(227,179,65,0.12)',
            border: '1px solid rgba(227,179,65,0.3)',
            borderRadius: 10,
            padding: '0 5px',
          }}>
            {unread.length} new
          </span>
        )}
        <div style={{ flex: 1 }} />
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
            clear all
          </button>
        )}
      </div>

      {pendingActions.length > 0 && (
        <div style={{
          padding: '8px 10px',
          flexShrink: 0,
          borderBottom: '1px solid var(--s-border)',
          background: 'rgba(227,179,65,0.05)',
        }}>
          <div style={{
            fontFamily: 'var(--s-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--s-warning)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>
            ⚠ Approval required
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

      <div
        ref={scrollRef}
        className="s-scroll flex min-h-0 flex-1 flex-col px-1 py-2"
        style={{
          overflowY: 'auto',
        }}
      >
        {digest && (
          <DigestCard
            notification={digest}
            solves={solves}
            onDismiss={() => { void acknowledgeNotification(digest.id) }}
          />
        )}

        {activeProgress.length > 0 && (
          <div className="mx-1 mb-2 mt-1">
            {activeProgress.map(p => (
              <SolveProgressCard key={p.solveId + p.eventId} progress={p} />
            ))}
          </div>
        )}

        {terminalSolves.length > 0 && (
          <div className="mx-1 mb-2">
            {terminalSolves.map(s => (
              <SolveEscalatedCard key={s.id} solve={s} />
            ))}
          </div>
        )}

        {!hasAny && activeProgress.length === 0 && terminalSolves.length === 0 && !digest && <EmptyState icon="✦" text="No events — all clear" />}

        {GROUP_CONFIGS.map(group => {
          const items = groups[group.key]
          if (items.length === 0) return null
          // Compute the per-group subtitle live so it stops lying. For critical
          // events, the subtitle reflects how many auto-solves are actually
          // running, paused, or already resolved — never the static "Auto-
          // investigation in progress" we used to show even when nothing was
          // happening.
          let subtitle = group.subtitle
          if (group.key === 'critical') {
            let active = 0, resolved = 0, escalated = 0
            for (const n of items) {
              const status = getSolveStatus(n, solves, solveProgress)
              if (!status) continue
              if (status.isActive) active++
              else if (status.phase === 'resolved') resolved++
              else if (status.phase === 'escalated' || status.phase === 'exhausted') escalated++
            }
            const parts: string[] = []
            if (active > 0) parts.push(`${active} solving`)
            if (resolved > 0) parts.push(`${resolved} resolved`)
            if (escalated > 0) parts.push(`${escalated} needs you`)
            subtitle = parts.length > 0
              ? parts.join(' · ')
              : 'Awaiting Stellar pickup'
          } else if (group.key === 'warning') {
            subtitle = 'Click investigate or dismiss'
          }
          return (
            <Group key={group.key} config={group} count={items.length} subtitle={subtitle}>
              {items.map(notification => (
                <EventCard
                  key={notification.id}
                  notification={notification}
                  allNotifications={notifications}
                  solveStatus={getSolveStatus(notification, solves, solveProgress)}
                  attemptCount={countSolveAttempts(notification, solves)}
                  onSolve={startSolve}
                  onDismiss={() => { void acknowledgeNotification(notification.id) }}
                  onRollback={onRollback}
                  onAction={onAction}
                  onOpenDetail={setDetailNotification}
                />
              ))}
            </Group>
          )
        })}

        {stellarResolved.length > 0 && (
          <div className="mt-2 px-1">
            <div className="mb-1 flex items-baseline gap-2 px-1.5 py-1" style={{
              background: 'rgba(63,185,80,0.06)',
              borderLeft: '3px solid var(--s-success)',
              borderRadius: 'var(--s-rs)',
            }}>
              <span style={{
                fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--s-success)',
              }}>✦ Resolved by Stellar</span>
              <span style={{
                fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
                color: 'var(--s-success)', opacity: 0.7,
              }}>{stellarResolved.length}</span>
              <span style={{ fontSize: 10, color: 'var(--s-text-dim)', fontStyle: 'italic' }}>
                Fixed without waiting for approval
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {stellarResolved.map(notification => (
                <EventCard
                  key={notification.id}
                  notification={notification}
                  allNotifications={notifications}
                  onDismiss={() => { void acknowledgeNotification(notification.id) }}
                  onRollback={onRollback}
                  onAction={onAction}
                  onOpenDetail={setDetailNotification}
                />
              ))}
            </div>
          </div>
        )}

        {/* Generic resolved tray removed intentionally: clicking Dismiss should
            make a card disappear from view, full stop. Stellar's own resolutions
            still surface in the "✦ Resolved by Stellar" band above. Anything
            else dismissed by the user is gone — accessible later via the audit
            log if needed. */}
      </div>

      {detailNotification && (
        <EventModal
          notification={detailNotification}
          allNotifications={notifications}
          pendingActions={pendingActions}
          solveStatus={getSolveStatus(detailNotification, solves, solveProgress)}
          solves={solves}
          onClose={() => setDetailNotification(null)}
          onAction={onAction}
        />
      )}
    </div>
  )
}

function Group({
  config, count, subtitle, children,
}: { config: GroupConfig; count: number; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 px-1">
      <div className="mb-1 flex items-baseline gap-2 px-1.5 py-1" style={{
        background: config.background,
        borderLeft: `3px solid ${config.color}`,
        borderRadius: 'var(--s-rs)',
      }}>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: config.color,
        }}>{config.label}</span>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
          color: config.color, opacity: 0.7,
        }}>{count}</span>
        <span style={{ fontSize: 10, color: 'var(--s-text-dim)', fontStyle: 'italic' }}>{subtitle ?? config.subtitle}</span>
      </div>
      <div className="flex flex-col gap-1">
        {children}
      </div>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      color: 'var(--s-text-dim)',
    }}>
      <span style={{ fontSize: 22, opacity: 0.4 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{text}</span>
    </div>
  )
}
