import { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, FileText, Layout, ChevronRight, Check, ChevronDown } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES, DashboardTemplate } from './templates'

interface CreateDashboardModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, template?: DashboardTemplate, description?: string) => void
  existingNames?: string[]
}

export function CreateDashboardModal({
  isOpen,
  onClose,
  onCreate,
  existingNames = [],
}: CreateDashboardModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('')
      setDescription('')
      setSelectedTemplate(null)
      setShowTemplates(false)
      setExpandedCategory(null)
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Generate unique default name
  const generateDefaultName = () => {
    let count = 1
    let defaultName = `Dashboard ${count}`
    while (existingNames.includes(defaultName)) {
      count++
      defaultName = `Dashboard ${count}`
    }
    return defaultName
  }

  const handleCreate = () => {
    const dashboardName = name.trim() || generateDefaultName()
    onCreate(dashboardName, selectedTemplate || undefined, description.trim() || undefined)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreate()
    }
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title="Create Dashboard"
        description="Name your dashboard and optionally start with a template."
        icon={LayoutDashboard}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        {/* Dashboard name input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-2">
            Dashboard Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={generateDefaultName()}
            className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent"
          />
        </div>

        {/* Description input (optional) */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this dashboard for?"
            rows={2}
            className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent resize-none"
          />
        </div>

        {/* Starting content options */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-foreground">
            Starting Content
          </label>

          {/* Blank option */}
          <button
            onClick={() => {
              setSelectedTemplate(null)
              setShowTemplates(false)
            }}
            className={`w-full flex items-center gap-4 p-4 rounded-lg text-left transition-all ${
              !selectedTemplate && !showTemplates
                ? 'bg-purple-500/20 border-2 border-purple-500'
                : 'bg-secondary/30 border-2 border-transparent hover:border-purple-500/30'
            }`}
          >
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Start Blank</h3>
              <p className="text-xs text-muted-foreground">Empty dashboard - add cards yourself</p>
            </div>
            {!selectedTemplate && !showTemplates && (
              <Check className="w-5 h-5 text-purple-400" />
            )}
          </button>

          {/* Template option */}
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className={`w-full flex items-center gap-4 p-4 rounded-lg text-left transition-all ${
              selectedTemplate || showTemplates
                ? 'bg-purple-500/20 border-2 border-purple-500'
                : 'bg-secondary/30 border-2 border-transparent hover:border-purple-500/30'
            }`}
          >
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              <Layout className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">
                {selectedTemplate ? selectedTemplate.name : 'Start with Template'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {selectedTemplate
                  ? `${selectedTemplate.cards.length} pre-configured cards`
                  : 'Choose from pre-built layouts'
                }
              </p>
            </div>
            {selectedTemplate ? (
              <Check className="w-5 h-5 text-purple-400" />
            ) : (
              <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform ${showTemplates ? 'rotate-90' : ''}`} />
            )}
          </button>

          {/* Template selection - categorized view */}
          {showTemplates && (
            <div className="ml-14 space-y-2 animate-fade-in max-h-64 overflow-y-auto">
              <p className="text-xs text-muted-foreground">Select a template by category:</p>

              {TEMPLATE_CATEGORIES.map((category) => {
                const categoryTemplates = DASHBOARD_TEMPLATES.filter(t => t.category === category.id)
                if (categoryTemplates.length === 0) return null

                const isExpanded = expandedCategory === category.id

                return (
                  <div key={category.id} className="space-y-1">
                    {/* Category header */}
                    <button
                      onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <span className="text-sm">{category.icon}</span>
                      <span className="text-xs font-medium text-foreground flex-1 text-left">{category.name}</span>
                      <span className="text-[10px] text-muted-foreground">{categoryTemplates.length}</span>
                      <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Templates in category */}
                    {isExpanded && (
                      <div className="grid grid-cols-2 gap-1.5 pl-2">
                        {categoryTemplates.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => {
                              setSelectedTemplate(template)
                              setShowTemplates(false)
                            }}
                            className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all ${
                              selectedTemplate?.id === template.id
                                ? 'bg-purple-500/30 border border-purple-500'
                                : 'bg-secondary/50 border border-transparent hover:border-purple-500/30'
                            }`}
                          >
                            <span className="text-base">{template.icon}</span>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[11px] font-medium text-foreground truncate">{template.name}</h4>
                              <p className="text-[9px] text-muted-foreground">{template.cards.length} cards</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
        >
          Create Dashboard
          <ChevronRight className="w-4 h-4" />
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}
