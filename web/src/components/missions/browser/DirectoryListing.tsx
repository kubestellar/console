import { Folder, FileJson, FileCode, FileText, Download } from 'lucide-react'
import { cn } from '../../../lib/cn'
import type { BrowseEntry } from '../../../lib/missions/types'
import type { ViewMode } from './types'
import { formatBytes } from './helpers'

/** Pick a file icon and color based on file extension */
function getFileIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return { Icon: FileCode, color: 'text-orange-400' }
  }
  if (lower.endsWith('.md')) {
    return { Icon: FileText, color: 'text-emerald-400' }
  }
  return { Icon: FileJson, color: 'text-blue-400' }
}

export function DirectoryListing({
  entries,
  viewMode,
  onSelect,
  onImport,
}: {
  entries: BrowseEntry[]
  viewMode: ViewMode
  onSelect: (entry: BrowseEntry) => void
  onImport?: (entry: BrowseEntry) => void
}) {
  if (viewMode === 'list') {
    return (
      <div className="space-y-1">
        {entries.map((entry) => (
          <button
            key={entry.path}
            onClick={() => onSelect(entry)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-left"
          >
            {entry.type === 'directory' ? (
              <Folder className="w-5 h-5 text-yellow-400 shrink-0" />
            ) : (() => {
              const { Icon, color } = getFileIcon(entry.name)
              return <Icon className={`w-5 h-5 ${color} shrink-0`} />
            })()}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">{entry.name}</p>
              {entry.description && (
                <p className="text-xs text-muted-foreground truncate">{entry.description}</p>
              )}
            </div>
            {entry.size !== undefined && (
              <span className="text-xs text-muted-foreground shrink-0">
                {formatBytes(entry.size)}
              </span>
            )}
            {entry.type === 'file' && onImport && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onImport(entry)
                }}
                className="p-1 rounded hover:bg-purple-500/20 text-muted-foreground hover:text-purple-400 transition-colors shrink-0"
                title="Import mission"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {entries.map((entry) => (
        <button
          key={entry.path}
          onClick={() => onSelect(entry)}
          className={cn(
            'flex flex-col items-center gap-2 p-4 rounded-lg border border-border',
            'hover:border-purple-500/30 hover:bg-secondary/30 transition-colors text-center'
          )}
        >
          {entry.type === 'directory' ? (
            <Folder className="w-8 h-8 text-yellow-400" />
          ) : (() => {
            const { Icon, color } = getFileIcon(entry.name)
            return <Icon className={`w-8 h-8 ${color}`} />
          })()}
          <p className="text-xs text-foreground truncate w-full">{entry.name}</p>
          {entry.size !== undefined && (
            <span className="text-2xs text-muted-foreground">{formatBytes(entry.size)}</span>
          )}
        </button>
      ))}
    </div>
  )
}
