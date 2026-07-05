import { useState } from 'react'
import { Download, Sparkles, Check, Trash2, Loader2 } from 'lucide-react'
import type { MarketplaceItem } from '../../hooks/useMarketplace'
import { AuthorBadge, DifficultyBadge } from './MarketplaceBadges'
import { TYPE_LABELS, MATURITY_CONFIG, ISSUES_URL } from './marketplaceConstants'
import { validateExternalUrl } from '../../lib/validateExternalUrl'

export function MarketplaceRow({ item, onInstall, onRemove, isInstalled }: {
  item: MarketplaceItem
  onInstall: (item: MarketplaceItem) => void
  onRemove: (item: MarketplaceItem) => void
  isInstalled: boolean
}) {
  const [installing, setInstalling] = useState(false)
  const [removing, setRemoving] = useState(false)
  const isHelpWanted = item.status === 'help-wanted'
  const typeInfo = TYPE_LABELS[item.type]

  const handleInstall = async () => {
    setInstalling(true)
    try { await onInstall(item) } finally { setInstalling(false) }
  }
  const handleRemove = async () => {
    setRemoving(true)
    try { await onRemove(item) } finally { setRemoving(false) }
  }

  return (
    <div className={`flex items-center gap-4 px-4 py-2.5 bg-card border rounded-md transition-colors hover:bg-muted/30 ${
      isHelpWanted ? 'border-dashed border-yellow-500/20' : 'border-border'
    }`}>
      {/* Type icon */}
      <typeInfo.icon className="w-4 h-4 text-muted-foreground shrink-0" />

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
          {item.cncfProject && (
            <span className={`text-[9px] font-medium px-1 py-0.5 rounded border ${MATURITY_CONFIG[item.cncfProject.maturity].color}`}>
              {item.cncfProject.maturity === 'graduated' ? 'Grad' : 'Incub'}
            </span>
          )}
          {isHelpWanted && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-300 border border-yellow-500/20 rounded">
              Help Wanted
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
      </div>

      {/* Author */}
      <span className="text-xs text-muted-foreground shrink-0 w-24 truncate hidden sm:block">
        <AuthorBadge author={item.author} github={item.authorGithub} compact />
      </span>

      {/* Type label */}
      <span className="text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 hidden md:block">
        {typeInfo.label.replace(/s$/, '')}
      </span>

      {/* Difficulty (for help-wanted) */}
      {isHelpWanted && item.difficulty ? (
        <div className="shrink-0 hidden lg:block">
          <DifficultyBadge difficulty={item.difficulty} />
        </div>
      ) : (
        <span className="text-2xs text-muted-foreground shrink-0 w-10 text-right hidden lg:block">v{item.version}</span>
      )}

      {/* Action */}
      <div className="shrink-0">
        {isHelpWanted ? (
          <a
            href={validateExternalUrl(item.issueUrl) || ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Contribute
          </a>
        ) : isInstalled ? (
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-0.5 px-2 py-1 text-2xs font-medium text-green-400 bg-green-500/10 rounded">
              <Check className="w-3 h-3" />
            </span>
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center px-1.5 py-1 text-2xs text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
            >
              {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors disabled:opacity-50"
          >
            {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Install
          </button>
        )}
      </div>
    </div>
  )
}
