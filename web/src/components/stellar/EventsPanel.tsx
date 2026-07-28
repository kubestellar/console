import { useRef, useState } from 'react'
import type { StellarAction, StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'
import { type PendingAction } from './EventCard'
import { ApprovalCard } from './ApprovalCard'
import { EventModal } from './EventModal'
import { BatchMonitorModal } from './BatchMonitorModal'
import { getSolveStatus } from './lib/derive'
import {
  EVENTS_PANEL_LAYOUT_STYLE,
  EventsPanelHeader,
  EventsPanelList,
  useEventsPanelData,
} from './events-panel'

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

  // Batch monitor modal state
  const [batchMonitorOpen, setBatchMonitorOpen] = useState(false)
  const [selectedBatchTimestamp, setSelectedBatchTimestamp] = useState<string | null>(null)

  const { digest, terminalSolves, activeProgress, currentBatch, unread, groups, stellarResolved, hasAny } =
    useEventsPanelData({ notifications, solves, solveProgress })

  return (
    <div style={EVENTS_PANEL_LAYOUT_STYLE}>
      <EventsPanelHeader
        unreadCount={unread.length}
        hasNotifications={notifications.length > 0}
        onDismissAll={() => { void dismissAllNotifications() }}
      />

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
        <EventsPanelList
          notifications={notifications}
          solves={solves}
          solveProgress={solveProgress}
          digest={digest}
          currentBatch={currentBatch}
          activeProgress={activeProgress}
          terminalSolves={terminalSolves}
          hasAny={hasAny}
          groups={groups}
          stellarResolved={stellarResolved}
          startSolve={startSolve}
          acknowledgeNotification={acknowledgeNotification}
          onRollback={onRollback}
          onAction={onAction}
          onOpenDetail={setDetailNotification}
          onOpenBatchMonitor={(timestamp) => {
            setSelectedBatchTimestamp(timestamp)
            setBatchMonitorOpen(true)
          }}
        />
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

      {batchMonitorOpen && selectedBatchTimestamp && (
        <BatchMonitorModal
          batchTimestamp={selectedBatchTimestamp}
          notifications={notifications}
          solves={solves}
          solveProgress={solveProgress}
          onClose={() => {
            setBatchMonitorOpen(false)
            setSelectedBatchTimestamp(null)
          }}
        />
      )}
    </div>
  )
}
