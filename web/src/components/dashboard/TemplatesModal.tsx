import { useState, useEffect } from 'react'
import { X, Layout, ChevronRight, Check } from 'lucide-react'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES, DashboardTemplate } from './templates'

interface TemplatesModalProps {
  isOpen: boolean
  onClose: () => void
  onApplyTemplate: (template: DashboardTemplate) => void
}

export function TemplatesModal({ isOpen, onClose, onApplyTemplate }: TemplatesModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('cluster')
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null)

  // ESC to close
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Layout className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Dashboard Templates</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
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
                    : 'hover:bg-secondary text-muted-foreground hover:text-white'
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
                  className={`p-4 rounded-lg text-left transition-all ${
                    selectedTemplate?.id === template.id
                      ? 'bg-purple-500/20 border-2 border-purple-500'
                      : 'bg-secondary/30 border-2 border-transparent hover:border-purple-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{template.icon}</span>
                    <div>
                      <h3 className="text-sm font-medium text-white">{template.name}</h3>
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
                        {card.card_type.replace(/_/g, ' ')}
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {selectedTemplate
              ? `"${selectedTemplate.name}" will add ${selectedTemplate.cards.length} cards to your dashboard`
              : 'Select a template to preview'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!selectedTemplate}
              className="px-4 py-2 bg-gradient-ks text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
            >
              Apply Template
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
