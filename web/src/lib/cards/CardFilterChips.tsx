import { Filter, type LucideIcon } from 'lucide-react'

export interface FilterChip {
  id: string
  label: string
  count?: number
  icon?: LucideIcon
  color?: string
}

export interface CardFilterChipsProps {
  chips: FilterChip[]
  activeChip: string
  onChipClick: (id: string) => void
}

export function CardFilterChips({ chips, activeChip, onChipClick }: CardFilterChipsProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
      {chips.map((chip) => {
        const isActive = activeChip === chip.id
        const Icon = chip.icon

        return (
          <button
            key={chip.id}
            onClick={() => onChipClick(chip.id)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${isActive
              ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
              : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
          >
            {Icon && <Icon className={`w-3 h-3 ${isActive && chip.color ? chip.color : ''}`} />}
            <span className="capitalize">{chip.label}</span>
            {chip.count !== undefined && (
              <span
                className={`px-1 rounded text-2xs ${isActive ? 'bg-purple-500/30' : 'bg-secondary'
                  }`}
              >
                {chip.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
