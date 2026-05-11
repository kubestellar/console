import { useState } from 'react'
import { useStellar } from '../../hooks/useStellar'
import { EventsPanel } from './EventsPanel'
import { ChatPanel } from './ChatPanel'
import { StellarHeader } from './StellarHeader'
import { TasksPanel } from './TasksPanel'
import { WatchesPanel } from './WatchesPanel'

import '../../styles/stellar.css'

export function StellarSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [tasksExpanded, setTasksExpanded] = useState(false)
  const [chatInput, setChatInput] = useState('')
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
  } = useStellar()

  if (collapsed) {
    return (
      <div style={{
        width: 40,
        flexShrink: 0,
        height: '100%',
        background: 'var(--s-surface)',
        borderLeft: '1px solid var(--s-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 12,
        gap: 10,
      }}>
        <button
          onClick={() => setCollapsed(false)}
          title="Open Stellar"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--s-brand)',
            fontSize: 18,
            padding: 4,
            lineHeight: 1,
          }}
        >
          ◂
        </button>
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: isConnected ? 'var(--s-success)' : 'var(--s-text-dim)',
          boxShadow: isConnected ? '0 0 5px var(--s-success)' : 'none',
        }} />
        {unreadCount > 0 && (
          <div style={{
            background: 'var(--s-critical)',
            color: '#fff',
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 5px',
            minWidth: 18,
            textAlign: 'center',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      width: 380,
      flexShrink: 0,
      height: '100%',
      background: 'var(--s-surface)',
      borderLeft: '1px solid var(--s-border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'var(--s-sans)',
    }}>
      <StellarHeader
        isConnected={isConnected}
        unreadCount={unreadCount}
        clusterCount={state?.clustersWatching?.length ?? 0}
        onCollapse={() => setCollapsed(true)}
      />

      <div style={{
        borderBottom: '2px solid var(--s-border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <TasksPanel
          tasks={tasks}
          expanded={tasksExpanded}
          onToggle={() => setTasksExpanded(value => !value)}
          onStatusChange={(id, status) => { void updateTaskStatus(id, status) }}
        />
      </div>

      <WatchesPanel
        watches={watches}
        onResolve={(id) => { void resolveWatch(id) }}
        onDismiss={(id) => { void dismissWatch(id) }}
        onSnooze={(id, minutes) => { void snoozeWatch(id, minutes) }}
      />

      <div style={{
        flex: 1,
        minHeight: 0,
        borderBottom: '2px solid var(--s-border)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <EventsPanel
          notifications={notifications}
          pendingActions={pendingActions}
          acknowledgeNotification={acknowledgeNotification}
          dismissAllNotifications={dismissAllNotifications}
          approveAction={approveAction}
          rejectAction={rejectAction}
          onRollback={(prompt) => setChatInput(prompt)}
        />
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <ChatPanel
          providerSession={providerSession}
          onProviderChange={setProviderSession}
          nudge={nudge}
          onDismissNudge={dismissNudge}
          catchUp={catchUp}
          onDismissCatchUp={dismissCatchUp}
          initialInput={chatInput}
          onInputConsumed={() => setChatInput('')}
          createTask={(title, description, source) => createTask(title, description, source)}
        />
      </div>
    </div>
  )
}