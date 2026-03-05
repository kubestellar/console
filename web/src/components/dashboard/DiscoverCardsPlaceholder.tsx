/**
 * Discover Cards Placeholder — an intentional empty slot in the dashboard grid.
 *
 * Shows a carousel of available card previews with one-click add.
 * Creates visual "pull" toward dashboard customization by making
 * the default layout feel intentionally incomplete.
 */

import { useState, useEffect } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatCardTitle } from '../../lib/formatCardTitle'

interface DiscoverCardsPlaceholderProps {
  existingCardTypes: string[]
  onAddCard: (cardType: string) => void
  onOpenCatalog: () => void
}

/** Cards to preview in the carousel, ordered by general usefulness */
const DISCOVERABLE_CARDS = [
  { type: 'gpu_overview', description: 'GPU utilization across clusters' },
  { type: 'node_status', description: 'Node health and capacity' },
  { type: 'security_issues', description: 'Security audit findings' },
  { type: 'nightly_e2e_status', description: 'Nightly test results' },
  { type: 'helm_releases', description: 'Helm release status' },
  { type: 'namespace_overview', description: 'Namespace resource usage' },
  { type: 'workload_deployment', description: 'Multi-cluster deployments' },
  { type: 'cost_overview', description: 'Resource cost breakdown' },
]

/** Interval between auto-rotating cards in the carousel */
const CAROUSEL_INTERVAL_MS = 4000

export function DiscoverCardsPlaceholder({
  existingCardTypes,
  onAddCard,
  onOpenCatalog,
}: DiscoverCardsPlaceholderProps) {
  const { t } = useTranslation()

  // Filter out cards the user already has
  const available = DISCOVERABLE_CARDS.filter(c => !existingCardTypes.includes(c.type))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovering, setIsHovering] = useState(false)

  // Auto-rotate carousel when not hovering
  useEffect(() => {
    if (available.length <= 1 || isHovering) return
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % available.length)
    }, CAROUSEL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [available.length, isHovering])

  // Nothing to suggest
  if (available.length === 0) return null

  const current = available[currentIndex % available.length]

  return (
    <div
      className="h-full glass rounded-xl border-2 border-dashed border-border/50 hover:border-purple-500/40 transition-all group"
      style={{ gridColumn: 'span 4', gridRow: 'span 3' }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-3">
        {/* Carousel card preview */}
        <div className="w-full flex items-center justify-between gap-2">
          {available.length > 1 && (
            <button
              onClick={() => setCurrentIndex(prev => (prev - 1 + available.length) % available.length)}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {formatCardTitle(current.type)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {current.description}
            </div>
          </div>
          {available.length > 1 && (
            <button
              onClick={() => setCurrentIndex(prev => (prev + 1) % available.length)}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Carousel dots */}
        {available.length > 1 && (
          <div className="flex gap-1">
            {available.slice(0, 6).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === currentIndex % available.length
                    ? 'bg-purple-400'
                    : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => onAddCard(current.type)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('dashboard.discover.addThis', 'Add this card')}
          </button>
          <button
            onClick={onOpenCatalog}
            className="px-3 py-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            {t('dashboard.discover.browseCatalog', 'Browse all')}
          </button>
        </div>
      </div>
    </div>
  )
}
