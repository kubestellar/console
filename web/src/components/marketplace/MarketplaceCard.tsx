import { useState } from 'react'
import { Download, Loader2, Check, Trash2, HandHelping, Sparkles, LayoutGrid, Puzzle, Palette } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MarketplaceItem, MarketplaceItemType } from '../../hooks/useMarketplace'
import { MarketplaceThumbnail } from './MarketplaceThumbnail'
import { AuthorBadge } from './AuthorBadge'
import { DifficultyBadge } from './DifficultyBadge'
import { validateExternalUrl } from '../../lib/validateExternalUrl'

const ISSUES_URL = 'https://github.com/kubestellar/console-marketplace/issues?q=is%3Aissue%20is%3Aopen%20field.label%3Ahelp%20wanted'
const MAX_SKILLS = 3
const MAX_TAGS = 3
const MAX_THEME_COLORS = 5

const TYPE_LABELS: Record<MarketplaceItemType, { label: string; icon: typeof LayoutGrid }> = {
  dashboard: { label: 'Dashboards', icon: LayoutGrid },
  'card-preset': { label: 'Card Presets', icon: Puzzle },
  theme: { label: 'Themes', icon: Palette } }

const MATURITY_CONFIG = {
  graduated: { label: 'Graduated', color: 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950 border-green-300 dark:border-green-800' },
  incubating: { label: 'Incubating', color: 'text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-800' } } as const

export function MarketplaceCard({ item, onInstall, onRemove, isInstalled }: {
  item: MarketplaceItem
  onInstall: (item: MarketplaceItem) => void
  onRemove: (item: MarketplaceItem) => void
  isInstalled: boolean
}) {
  const { t } = useTranslation()
  const [installing, setInstalling] = useState(false)
  const [removing, setRemoving] = useState(false)

  const isHelpWanted = item.status === 'help-wanted'
  const typeInfo = TYPE_LABELS[item.type]

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await onInstall(item)
    } finally {
      setInstalling(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await onRemove(item)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className={`group bg-card border rounded-lg overflow-hidden transition-all hover:shadow-lg ${
      isHelpWanted
        ? 'border-dashed border-yellow-500/20 hover:border-yellow-500/40'
        : 'border-border hover:border-primary/30'
    }`}>
      {/* Thumbnail */}
      <div className="relative">
        {item.screenshot ? (
          <div className="h-20 bg-muted overflow-hidden">
            <img
              src={item.screenshot}
              alt={item.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>
        ) : (
          <MarketplaceThumbnail
            itemId={item.id}
            itemType={item.type}
            className="group-hover:scale-105 transition-transform duration-300 origin-center"
            cncfCategory={item.cncfProject?.category}
            isHelpWanted={isHelpWanted}
          />
        )}
        {/* Help Wanted badge */}
        {isHelpWanted && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 text-2xs font-semibold bg-yellow-500/10 text-yellow-600 dark:text-yellow-300 border border-yellow-500/20 rounded-md">
            <HandHelping className="w-3 h-3" />
            Help Wanted
          </div>
        )}
        {/* CNCF badge — only shown on non-gradient thumbnails (gradient header already shows category) */}
        {item.cncfProject && !item.cncfProject.category && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold bg-card text-muted-foreground rounded border border-border">
            CNCF
          </div>
        )}
      </div>

      <div className="p-4">
        {/* Title + type + version */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="text-sm font-semibold text-foreground line-clamp-1">{item.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <span className="flex items-center gap-0.5 text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              <typeInfo.icon className="w-2.5 h-2.5" />
              {typeInfo.label.replace(/s$/, '')}
            </span>
            <span className="text-2xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              v{item.version}
            </span>
          </div>
        </div>

        {/* Maturity pill */}
        {item.cncfProject && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`text-2xs font-medium px-1.5 py-0.5 rounded border ${MATURITY_CONFIG[item.cncfProject.maturity].color}`}>
              {MATURITY_CONFIG[item.cncfProject.maturity].label}
            </span>
            <span className="text-2xs text-muted-foreground">{item.cncfProject.category}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{item.description}</p>

        {/* Tags / Skills */}
        <div className="flex flex-wrap gap-1 mb-3">
          {isHelpWanted && item.skills ? (
            (item.skills || []).slice(0, MAX_SKILLS).map(skill => (
              <span key={skill} className="text-2xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                {skill}
              </span>
            ))
          ) : (
            (item.tags || []).slice(0, MAX_TAGS).map(tag => (
              <span key={tag} className="text-2xs px-1.5 py-0.5 bg-primary/80 text-primary-foreground rounded">
                {tag}
              </span>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isHelpWanted && item.difficulty ? (
              <DifficultyBadge difficulty={item.difficulty} />
            ) : (
              <>
                <AuthorBadge author={item.author} github={item.authorGithub} />
                <span>&middot;</span>
                {item.type === 'theme' && item.themeColors ? (
                  <div className="flex gap-0.5">
                    {(item.themeColors || []).slice(0, MAX_THEME_COLORS).map((color, i) => (
                      <div key={i} className="w-3 h-3 rounded-full border border-border/50" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                ) : item.type === 'card-preset' ? (
                  <span className="flex items-center gap-1">
                    <typeInfo.icon className="w-3 h-3" />
                    1 card
                  </span>
                ) : (
                  <span>{item.cardCount} cards</span>
                )}
              </>
            )}
          </div>

          {/* Action button */}
          {isHelpWanted ? (
            <a
              href={validateExternalUrl(item.issueUrl) || ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 rounded-md transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Contribute
            </a>
          ) : isInstalled ? (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 px-2 py-1 text-2xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950 rounded">
                <Check className="w-3 h-3" />
                Installed
              </span>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center gap-1 px-2 py-1 text-2xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950 rounded transition-colors disabled:opacity-50"
                title={t('common.remove')}
              >
                {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            </div>
          ) : (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/80 hover:bg-primary text-primary-foreground rounded-md transition-colors disabled:opacity-50"
            >
              {installing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
