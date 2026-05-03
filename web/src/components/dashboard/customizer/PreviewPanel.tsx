/**
 * PreviewPanel — right-side preview for the unified DashboardCustomizer.
 *
 * Shows card preview on hover (from card catalog) or template preview
 * on hover (from templates gallery). Hidden on mobile and when the
 * active section has nothing to preview (e.g. Navigation).
 */
import { useTranslation } from 'react-i18next'
import { Eye } from 'lucide-react'
import type { HoveredCard } from '../shared/cardCatalog'
import { visualizationIcons, wrapAbbreviations } from '../shared/cardCatalog'
import { CardPreview } from '../shared/CardPreview'

interface PreviewPanelProps {
  hoveredCard: HoveredCard | null
}

export function PreviewPanel({ hoveredCard }: PreviewPanelProps) {
  const { t } = useTranslation()
  const tCard = t as (key: string, defaultValue?: string) => string

  return (
    <div className="w-64 border-l border-border px-4 shrink-0 hidden lg:block">
      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
        {t('dashboard.addCard.preview', 'Preview')}
      </div>

      {hoveredCard ? (
        <div>
          <CardPreview card={hoveredCard} />
          <div className="mt-3 space-y-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                {tCard(`cards:titles.${hoveredCard.type}`, hoveredCard.title)}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {wrapAbbreviations(tCard(`cards:descriptions.${hoveredCard.type}`, hoveredCard.description))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-secondary text-xs text-foreground capitalize">
                {visualizationIcons[hoveredCard.visualization]} {hoveredCard.visualization}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-32 rounded-lg border border-dashed border-border/50 bg-secondary/20">
          <Eye className="w-6 h-6 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground/60 text-center px-4">
            {t('dashboard.addCard.hoverToPreview', 'Hover over a card to see a preview')}
          </p>
        </div>
      )}
    </div>
  )
}
