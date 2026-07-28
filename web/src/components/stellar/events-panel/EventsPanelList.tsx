import type { PendingAction } from '../EventCard'
import { EventCard } from '../EventCard'
import { DigestCard } from '../DigestCard'
import { SolveProgressCard, SolveEscalatedCard } from '../SolveCards'
import { countSolveAttempts, getSolveStatus } from '../lib/derive'
import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../../types/stellar'
import { BatchProcessingBanner } from './BatchProcessingBanner'
import { Group, EmptyState } from './GroupPrimitives'
import { getGroupSubtitle } from './helpers'
import { GROUP_CONFIGS, type CurrentBatch } from './types'

export interface EventsPanelListProps {
  notifications: StellarNotification[]
  solves: StellarSolve[]
  solveProgress: Record<string, StellarSolveProgress>
  digest: StellarNotification | null
  currentBatch: CurrentBatch | null
  activeProgress: StellarSolveProgress[]
  terminalSolves: StellarSolve[]
  hasAny: boolean
  groups: Record<'critical' | 'warning' | 'info', StellarNotification[]>
  stellarResolved: StellarNotification[]
  startSolve?: (eventID: string) => Promise<unknown>
  acknowledgeNotification: (id: string) => Promise<void>
  onRollback?: (prompt: string) => void
  onAction?: (prompt: string, action?: PendingAction) => void
  onOpenDetail: (n: StellarNotification | null) => void
  onOpenBatchMonitor: (timestamp: string) => void
}

/** Renders the scrollable body of the EventsPanel: digest, active batch banner,
 *  in-flight/terminal solve cards, severity-grouped notifications, and the
 *  "Resolved by Stellar" band. */
export function EventsPanelList({
  notifications,
  solves,
  solveProgress,
  digest,
  currentBatch,
  activeProgress,
  terminalSolves,
  hasAny,
  groups,
  stellarResolved,
  startSolve,
  acknowledgeNotification,
  onRollback,
  onAction,
  onOpenDetail,
  onOpenBatchMonitor,
}: EventsPanelListProps) {
  return (
    <>
      {digest && (
        <DigestCard
          notification={digest}
          solves={solves}
          onDismiss={() => { void acknowledgeNotification(digest.id) }}
        />
      )}

      {currentBatch && (
        <BatchProcessingBanner currentBatch={currentBatch} onOpen={() => onOpenBatchMonitor(currentBatch.timestamp)} />
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
        const subtitle = getGroupSubtitle(group, items, solves, solveProgress)
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
                onOpenDetail={onOpenDetail}
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
                onOpenDetail={onOpenDetail}
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
    </>
  )
}
