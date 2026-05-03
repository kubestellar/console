/**
 * TemplateGallerySection — template gallery within Dashboard Studio.
 *
 * Reuses the existing TemplatesModal content inline.
 */
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Search } from 'lucide-react'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES, DashboardTemplate } from '../../templates'
import { formatCardTitle } from '../../../../lib/formatCardTitle'
import { getIcon } from '../../../../lib/icons'

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
  /** Replace all cards with collection's cards */
  onReplaceWithTemplate: (template: DashboardTemplate) => void
  /** Add collection's cards to existing cards */
  onAddTemplate: (template: DashboardTemplate) => void
  /** Dashboard name for context */
  dashboardName?: string
}

export function TemplateGallerySection({ onReplaceWithTemplate, onAddTemplate, dashboardName }: TemplateGallerySectionProps) {
  const { t } = useTranslation()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null)
  const appliedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (appliedTimerRef.current) clearTimeout(appliedTimerRef.current) }, [])

  const filteredTemplates = DASHBOARD_TEMPLATES.filter(tpl => {
    const matchesCategory = selectedCategory === 'all' || tpl.category === selectedCategory
    const matchesSearch = !searchText.trim() || tpl.name.toLowerCase().includes(searchText.toLowerCase()) || tpl.description.toLowerCase().includes(searchText.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const handleAdd = (template: DashboardTemplate) => {
    onAddTemplate(template)
    setAppliedTemplate(template.id)
    appliedTimerRef.current = setTimeout(() => setAppliedTemplate(null), APPLIED_CONFIRMATION_MS)
  }

  const handleReplace = (template: DashboardTemplate) => {
    onReplaceWithTemplate(template)
    setAppliedTemplate(template.id)
    appliedTimerRef.current = setTimeout(() => setAppliedTemplate(null), APPLIED_CONFIRMATION_MS)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
      {/* Description — same pattern as Cards section */}
      <div className="mb-3">
        <p className="text-xs text-muted-foreground mb-2">
          Pre-built card sets you can add to the {dashboardName ? `${dashboardName} dashboard` : 'current dashboard'} or use to replace all existing cards
        </p>
        {/* Search/filter bar — matches Cards section layout */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); if (!e.target.value) setSelectedCategory('all') }}
            placeholder="Search collections..."
            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
          />
        </div>
        {/* Category quick-filter pills */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-xs text-muted-foreground mr-1">Filter:</span>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
              selectedCategory === 'all'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
          {(TEMPLATE_CATEGORIES || []).map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {(() => { const CatIcon = getIcon(cat.icon); return <CatIcon className="w-3 h-3 inline mr-1" /> })()} {cat.name}
            </button>
          ))}
        </div>
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
              <h4 className="text-sm font-medium text-foreground">{template.name} Collection</h4>
              <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {(template.cards || []).map(c => formatCardTitle(c.card_type)).join(', ')}
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted-foreground">
                  {(template.cards || []).length} {t('dashboard.addCard.cards', 'cards')}
                </span>
                {appliedTemplate === template.id ? (
                  <span className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400">
                    <Check className="w-3 h-3" /> Applied
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleAdd(template)}
                      className="px-3 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
                      title="Add these cards to your existing dashboard cards"
                    >
                      + Add
                    </button>
                    <button
                      onClick={() => handleReplace(template)}
                      className="px-3 py-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Replace all current cards with this collection"
                    >
                      Replace
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}
