import { useTranslation } from 'react-i18next'
import type { StellarTask } from '../../types/stellar'
import { TaskCard } from './TaskCard'

interface TasksPanelProps {
  tasks: StellarTask[]
  expanded: boolean
  onToggle: () => void
  onStatusChange: (id: string, status: string) => void
}

export function TasksPanel({ tasks, expanded, onToggle, onStatusChange }: TasksPanelProps) {
  const { t } = useTranslation()

  return (
    <div style={{
      borderBottom: '1px solid var(--s-border)',
      flexShrink: 0,
    }}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--s-text)',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'var(--s-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        <span>{t('stellar.tasks.title')}</span>
        <span className="px-1.5" style={{
          fontSize: 10,
          color: 'var(--s-warning)',
          background: 'rgba(227,179,65,0.12)',
          border: '1px solid rgba(227,179,65,0.3)',
          borderRadius: 10,
        }}>
          {tasks.length} open
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--s-text-dim)' }}>{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="pb-1.5">
          {tasks.length === 0 ? (
            <div className="px-3 pb-2 pt-0.5" style={{ color: 'var(--s-text-dim)', fontSize: 11 }}>
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

