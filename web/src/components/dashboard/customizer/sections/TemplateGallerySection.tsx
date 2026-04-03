/**
 * TemplateGallerySection — template gallery within Dashboard Studio.
 *
 * Reuses the existing TemplatesModal content inline.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES, DashboardTemplate } from '../../templates'
import { formatCardTitle } from '../../../../lib/formatCardTitle'

/** Card type to color mapping for visual preview */
const CARD_COLORS: Record<string, string> = {
  cluster_health: 'bg-green-500/40',
  resource_usage: 'bg-blue-500/40',
  cluster_metrics: 'bg-purple-500/40',
  pod_issues: 'bg-red-500/40',
  deployment_status: 'bg-green-500/40',
  event_stream: 'bg-yellow-500/40',
  gpu_overview: 'bg-cyan-500/40',
}

const DEFAULT_CARD_COLOR = 'bg-secondary/60'

/** Duration to show "Applied" confirmation before reverting button text */
const APPLIED_CONFIRMATION_MS = 2000

interface TemplateGallerySectionProps {
  onApplyTemplate: (template: DashboardTemplate) => void
}

export function TemplateGallerySection({ onApplyTemplate }: TemplateGallerySectionProps) {
  const { t } = useTranslation()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null)

  const filteredTemplates = selectedCategory === 'all'
    ? DASHBOARD_TEMPLATES
    : DASHBOARD_TEMPLATES.filter(tpl => tpl.category === selectedCategory)

  const handleApply = (template: DashboardTemplate) => {
    onApplyTemplate(template)
    setAppliedTemplate(template.id)
    setTimeout(() => setAppliedTemplate(null), APPLIED_CONFIRMATION_MS)
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            selectedCategory === 'all'
              ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50'
              : 'bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('dashboard.templates.all', 'All')}
        </button>
        {(TEMPLATE_CATEGORIES || []).map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectedCategory === cat.id
                ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/50'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-4">
        {filteredTemplates.map(template => (
          <div
            key={template.id}
            className="border border-border rounded-lg overflow-hidden hover:border-purple-500/30 transition-colors"
          >
            {/* Mini layout preview */}
            <div className="p-3 bg-secondary/20">
              <div className="grid grid-cols-3 gap-1 h-16">
                {(template.cards || []).slice(0, 6).map((card, i) => (
                  <div
                    key={i}
                    className={`rounded ${CARD_COLORS[card.card_type] || DEFAULT_CARD_COLOR}`}
                    title={formatCardTitle(card.card_type)}
                  />
                ))}
              </div>
            </div>

            {/* Info */}
            <div className="p-3">
              <h4 className="text-sm font-medium text-foreground">{template.name}</h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-2xs text-muted-foreground">
                  {(template.cards || []).length} {t('dashboard.addCard.cards', 'cards')}
                </span>
                <button
                  onClick={() => handleApply(template)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    appliedTemplate === template.id
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                  }`}
                >
                  {appliedTemplate === template.id ? (
                    <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Applied</span>
                  ) : (
                    t('dashboard.templates.apply', 'Apply')
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
