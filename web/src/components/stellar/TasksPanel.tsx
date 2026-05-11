import type { StellarTask } from '../../types/stellar'
import { TaskCard } from './TaskCard'

interface TasksPanelProps {
  tasks: StellarTask[]
  expanded: boolean
  onToggle: () => void
  onStatusChange: (id: string, status: string) => void
}

export function TasksPanel({ tasks, expanded, onToggle, onStatusChange }: TasksPanelProps) {
  return (
    <div style={{
      borderBottom: '1px solid var(--s-border)',
      flexShrink: 0,
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '7px 12px',
          background: 'none',
          border: 'none',
          color: 'var(--s-text)',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'var(--s-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          gap: 8,
        }}
      >
        <span>Tasks</span>
        <span style={{
          fontSize: 10,
          color: 'var(--s-warning)',
          background: 'rgba(227,179,65,0.12)',
          border: '1px solid rgba(227,179,65,0.3)',
          borderRadius: 10,
          padding: '0 5px',
        }}>
          {tasks.length} open
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--s-text-dim)' }}>{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div style={{ paddingBottom: 6 }}>
          {tasks.length === 0 ? (
            <div style={{ padding: '2px 12px 8px', color: 'var(--s-text-dim)', fontSize: 11 }}>
              No open tasks.
            </div>
          ) : (
            tasks.map(task => (
              <TaskCard key={task.id} task={task} onStatusChange={onStatusChange} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

