/**
 * InstallerCard — Rich card for CNCF installer missions.
 * Shows category icon+gradient, maturity badge, difficulty, install methods, and import button.
 */

import { ExternalLink, Download } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  CNCF_CATEGORY_GRADIENTS,
  CNCF_CATEGORY_ICONS,
  MATURITY_CONFIG,
  DIFFICULTY_CONFIG,
} from '../../lib/cncf-constants'
import type { MissionExport } from '../../lib/missions/types'

interface InstallerCardProps {
  mission: MissionExport
  onImport: () => void
  onSelect: () => void
}

export function InstallerCard({ mission, onImport, onSelect }: InstallerCardProps) {
  const category = mission.category ?? 'Orchestration'
  const gradient = CNCF_CATEGORY_GRADIENTS[category] ?? ['#6366f1', '#8b5cf6']
  const iconPath = CNCF_CATEGORY_ICONS[category] ?? CNCF_CATEGORY_ICONS['Orchestration']
  const maturityTag = mission.tags?.find(t => ['graduated', 'incubating', 'sandbox'].includes(t))
  const maturity = maturityTag ? MATURITY_CONFIG[maturityTag] : null
  const difficulty = mission.difficulty ? DIFFICULTY_CONFIG[mission.difficulty] : null

  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card hover:border-purple-500/30 transition-all cursor-pointer group overflow-hidden"
      onClick={onSelect}
    >
      {/* Category gradient header with icon */}
      <div
        className="relative h-20 flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-10 h-10 text-white/80"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={iconPath} />
        </svg>
        {/* Category label */}
        <span className="absolute bottom-1.5 right-2 text-[10px] font-medium text-white/70 bg-black/20 px-1.5 py-0.5 rounded">
          {category}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-3 gap-2">
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-purple-400 transition-colors">
          {mission.title}
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-2">{mission.description}</p>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1 mt-auto">
          {maturity && (
            <span className={cn('inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full border', maturity.bg, maturity.color, maturity.border)}>
              {maturity.label}
            </span>
          )}
          {difficulty && (
            <span className={cn('inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full', difficulty.bg, difficulty.color)}>
              {mission.difficulty}
            </span>
          )}
          {mission.installMethods?.map(method => (
            <span key={method} className="px-1.5 py-0.5 text-[10px] rounded bg-secondary text-muted-foreground">
              {method}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-1 text-muted-foreground">
            {mission.cncfProject && (
              <a
                href={`https://www.cncf.io/projects/${mission.cncfProject}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 text-[10px] hover:text-purple-400 transition-colors"
                title="View on CNCF"
              >
                <ExternalLink className="w-3 h-3" />
                CNCF
              </a>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onImport()
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors"
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
