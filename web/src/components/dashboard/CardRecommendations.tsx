import { useCardRecommendations, CardRecommendation } from '../../hooks/useCardRecommendations'

interface Props {
  currentCardTypes: string[]
  onAddCard: (cardType: string, config?: Record<string, unknown>) => void
}

export function CardRecommendations({ currentCardTypes, onAddCard }: Props) {
  const { recommendations, hasRecommendations, highPriorityCount } = useCardRecommendations(currentCardTypes)

  if (!hasRecommendations) return null

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    }
  }

  const priorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      case 'medium':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )
    }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <h3 className="text-sm font-medium text-foreground">AI Recommendations</h3>
        {highPriorityCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs">
            {highPriorityCount} urgent
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className={`p-3 rounded-lg border ${priorityColor(rec.priority)} cursor-pointer hover:scale-105 transition-transform`}
            onClick={() => onAddCard(rec.cardType, rec.config)}
          >
            <div className="flex items-center gap-2 mb-1">
              {priorityIcon(rec.priority)}
              <span className="font-medium text-sm">{rec.title}</span>
            </div>
            <p className="text-xs opacity-80">{rec.reason}</p>
            <div className="mt-2 text-xs opacity-60">Click to add card</div>
          </div>
        ))}
      </div>
    </div>
  )
}
