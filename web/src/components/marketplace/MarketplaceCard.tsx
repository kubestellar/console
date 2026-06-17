import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, Download, Trash2, Check, Sparkles, HandHelping, Star, Coins,
  LayoutGrid, Puzzle, Palette } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthorProfile, type MarketplaceItem, type MarketplaceItemType } from '../../hooks/useMarketplace'
import { MarketplaceThumbnail } from './MarketplaceThumbnail'
import { validateExternalUrl } from '../../lib/validateExternalUrl'
import { ISSUES_URL } from './MarketplaceBanner'

export const TYPE_LABELS: Record<MarketplaceItemType, { label: string; icon: typeof LayoutGrid }> = {
  dashboard: { label: 'Dashboards', icon: LayoutGrid },
  'card-preset': { label: 'Card Presets', icon: Puzzle },
  theme: { label: 'Themes', icon: Palette } }

export const DIFFICULTY_CONFIG = {
  beginner: { label: 'Beginner', color: 'text-green-400 bg-green-950', stars: 1 },
  intermediate: { label: 'Intermediate', color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10', stars: 2 },
  advanced: { label: 'Advanced', color: 'text-red-400 bg-red-950', stars: 3 } } as const

export const MATURITY_CONFIG = {
  graduated: { label: 'Graduated', color: 'text-green-400 bg-green-950 border-green-800' },
  incubating: { label: 'Incubating', color: 'text-blue-400 bg-blue-950 border-blue-800' } } as const

const MAX_SKILLS = 3
const MAX_TAGS = 3
const MAX_THEME_COLORS = 5

// --- Author Badge with Hover Profile Card ---
export function AuthorBadge({ author, github, compact }: { author: string; github?: string; compact?: boolean }) {
  const [hovered, setHovered] = useState(false)
  const triggerRef = useRef<HTMLAnchorElement | HTMLSpanElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const profile = useAuthorProfile(github, hovered)

  const updatePos = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: rect.top - 8 })
  }

  const handleEnter = () => {
    updatePos()
    setHovered(true)
  }

  // Dismiss tooltip on scroll (fix #6007).
  useEffect(() => {
    if (!hovered) return
    const dismiss = () => setHovered(false)
    window.addEventListener('scroll', dismiss, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', dismiss, { capture: true })
  }, [hovered])

  if (!github) {
    return <span>{author}</span>
  }

  const link = (
    <a
      ref={triggerRef as React.RefObject<HTMLAnchorElement | null>}
      href={`https://github.com/${github}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary/80 hover:text-primary transition-colors hover:underline"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      @{github}
    </a>
  )

  if (compact) return link

  return (
    <>
      {link}
      {createPortal(
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.15 }}
              className="fixed z-dropdown pointer-events-none"
              style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -100%)' }}
            >
              <div className="px-4 py-3 bg-background border border-border rounded-lg shadow-xl backdrop-blur-xs min-w-[200px]">
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={`https://github.com/${github}.png?size=80`}
                    alt={github}
                    className="w-10 h-10 rounded-full border border-border"
                    loading="lazy"
                    width={40}
                    height={40}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">@{github}</div>
                    <div className="text-2xs text-muted-foreground">Contributor</div>
                  </div>
                </div>
                {profile.loading ? (
                  <div className="text-[11px] text-muted-foreground">Loading stats...</div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Coins className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-yellow-300 font-medium">{profile.coins.toLocaleString()} coins</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {profile.consolePRs} PR{profile.consolePRs !== 1 ? 's' : ''} to console
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {profile.marketplacePRs} PR{profile.marketplacePRs !== 1 ? 's' : ''} to marketplace
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

export function DifficultyBadge({ difficulty }: { difficulty: 'beginner' | 'intermediate' | 'advanced' }) {
  const config = DIFFICULTY_CONFIG[difficulty]
  return (
    <span className={`flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded ${config.color}`}>
      {Array.from({ length: config.stars }).map((_, i) => (
        <Star key={i} className="w-2.5 h-2.5 fill-current" />
      ))}
      {config.label}
    </span>
  )
}

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
        {/* CNCF badge — only shown on non-gradient thumbnails */}
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-md transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Contribute
            </a>
          ) : isInstalled ? (
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 px-2 py-1 text-2xs font-medium text-green-400 bg-green-950 rounded">
                <Check className="w-3 h-3" />
                Installed
              </span>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex items-center gap-1 px-2 py-1 text-2xs text-red-400 hover:bg-red-950 rounded transition-colors disabled:opacity-50"
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
