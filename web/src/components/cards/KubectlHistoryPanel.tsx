// ai-quality-ignore — sub-component of Kubectl card, not a standalone card
import { useMemo } from 'react'
import { History, Search, CheckCircle, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CommandHistoryItem } from './Kubectl.types'

interface CommandHistoryPanelProps {
  history: CommandHistoryItem[]
  onSelectCommand: (command: string, context: string) => void
}

export function CommandHistoryPanel({
  history,
  onSelectCommand,
}: CommandHistoryPanelProps) {
  const { t } = useTranslation(['cards'])
  const [historySearch, setHistorySearch] = React.useState('')

  const filteredHistory = useMemo(() => history.filter(item =>
    item.command.toLowerCase().includes(historySearch.toLowerCase()) ||
    item.context.toLowerCase().includes(historySearch.toLowerCase())
  ).reverse(), [history, historySearch])

  return (
    <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg max-h-64 overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-medium text-orange-300">{t('cards:kubectl.history')}</span>
      </div>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <input
          type="text"
          value={historySearch}
          onChange={(e) => setHistorySearch(e.target.value)}
          placeholder={t('cards:kubectl.searchHistory')}
          className="w-full pl-7 pr-3 py-1.5 text-xs bg-secondary rounded text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-orange-500/50"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {filteredHistory.map(item => (
          <button
            key={item.id}
            onClick={() => onSelectCommand(item.command, item.context)}
            className="w-full px-2 py-1.5 text-xs rounded text-left hover:bg-secondary/50 group"
          >
            <div className="flex flex-wrap items-center justify-between gap-y-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {item.success ? (
                  <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                )}
                <span className="text-muted-foreground truncate">{item.command}</span>
              </div>
              <span className="text-2xs text-muted-foreground ml-2 shrink-0">
                {item.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <div className="text-2xs text-muted-foreground/60 mt-0.5 truncate">
              {item.context}
            </div>
          </button>
        ))}
        {filteredHistory.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">
            {historySearch ? t('cards:kubectl.noMatchingCommands') : t('cards:kubectl.noHistory')}
          </div>
        )}
      </div>
    </div>
  )
}

// Fix missing React import
import React from 'react'
