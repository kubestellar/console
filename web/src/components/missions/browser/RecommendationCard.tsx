import { useState, useRef } from 'react'
import { CheckCircle, Check, Link } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { StatusBadge } from '../../ui/StatusBadge'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import type { MissionMatch } from '../../../lib/missions/types'

export function RecommendationCard({
  match,
  onSelect,
  onImport,
  onCopyLink,
}: {
  match: MissionMatch
  onSelect: () => void
  onImport: () => void
  onCopyLink?: (e: React.MouseEvent) => void
}) {
  const { mission, score, matchPercent, matchReasons } = match
  const isClusterMatch = score > 1
  const [linkCopied, setLinkCopied] = useState(false)
  const linkCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div
      className="flex flex-col p-3 rounded-lg border border-border bg-card hover:border-purple-500/30 transition-colors cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-purple-400 transition-colors">
          {mission.title}
        </h4>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onCopyLink && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCopyLink(e)
                setLinkCopied(true)
                if (linkCopyTimerRef.current) clearTimeout(linkCopyTimerRef.current)
                linkCopyTimerRef.current = setTimeout(() => setLinkCopied(false), UI_FEEDBACK_TIMEOUT_MS)
              }}
              className="p-0.5 rounded text-muted-foreground/50 hover:text-purple-400 transition-colors"
              title="Copy shareable link"
            >
              {linkCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Link className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        <span className={cn(
          'flex items-center gap-1 px-1.5 py-0.5 text-2xs rounded-full flex-shrink-0 font-medium tabular-nums',
          matchPercent >= 80
            ? 'bg-green-500/15 text-green-400 border border-green-500/20'
            : matchPercent >= 50
              ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
        )} title={`Match score: ${score}`}>
          {isClusterMatch && <CheckCircle className="w-3 h-3" />}
          {matchPercent}%
        </span>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{mission.description}</p>

      {matchReasons.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {matchReasons.slice(0, 2).map((reason, i) => (
            <span key={i} className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium',
              isClusterMatch
                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            )}>
              {isClusterMatch ? '✓' : '💡'} {reason}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="px-1.5 py-0.5 text-2xs rounded bg-secondary text-muted-foreground">
            {mission.type}
          </span>
          {mission.metadata?.projectVersion && (
            <StatusBadge color="blue" size="xs" variant="outline">
              v{mission.metadata.projectVersion}
            </StatusBadge>
          )}
          {mission.metadata?.maturity && (
            <span className={cn(
              'px-1.5 py-0.5 text-2xs rounded border font-medium',
              mission.metadata.maturity === 'graduated'
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : mission.metadata.maturity === 'incubating'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
            )}>
              {mission.metadata.maturity}
            </span>
          )}
          {mission.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-2xs rounded bg-secondary text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onImport()
          }}
          className="px-2 py-1 text-2xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
        >
          Import
        </button>
      </div>
    </div>
  )
}
