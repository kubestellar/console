import { Filter, Plus, User } from 'lucide-react'
import { Input } from '../ui/Input'
import { cn } from '../../lib/cn'

interface FilterToolbarProps {
  user: { github_login?: string } | null
  showOnlyMine: boolean
  onToggleShowOnlyMine: () => void
  onCreateReservation: () => void
  myReservationsLabel: string
  createReservationLabel: string
}

export function FilterToolbar({
  user,
  showOnlyMine,
  onToggleShowOnlyMine,
  onCreateReservation,
  myReservationsLabel,
  createReservationLabel,
}: FilterToolbarProps) {
  return (
    <div className="ml-auto pb-2 flex flex-wrap items-center gap-3">
      {user && (
        <label
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border cursor-pointer',
            showOnlyMine
              ? 'border-purple-500 bg-purple-500/10 text-purple-400'
              : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
          )}
        >
          <Input
            type="checkbox"
            checked={showOnlyMine}
            onChange={onToggleShowOnlyMine}
            className="sr-only"
          />
          {showOnlyMine ? <User className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
          {myReservationsLabel}
        </label>
      )}
      <button
        onClick={onCreateReservation}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        {createReservationLabel}
      </button>
    </div>
  )
}
