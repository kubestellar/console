import { Star } from 'lucide-react'

const DIFFICULTY_CONFIG = {
  beginner: { label: 'Beginner', color: 'text-green-400 bg-green-950', stars: 1 },
  intermediate: { label: 'Intermediate', color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10', stars: 2 },
  advanced: { label: 'Advanced', color: 'text-red-400 bg-red-950', stars: 3 },
} as const

export function DifficultyBadge({ difficulty }: { difficulty: 'beginner' | 'intermediate' | 'advanced' }) {
  const config = DIFFICULTY_CONFIG[difficulty]
  return (
    <span className={`flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded ${config.color}`}>
      {Array.from({ length: config.stars }).map((_, i) => (
        <Star key={i} className="w-2.5 h-2.5 fill-current" />
      ))}
      {config.label}
    </span>
  )
}
