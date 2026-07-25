import { Input } from '../../ui/Input'
import { Filter, User } from 'lucide-react'
import { cn } from '../../../lib/cn'

interface FilterToolbarProps {
  searchTerm: string
  onSearchTermChange: (term: string) => void
  showOnlyMine: boolean
  onShowOnlyMineChange: () => void
  userAvailable: boolean
}

export function FilterToolbar({
  searchTerm,
  onSearchTermChange,
  showOnlyMine,
  onShowOnlyMineChange,
  userAvailable,
}: FilterToolbarProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      <Input
        type="text"
        placeholder="Search reservations..."
        value={searchTerm}
        onChange={e => onSearchTermChange(e.target.value)}
        className="flex-1 min-w-[200px]"
      />
      {userAvailable && (
        <label className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border cursor-pointer',
          showOnlyMine
            ? 'border-purple-500 bg-purple-500/10 text-purple-400'
            : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
        )}>
          <Input
            type="checkbox"
            checked={showOnlyMine}
            onChange={onShowOnlyMineChange}
            className="sr-only"
          />
          {showOnlyMine ? <User className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
          My Reservations
        </label>
      )}
    </div>
  )
}
