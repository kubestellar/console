/**
 * FixerCard — Card for browsing fixer missions (troubleshoot, repair, analyze, etc.).
 * Shows type badge, category, tags, description, and import button.
 */

import { useState, useEffect, useRef } from 'react'
import { Link, Check } from 'lucide-react'
import { cn } from '../../lib/cn'
import { StatusBadge } from '../ui/StatusBadge'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import type { MissionExport } from '../../lib/missions/types'

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  troubleshoot: { bg: 'bg-orange-500/15', color: 'text-orange-400' },
  repair: { bg: 'bg-red-500/15', color: 'text-red-400' },
  analyze: { bg: 'bg-blue-500/15', color: 'text-blue-400' },
  upgrade: { bg: 'bg-green-500/15', color: 'text-green-400' },
  deploy: { bg: 'bg-purple-500/15', color: 'text-purple-400' },
  custom: { bg: 'bg-gray-500/15', color: 'text-muted-foreground' },
}

interface FixerCardProps {
  mission: MissionExport
  onImport: () => void
  onSelect: () => void
  onCopyLink?: (e: React.MouseEvent) => void
  compact?: boolean
}

export function FixerCard({ mission, onImport, onSelect, onCopyLink, compact }: FixerCardProps) {
  const [linkCopied, setLinkCopied] = useState(false)
  const typeStyle = TYPE_COLORS[mission.type] ?? TYPE_COLORS.custom
  const linkCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
    }
  }, [])

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card hover:border-purple-500/30 transition-all cursor-pointer group"
        onClick={onSelect}
      >
        <span className={cn('shrink-0 px-1.5 py-0.5 text-2xs font-medium rounded-full', typeStyle.bg, typeStyle.color)}>
          {mission.type}
        </span>
        <h4 className="flex-1 text-sm font-medium text-foreground truncate group-hover:text-purple-400 transition-colors">
          {mission.title}
        </h4>
        {mission.category && (
          <StatusBadge color="purple" size="xs" variant="outline" className="shrink-0">
            {mission.category}
          </StatusBadge>
        )}
        <span className="text-2xs text-muted-foreground shrink-0">{mission.steps?.length ?? 0} steps</span>
        <button
          onClick={(e) => { e.stopPropagation(); onImport() }}
          className="px-2 py-1 text-2xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors shrink-0"
        >
          Import
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col p-3 rounded-lg border border-border bg-card hover:border-purple-500/30 transition-colors cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-purple-400 transition-colors">
          {mission.title}
        </h4>
        <div className="flex items-center gap-1 shrink-0">
          {onCopyLink && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCopyLink(e)
                setLinkCopied(true)
                if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
                linkCopiedTimeoutRef.current = setTimeout(() => setLinkCopied(false), UI_FEEDBACK_TIMEOUT_MS)
              }}
              className="p-0.5 rounded text-muted-foreground/50 hover:text-purple-400 transition-colors"
              title="Copy shareable link"
              aria-label={linkCopied ? 'Link copied' : 'Copy shareable link'}
            >
              {linkCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Link className="w-3.5 h-3.5" />}
            </button>
          )}
          <span className={cn('px-1.5 py-0.5 text-2xs font-medium rounded-full', typeStyle.bg, typeStyle.color)}>
            {mission.type}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{mission.description}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-2 mt-auto">
        {mission.category && (
          <StatusBadge color="purple" size="xs" variant="outline">
            {mission.category}
          </StatusBadge>
        )}
        {mission.tags?.slice(0, 3).map(tag => (
          <span key={tag} className="px-1.5 py-0.5 text-2xs rounded bg-secondary text-muted-foreground">
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          {mission.authorGithub ? (
            <a
              href={`https://github.com/${mission.authorGithub}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-2xs hover:text-purple-400 transition-colors"
              title={mission.author ?? mission.authorGithub}
            >
              <img
                src={`https://github.com/${mission.authorGithub}.png?size=32`}
                alt={mission.authorGithub}
                className="w-4 h-4 rounded-full"
              />
              <span className="truncate max-w-[80px]">{mission.authorGithub}</span>
            </a>
          ) : (
            <span className="text-2xs">{mission.steps?.length ?? 0} steps</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onCopyLink && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCopyLink(e)
                setLinkCopied(true)
                if (linkCopiedTimeoutRef.current !== null) clearTimeout(linkCopiedTimeoutRef.current)
                linkCopiedTimeoutRef.current = setTimeout(() => setLinkCopied(false), UI_FEEDBACK_TIMEOUT_MS)
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-2xs font-medium rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              title="Copy shareable link"
            >
              {linkCopied ? <Check className="w-3 h-3 text-green-400" /> : <Link className="w-3 h-3" />}
              {linkCopied ? 'Copied' : 'Share'}
            </button>
          )}
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
    </div>
  )
}
