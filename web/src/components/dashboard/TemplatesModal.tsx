import { useState, useEffect } from 'react'
import { Layout, ChevronRight, Check } from 'lucide-react'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES, DashboardTemplate } from './templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { BaseModal } from '../../lib/modals'

interface TemplatesModalProps {
  isOpen: boolean
  onClose: () => void
  onApplyTemplate: (template: DashboardTemplate) => void
}

// Card type to color mapping for visual preview
const CARD_COLORS: Record<string, string> = {
  cluster_health: 'bg-green-500/40',
  resource_usage: 'bg-blue-500/40',
  cluster_metrics: 'bg-purple-500/40',
  pod_issues: 'bg-red-500/40',
  deployment_issues: 'bg-orange-500/40',
  cluster_comparison: 'bg-cyan-500/40',
  cluster_costs: 'bg-yellow-500/40',
  resource_capacity: 'bg-indigo-500/40',
  cluster_network: 'bg-pink-500/40',
  cluster_focus: 'bg-teal-500/40',
  event_stream: 'bg-amber-500/40',
  deployment_status: 'bg-lime-500/40',
  upgrade_status: 'bg-emerald-500/40',
  namespace_overview: 'bg-violet-500/40',
  namespace_quotas: 'bg-fuchsia-500/40',
  namespace_rbac: 'bg-rose-500/40',
  namespace_events: 'bg-sky-500/40',
  gitops_releases: 'bg-blue-400/40',
  gitops_drift: 'bg-orange-400/40',
  argocd_health: 'bg-cyan-400/40',
  security_issues: 'bg-red-400/40',
  security_compliance: 'bg-yellow-400/40',
  security_rbac: 'bg-amber-400/40',
  gpu_overview: 'bg-green-400/40',
  gpu_status: 'bg-lime-400/40',
  gpu_inventory: 'bg-emerald-400/40',
}

export function TemplatesModal({ isOpen, onClose, onApplyTemplate }: TemplatesModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('cluster')
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null)
  const [hoveredTemplate, setHoveredTemplate] = useState<DashboardTemplate | null>(null)

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedCategory('cluster')
      setSelectedTemplate(null)
    }
  }, [isOpen])

  const filteredTemplates = DASHBOARD_TEMPLATES.filter(t => t.category === selectedCategory)

  const handleApply = () => {
    if (selectedTemplate) {
      onApplyTemplate(selectedTemplate)
      onClose()
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl">
      <BaseModal.Header
        title="Dashboard Templates"
        icon={Layout}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content noPadding className="flex overflow-hidden">
          {/* Category sidebar */}
          <div className="w-48 border-r border-border p-4 space-y-1">
            {TEMPLATE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => {
                  setSelectedCategory(category.id)
                  setSelectedTemplate(null)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{category.icon}</span>
                <span className="text-sm">{category.name}</span>
              </button>
            ))}
          </div>

          {/* Templates grid */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  onMouseEnter={() => setHoveredTemplate(template)}
                  onMouseLeave={() => setHoveredTemplate(null)}
                  className={`p-4 rounded-lg text-left transition-all ${
                    selectedTemplate?.id === template.id
                      ? 'bg-purple-500/20 border-2 border-purple-500'
                      : 'bg-secondary/30 border-2 border-transparent hover:border-purple-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{template.icon}</span>
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{template.name}</h3>
                      <p className="text-xs text-muted-foreground">{template.cards.length} cards</p>
                    </div>
                    {selectedTemplate?.id === template.id && (
                      <Check className="w-5 h-5 text-purple-400 ml-auto" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{template.description}</p>

                  {/* Card preview */}
                  <div className="flex flex-wrap gap-1">
                    {template.cards.slice(0, 4).map((card, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground"
                      >
                        {formatCardTitle(card.card_type)}
                      </span>
                    ))}
                    {template.cards.length > 4 && (
                      <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                        +{template.cards.length - 4} more
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Layout className="w-8 h-8 mb-2 opacity-50" />
                <p>No templates in this category</p>
              </div>
            )}
          </div>

          {/* Preview Panel - always rendered to prevent layout shift */}
          <div className="w-72 border-l border-border p-4 bg-secondary/20">
            {hoveredTemplate ? (
              <>
                <h3 className="text-sm font-medium text-foreground mb-2">
                  {hoveredTemplate.icon} {hoveredTemplate.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">{hoveredTemplate.description}</p>

                {/* Visual grid preview */}
                <div className="bg-black/20 rounded-lg p-3 mb-4">
                  <div className="text-xs text-muted-foreground mb-2">Layout Preview</div>
                  <div className="grid grid-cols-12 gap-1 min-h-[120px]">
                    {hoveredTemplate.cards.map((card, idx) => {
                      const colSpan = Math.min(card.position.w, 12)
                      return (
                        <div
                          key={idx}
                          className={`rounded ${CARD_COLORS[card.card_type] || 'bg-gray-500/40'} flex items-center justify-center p-1`}
                          style={{
                            gridColumn: `span ${colSpan}`,
                            minHeight: `${card.position.h * 24}px`
                          }}
                        >
                          <span className="text-[9px] text-foreground/80 text-center leading-tight">
                            {formatCardTitle(card.card_type)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Card list */}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground mb-1">Cards included:</div>
                  {hoveredTemplate.cards.map((card, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <div className={`w-2 h-2 rounded ${CARD_COLORS[card.card_type] || 'bg-gray-500/40'}`} />
                      <span className="text-foreground/80">{formatCardTitle(card.card_type)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <Layout className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs text-center">Hover over a template<br />to see preview</p>
              </div>
            )}
          </div>
        </BaseModal.Content>

        <BaseModal.Footer showKeyboardHints>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">
              {selectedTemplate
                ? `"${selectedTemplate.name}" will add ${selectedTemplate.cards.length} cards to your dashboard`
                : 'Select a template to preview'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!selectedTemplate}
              className="px-4 py-2 bg-gradient-ks text-foreground rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
            >
              Apply Template
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </BaseModal.Footer>
    </BaseModal>
  )
}
