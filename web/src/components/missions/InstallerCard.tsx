/**
 * InstallerCard — Rich card for CNCF installer missions.
 * Shows category icon+gradient, maturity badge, difficulty, install methods, and import button.
 */

import { ExternalLink, Download, Wrench, Trash2, ArrowUpCircle, AlertTriangle } from 'lucide-react'
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
  compact?: boolean
}

export function InstallerCard({ mission, onImport, onSelect, compact }: InstallerCardProps) {
  const category = mission.category ?? 'Orchestration'
  const gradient = CNCF_CATEGORY_GRADIENTS[category] ?? ['#6366f1', '#8b5cf6']
  const iconPath = CNCF_CATEGORY_ICONS[category] ?? CNCF_CATEGORY_ICONS['Orchestration']
  const maturityTag = mission.tags?.find(t => ['graduated', 'incubating', 'sandbox'].includes(t))
  const maturity = maturityTag ? MATURITY_CONFIG[maturityTag] : null
  const difficulty = mission.difficulty ? DIFFICULTY_CONFIG[mission.difficulty] : null
  // Strip repetitive "Install and Configure … on Kubernetes" prefix/suffix for cleaner cards
  const shortTitle = (mission.title ?? '')
    .replace(/^Install and Configure\s+/i, '')
    .replace(/\s+on Kubernetes$/i, '')

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card hover:border-purple-500/30 transition-all cursor-pointer group"
        onClick={onSelect}
      >
        <div
          className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d={iconPath} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground truncate group-hover:text-purple-400 transition-colors">
            {shortTitle || mission.title}
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('text-[10px]', mission.steps?.length ? 'text-green-400' : 'text-muted-foreground/30')} title="Install"><Download className="w-3 h-3" /></span>
          <span className={cn('text-[10px]', mission.uninstall?.length ? 'text-red-400' : 'text-muted-foreground/30')} title="Uninstall"><Trash2 className="w-3 h-3" /></span>
          <span className={cn('text-[10px]', mission.upgrade?.length ? 'text-blue-400' : 'text-muted-foreground/30')} title="Upgrade"><ArrowUpCircle className="w-3 h-3" /></span>
          <span className={cn('text-[10px]', mission.troubleshooting?.length ? 'text-yellow-400' : 'text-muted-foreground/30')} title="Troubleshoot"><AlertTriangle className="w-3 h-3" /></span>
        </div>
        {maturity && (
          <span className={cn('px-1.5 py-0.5 text-[10px] font-medium rounded-full border flex-shrink-0', maturity.bg, maturity.color, maturity.border)}>
            {maturity.label}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onImport() }}
          className="px-2 py-1 text-[10px] font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors flex-shrink-0"
        >
          <Download className="w-3 h-3" />
        </button>
      </div>
    )
  }

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
        <h4 className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-purple-400 transition-colors inline-flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          {shortTitle || mission.title}
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

        {/* Section coverage icons */}
        <div className="flex items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-0.5 text-[10px]', mission.steps?.length ? 'text-green-400' : 'text-muted-foreground/30')} title={mission.steps?.length ? `Install: ${mission.steps.length} steps` : 'No install steps'}>
            <Download className="w-3 h-3" />
          </span>
          <span className={cn('inline-flex items-center gap-0.5 text-[10px]', mission.uninstall?.length ? 'text-red-400' : 'text-muted-foreground/30')} title={mission.uninstall?.length ? `Uninstall: ${mission.uninstall.length} steps` : 'No uninstall steps'}>
            <Trash2 className="w-3 h-3" />
          </span>
          <span className={cn('inline-flex items-center gap-0.5 text-[10px]', mission.upgrade?.length ? 'text-blue-400' : 'text-muted-foreground/30')} title={mission.upgrade?.length ? `Upgrade: ${mission.upgrade.length} steps` : 'No upgrade steps'}>
            <ArrowUpCircle className="w-3 h-3" />
          </span>
          <span className={cn('inline-flex items-center gap-0.5 text-[10px]', mission.troubleshooting?.length ? 'text-yellow-400' : 'text-muted-foreground/30')} title={mission.troubleshooting?.length ? `Troubleshooting: ${mission.troubleshooting.length} steps` : 'No troubleshooting steps'}>
            <AlertTriangle className="w-3 h-3" />
          </span>
        </div>

        {/* Author + Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-muted-foreground min-w-0">
            {mission.authorGithub && (
              <a
                href={`https://github.com/${mission.authorGithub}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10px] hover:text-purple-400 transition-colors group/author"
                title={mission.author ?? mission.authorGithub}
              >
                <img
                  src={`https://github.com/${mission.authorGithub}.png?size=32`}
                  alt={mission.authorGithub}
                  className="w-4 h-4 rounded-full"
                />
                <span className="truncate max-w-[80px]">{mission.authorGithub}</span>
              </a>
            )}
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
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition-colors flex-shrink-0"
          >
            <Download className="w-3 h-3" />
            Install
          </button>
        </div>
      </div>
    </div>
  )
}
