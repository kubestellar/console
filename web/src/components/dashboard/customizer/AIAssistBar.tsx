/**
 * AIAssistBar — shared AI assist input used across all Console Studio sections.
 * Provides a consistent "describe what you want" experience everywhere.
 */
import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

interface AIAssistBarProps {
  /** Placeholder text for the input */
  placeholder: string
  /** Called when user submits a query */
  onGenerate: (query: string) => void | Promise<void>
  /** Whether generation is in progress */
  isGenerating?: boolean
  /** Optional quick-suggestion chips */
  suggestions?: string[]
  /** Called when a suggestion chip is clicked */
  onSuggestionClick?: (suggestion: string) => void
}

export function AIAssistBar({
  placeholder,
  onGenerate,
  isGenerating = false,
  suggestions,
  onSuggestionClick,
}: AIAssistBarProps) {
  const [query, setQuery] = useState('')

  const handleSubmit = () => {
    if (!query.trim() || isGenerating) return
    onGenerate(query)
  }

  const handleSuggestion = (s: string) => {
    setQuery(s)
    if (onSuggestionClick) {
      onSuggestionClick(s)
    } else {
      onGenerate(s)
    }
  }

  return (
    <div className="mb-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={placeholder}
            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!query.trim() || isGenerating}
          className="px-3 py-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {isGenerating ? 'Working...' : 'AI Assist'}
        </button>
      </div>
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-xs text-muted-foreground">Try:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="px-2 py-0.5 text-xs bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
