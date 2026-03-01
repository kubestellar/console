/**
 * SolutionCard — Card for browsing solution missions (troubleshoot, repair, analyze, etc.).
 * Shows type badge, category, tags, description, and import button.
 */

import { cn } from '../../lib/cn'
import type { MissionExport } from '../../lib/missions/types'

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  troubleshoot: { bg: 'bg-orange-500/15', color: 'text-orange-400' },
  repair: { bg: 'bg-red-500/15', color: 'text-red-400' },
  analyze: { bg: 'bg-blue-500/15', color: 'text-blue-400' },
  upgrade: { bg: 'bg-green-500/15', color: 'text-green-400' },
  deploy: { bg: 'bg-purple-500/15', color: 'text-purple-400' },
  custom: { bg: 'bg-gray-500/15', color: 'text-gray-400' },
}

interface SolutionCardProps {
  mission: MissionExport
  onImport: () => void
  onSelect: () => void
}

export function SolutionCard({ mission, onImport, onSelect }: SolutionCardProps) {
  const typeStyle = TYPE_COLORS[mission.type] ?? TYPE_COLORS.custom

  return (
    <div
      className="flex flex-col p-3 rounded-lg border border-border bg-card hover:border-purple-500/30 transition-colors cursor-pointer group"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-purple-400 transition-colors">
          {mission.title}
        </h4>
        <span className={cn('flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full', typeStyle.bg, typeStyle.color)}>
          {mission.type}
        </span>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{mission.description}</p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-2 mt-auto">
        {mission.category && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
            {mission.category}
          </span>
        )}
        {mission.tags?.slice(0, 3).map(tag => (
          <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-secondary text-muted-foreground">
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
              className="inline-flex items-center gap-1 text-[10px] hover:text-purple-400 transition-colors"
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
            <span className="text-[10px]">{mission.steps?.length ?? 0} steps</span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onImport()
          }}
          className="px-2 py-1 text-[10px] font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors flex-shrink-0"
        >
          Import
        </button>
      </div>
    </div>
  )
}
