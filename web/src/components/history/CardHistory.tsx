import { useState } from 'react'
import { History, Trash2, Plus, RefreshCw, ArrowRight, Settings2, RotateCcw } from 'lucide-react'
import { useCardHistory, CardHistoryEntry } from '../../hooks/useCardHistory'
import { cn } from '../../lib/cn'
import { formatCardTitle } from '../../lib/formatCardTitle'

function formatCardType(type: string): string {
  return formatCardTitle(type)
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now'
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000)
    return `${mins} minute${mins > 1 ? 's' : ''} ago`
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours} hour${hours > 1 ? 's' : ''} ago`
  }

  // Less than 7 days
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000)
    return `${days} day${days > 1 ? 's' : ''} ago`
  }

  // Show date
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function ActionIcon({ action }: { action: CardHistoryEntry['action'] }) {
  switch (action) {
    case 'added':
      return <Plus className="w-4 h-4 text-green-400" />
    case 'removed':
      return <Trash2 className="w-4 h-4 text-red-400" />
    case 'replaced':
      return <RefreshCw className="w-4 h-4 text-blue-400" />
    case 'configured':
      return <Settings2 className="w-4 h-4 text-purple-400" />
  }
}

function ActionBadge({ action }: { action: CardHistoryEntry['action'] }) {
  const colors = {
    added: 'bg-green-500/20 text-green-400 border-green-500/30',
    removed: 'bg-red-500/20 text-red-400 border-red-500/30',
    replaced: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    configured: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  }

  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs border', colors[action])}>
      {action.charAt(0).toUpperCase() + action.slice(1)}
    </span>
  )
}

interface CardHistoryProps {
  onRestoreCard?: (entry: CardHistoryEntry) => void
}

export function CardHistory({ onRestoreCard }: CardHistoryProps) {
  const { history, clearHistory, removeEntry } = useCardHistory()
  const [filter, setFilter] = useState<CardHistoryEntry['action'] | 'all'>('all')

  const filteredHistory = filter === 'all' ? history : history.filter((entry) => entry.action === filter)

  return (
    <div className="pt-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <History className="w-6 h-6 text-purple-400" />
            Card History
          </h1>
          <p className="text-muted-foreground">
            Track changes to your dashboard cards
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear History
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'added', 'removed', 'replaced', 'configured'] as const).map((action) => (
          <button
            key={action}
            onClick={() => setFilter(action)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm transition-colors',
              filter === action
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            )}
          >
            {action === 'all' ? 'All' : action.charAt(0).toUpperCase() + action.slice(1)}
            {action !== 'all' && (
              <span className="ml-1 text-xs opacity-60">
                ({history.filter((e) => e.action === action).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* History List */}
      {filteredHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-dashed border-border">
          <History className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground text-center">
            {filter === 'all'
              ? 'No card history yet. Changes to dashboard cards will appear here.'
              : `No ${filter} cards in history.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-4 p-4 rounded-lg glass border border-border/50 hover:border-border transition-colors"
            >
              {/* Action Icon */}
              <div className="p-2 rounded-lg bg-secondary/50">
                <ActionIcon action={entry.action} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-foreground">
                    {entry.cardTitle || formatCardType(entry.cardType)}
                  </span>
                  <ActionBadge action={entry.action} />
                </div>

                {/* Action description */}
                <p className="text-sm text-muted-foreground">
                  {entry.action === 'replaced' && entry.previousCardType && (
                    <>
                      <span className="text-foreground/80">{formatCardType(entry.previousCardType)}</span>
                      <ArrowRight className="w-3 h-3 inline mx-1" />
                      <span className="text-foreground/80">{formatCardType(entry.cardType)}</span>
                    </>
                  )}
                  {entry.action === 'removed' && (
                    <>Removed from {entry.dashboardName || 'dashboard'}</>
                  )}
                  {entry.action === 'added' && (
                    <>Added to {entry.dashboardName || 'dashboard'}</>
                  )}
                  {entry.action === 'configured' && (
                    <>Configuration updated</>
                  )}
                </p>

                {/* Dashboard and timestamp */}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {entry.dashboardName && (
                    <span className="px-2 py-0.5 rounded bg-secondary/50">
                      {entry.dashboardName}
                    </span>
                  )}
                  <span>{formatTimestamp(entry.timestamp)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {entry.action === 'removed' && onRestoreCard && (
                  <button
                    onClick={() => onRestoreCard(entry)}
                    className="p-2 rounded-lg hover:bg-green-500/20 text-muted-foreground hover:text-green-400 transition-colors"
                    title="Restore card"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => removeEntry(entry.id)}
                  className="p-2 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Remove from history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
