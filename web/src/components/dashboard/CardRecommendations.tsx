import { useState } from 'react'
import { Clock } from 'lucide-react'
import { useCardRecommendations, CardRecommendation } from '../../hooks/useCardRecommendations'
import { useSnoozedRecommendations } from '../../hooks/useSnoozedRecommendations'

interface Props {
  currentCardTypes: string[]
  onAddCard: (cardType: string, config?: Record<string, unknown>) => void
}

export function CardRecommendations({ currentCardTypes, onAddCard }: Props) {
  const { recommendations, hasRecommendations, highPriorityCount } = useCardRecommendations(currentCardTypes)
  const { snoozeRecommendation, isSnoozed } = useSnoozedRecommendations()
  const [expandedRec, setExpandedRec] = useState<string | null>(null)
  const [addingCard, setAddingCard] = useState<string | null>(null)

  const handleAddCard = async (rec: CardRecommendation) => {
    setAddingCard(rec.id)
    // Simulate a brief delay for visual feedback
    await new Promise(resolve => setTimeout(resolve, 300))
    onAddCard(rec.cardType, rec.config)
    setAddingCard(null)
    setExpandedRec(null)
  }

  const handleSnooze = (rec: CardRecommendation) => {
    snoozeRecommendation(rec)
    setExpandedRec(null)
  }

  // Filter out snoozed recommendations
  const visibleRecommendations = recommendations.filter(rec => !isSnoozed(rec.id))

  if (!hasRecommendations || visibleRecommendations.length === 0) return null

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
    <div data-tour="recommendations" className="mb-6">
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
        {visibleRecommendations.map((rec) => (
          <div
            key={rec.id}
            className={`rounded-lg border ${priorityColor(rec.priority)} transition-all ${
              expandedRec === rec.id ? 'w-full md:w-96' : 'w-auto'
            }`}
          >
            {/* Collapsed view */}
            <div
              className={`p-3 cursor-pointer ${expandedRec === rec.id ? '' : 'hover:scale-105'} transition-transform`}
              onClick={() => setExpandedRec(expandedRec === rec.id ? null : rec.id)}
            >
              <div className="flex items-center gap-2 mb-1">
                {priorityIcon(rec.priority)}
                <span className="font-medium text-sm">{rec.title}</span>
                {addingCard === rec.id && (
                  <div className="ml-auto spinner w-4 h-4" />
                )}
              </div>
              <p className="text-xs opacity-80">{rec.reason}</p>
              {expandedRec !== rec.id && (
                <div className="mt-2 text-xs opacity-60">Click to expand</div>
              )}
            </div>

            {/* Expanded view with actions */}
            {expandedRec === rec.id && (
              <div className="px-3 pb-3 border-t border-current/20 mt-2 pt-3">
                <div className="text-xs opacity-80 mb-3">
                  <strong>What this will do:</strong>
                  <ul className="mt-1 ml-4 list-disc space-y-1">
                    <li>Add a new "{rec.title}" card to your dashboard</li>
                    <li>Show real-time data from your clusters</li>
                    {rec.priority === 'high' && <li>Help you address critical issues faster</li>}
                  </ul>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddCard(rec)}
                    disabled={addingCard === rec.id}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      rec.priority === 'high'
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : rec.priority === 'medium'
                        ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {addingCard === rec.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="spinner w-4 h-4" /> Adding...
                      </span>
                    ) : (
                      'Add to Dashboard'
                    )}
                  </button>
                  <button
                    onClick={() => handleSnooze(rec)}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors flex items-center gap-1"
                    title="Snooze this recommendation"
                  >
                    <Clock className="w-4 h-4" />
                    Snooze
                  </button>
                  <button
                    onClick={() => setExpandedRec(null)}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-card/30 hover:bg-card/50 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
