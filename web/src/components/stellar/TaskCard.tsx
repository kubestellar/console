import type { StellarTask } from '../../types/stellar'

interface TaskCardProps {
  task: StellarTask
  onStatusChange: (id: string, status: string) => void
}

export function TaskCard({ task, onStatusChange }: TaskCardProps) {
  const nextStatus = task.status === 'done' ? 'open' : 'done'
  return (
    <div className="flex items-start gap-1.5 px-2.5 py-1.5 text-xs">
      <button
        onClick={() => onStatusChange(task.id, nextStatus)}
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          flexShrink: 0,
          marginTop: 1,
          border: '1px solid var(--s-border)',
          background: task.status === 'done' ? 'var(--s-success)' : 'none',
          cursor: 'pointer',
        }}
        title={task.status === 'done' ? 'Mark open' : 'Mark done'}
      />
      <span style={{
        color: task.status === 'done' ? 'var(--s-text-dim)' : 'var(--s-text)',
        textDecoration: task.status === 'done' ? 'line-through' : 'none',
      }}>
        {task.title}
      </span>
      {task.source === 'stellar' && (
        <span className="ml-auto text-[10px]" style={{ color: 'var(--s-brand)' }}>stellar</span>
      )}
    </div>
  )
}

