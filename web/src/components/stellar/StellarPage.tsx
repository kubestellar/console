import { useCallback, useState } from 'react'
import type { StellarNotification } from '../../types/stellar'
import { useStellar } from '../../hooks/useStellar'
import { EventsPanel } from './EventsPanel'
import type { PendingAction } from './EventCard'
import { ChatPanel } from './ChatPanel'
import { StellarHeader } from './StellarHeader'
import { TasksPanel } from './TasksPanel'
import { WatchesPanel } from './WatchesPanel'
import { RecommendedTasksPanel } from './RecommendedTasksPanel'
import { StellarActivityPanel } from './StellarActivityPanel'

import '../../styles/stellar.css'

// StellarPage — full-route view of the Stellar PA.
// Reuses the same panels as the sidebar but in a roomier 3-column layout
// so the user can see events, chat, and watches/tasks at once.
export function StellarPage() {
  const [tasksExpanded, setTasksExpanded] = useState(true)
  const [chatInput, setChatInput] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [detailNotification, setDetailNotification] = useState<StellarNotification | null>(null)
  const {
    isConnected,
    unreadCount,
    state,
    notifications,
    pendingActions,
    tasks,
    watches,
    nudge,
    catchUp,
    providerSession,
    setProviderSession,
    acknowledgeNotification,
    dismissAllNotifications,
    approveAction,
    rejectAction,
    updateTaskStatus,
    createTask,
    dismissNudge,
    resolveWatch,
    dismissWatch,
    snoozeWatch,
    dismissCatchUp,
    solves,
    solveProgress,
    startSolve,
    activity,
  } = useStellar()

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 320px) 1fr 1fr',
        gridTemplateRows: '1fr',
        gap: 0,
        height: 'calc(100vh - 56px)', // leave room for top nav
        background: 'var(--s-bg, #0a0e14)',
        fontFamily: 'var(--s-sans)',
        color: 'var(--s-text)',
        overflow: 'hidden',
      }}
    >
      {/* Left rail — header + watches + tasks */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--s-surface)',
          borderRight: '1px solid var(--s-border)',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <StellarHeader
          isConnected={isConnected}
          unreadCount={unreadCount}
          clusterCount={state?.clustersWatching?.length ?? 0}
          onCollapse={() => { /* no-op on page view */ }}
        />
        <div
          style={{
            borderBottom: '2px solid var(--s-border)',
            flexShrink: 0,
          }}
        >
          <TasksPanel
            tasks={tasks}
            expanded={tasksExpanded}
            onToggle={() => setTasksExpanded(v => !v)}
            onStatusChange={(id, status) => { void updateTaskStatus(id, status) }}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <StellarActivityPanel
            activity={activity}
            onOpenEvent={useCallback((eventId: string) => {
              const found = (notifications || []).find(n => n.id === eventId)
              if (found) setDetailNotification(found)
            }, [notifications])}
          />
          <RecommendedTasksPanel createTask={createTask} />
          <WatchesPanel
            watches={watches}
            allNotifications={notifications}
            solves={solves}
            onResolve={(id) => { void resolveWatch(id) }}
            onDismiss={(id) => { void dismissWatch(id) }}
            onSnooze={(id, minutes) => { void snoozeWatch(id, minutes) }}
            onAction={(prompt, action) => {
              setChatInput(prompt)
              setPendingAction(action ?? null)
            }}
          />
        </div>
      </div>

      {/* Middle column — events */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRight: '1px solid var(--s-border)',
          background: 'var(--s-surface)',
        }}
      >
        <EventsPanel
          notifications={notifications}
          pendingActions={pendingActions}
          acknowledgeNotification={acknowledgeNotification}
          dismissAllNotifications={dismissAllNotifications}
          approveAction={approveAction}
          rejectAction={rejectAction}
          solves={solves}
          solveProgress={solveProgress}
          startSolve={startSolve}
          detailNotification={detailNotification}
          setDetailNotification={setDetailNotification}
          onRollback={(prompt) => { setChatInput(prompt); setPendingAction(null) }}
          onAction={(prompt, action) => {
            setChatInput(prompt)
            setPendingAction(action ?? null)
          }}
        />
      </div>

      {/* Right column — chat */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--s-surface)',
        }}
      >
        <ChatPanel
          providerSession={providerSession}
          onProviderChange={setProviderSession}
          nudge={nudge}
          onDismissNudge={dismissNudge}
          catchUp={catchUp}
          onDismissCatchUp={dismissCatchUp}
          initialInput={chatInput}
          onInputConsumed={() => setChatInput('')}
          pendingAction={pendingAction}
          onActionConsumed={() => setPendingAction(null)}
          createTask={(title, description, source) => createTask(title, description, source)}
        />
      </div>
    </div>
  )
}
