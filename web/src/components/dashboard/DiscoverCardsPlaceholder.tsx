/**
 * Discover Cards Placeholder — a separated suggestions section below the dashboard grid.
 *
 * Shows a carousel of available card previews with one-click add
 * without mixing teaser content into the live dashboard cards.
 */

import { useState, useEffect } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'

interface DiscoverCardsPlaceholderProps {
  existingCardTypes: string[]
  onAddCard: (cardType: string) => void
  onOpenCatalog: () => void
}

interface DiscoverableCard {
  type: string
  descriptionKey: string
  defaultDescription: string
}

/** Cards to preview in the carousel, ordered by general usefulness */
const DISCOVERABLE_CARDS: DiscoverableCard[] = [
  { type: 'gpu_overview', descriptionKey: 'dashboard.discover.cards.gpuOverview', defaultDescription: 'GPU utilization across clusters' },
  { type: 'node_status', descriptionKey: 'dashboard.discover.cards.nodeStatus', defaultDescription: 'Node health and capacity' },
  { type: 'security_issues', descriptionKey: 'dashboard.discover.cards.securityIssues', defaultDescription: 'Security audit findings' },
  { type: 'nightly_e2e_status', descriptionKey: 'dashboard.discover.cards.nightlyE2EStatus', defaultDescription: 'Nightly test results' },
  { type: 'helm_releases', descriptionKey: 'dashboard.discover.cards.helmReleases', defaultDescription: 'Helm release status' },
  { type: 'namespace_overview', descriptionKey: 'dashboard.discover.cards.namespaceOverview', defaultDescription: 'Namespace resource usage' },
  { type: 'workload_deployment', descriptionKey: 'dashboard.discover.cards.workloadDeployment', defaultDescription: 'Multi-cluster deployments' },
  { type: 'cost_overview', descriptionKey: 'dashboard.discover.cards.costOverview', defaultDescription: 'Resource cost breakdown' },
]

/** Interval between auto-rotating cards in the carousel */
const CAROUSEL_INTERVAL_MS = 4000
const MAX_VISIBLE_DOTS = 6

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
    <section
      className={cn(
        'mt-6 rounded-2xl border border-dashed border-border/60 bg-card/50 p-4 sm:p-5',
        'backdrop-blur-sm',
      )}
      aria-label={t('dashboard.discover.sectionLabel', 'Suggested cards')}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('dashboard.discover.sectionLabel', 'Suggested cards')}
          </p>
          <h2 className="text-base font-semibold text-foreground">
            {t('dashboard.discover.title', 'You might also like')}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t('dashboard.discover.description', 'Preview extra cards here, then add them to the live dashboard when you are ready.')}
          </p>
        </div>

        <div
          className={cn(
            'group w-full max-w-md rounded-xl border border-dashed border-border/70 bg-card/40 p-4',
            'shadow-sm transition-colors hover:border-accent/50 lg:flex-shrink-0',
          )}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <div className="flex flex-col gap-3 text-center">
            <div className="flex items-center justify-between gap-2">
              {available.length > 1 ? (
                <button
                  onClick={() => setCurrentIndex(prev => (prev - 1 + available.length) % available.length)}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-colors hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                  aria-label={t('dashboard.discover.previousCard', 'Previous card')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              ) : <span className="h-6 w-6" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('dashboard.discover.previewLabel', 'Card preview')}
                </div>
                <div className="truncate text-sm font-medium text-foreground">
                  {formatCardTitle(current.type)}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t(current.descriptionKey, current.defaultDescription)}
                </div>
              </div>
              {available.length > 1 ? (
                <button
                  onClick={() => setCurrentIndex(prev => (prev + 1) % available.length)}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-colors hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                  aria-label={t('dashboard.discover.nextCard', 'Next card')}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : <span className="h-6 w-6" aria-hidden="true" />}
            </div>

            {available.length > 1 && (
              <div className="flex justify-center gap-1">
                {available.slice(0, MAX_VISIBLE_DOTS).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      i === currentIndex % available.length ? 'bg-accent' : 'bg-muted-foreground/30',
                    )}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button
                variant="accent"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => onAddCard(current.type)}
              >
                {t('dashboard.discover.addThis', 'Add this card')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenCatalog}
              >
                {t('dashboard.discover.browseCatalog', 'Browse all')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
