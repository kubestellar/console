import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, FileText, Layout, ChevronRight, Check, ChevronDown } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { Button } from '../ui/Button'
import { DASHBOARD_TEMPLATES, TEMPLATE_CATEGORIES, DashboardTemplate } from './templates'
import { FOCUS_DELAY_MS } from '../../lib/constants/network'
import { getIcon } from '../../lib/icons'

/** Stable DOM id for the name-validation error message (aria-describedby target) */
const NAME_ERROR_ID = 'create-dashboard-name-error'

interface CreateDashboardModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, template?: DashboardTemplate, description?: string) => void | Promise<void>
  existingNames?: string[]
  /** When true, renders content inline without BaseModal wrapper (used by Console Studio) */
  embedded?: boolean
}

export function CreateDashboardModal({
  isOpen,
  onClose,
  onCreate,
  existingNames = [],
  embedded = false,
}: CreateDashboardModalProps) {
  // Only mount inner content (and its hooks) when the modal is open.
  // This avoids health-check API polling when the modal is closed.
  if (!isOpen) return null

  return (
    <CreateDashboardModalInner
      isOpen={isOpen}
      onClose={onClose}
      onCreate={onCreate}
      existingNames={existingNames}
      embedded={embedded}
    />
  )
}

function CreateDashboardModalInner({
  isOpen,
  onClose,
  onCreate,
  existingNames = [],
  embedded = false,
}: CreateDashboardModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<DashboardTemplate | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()
  // Health removed from Create Dashboard form — not relevant here

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('')
      setDescription('')
      setSelectedTemplate(null)
      setShowTemplates(false)
      setExpandedCategory(null)
      // Focus input after animation
      const id = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS)
      return () => clearTimeout(id)
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

  const trimmedName = name.trim()
  const isNameEmpty = trimmedName.length === 0
  const isCreateDisabled = isCreating || isNameEmpty
  const showNameError = name.length > 0 && isNameEmpty

  const handleCreate = async () => {
    if (isCreateDisabled) return
    setIsCreating(true)
    try {
      await onCreate(trimmedName, selectedTemplate || undefined, description.trim() || undefined)
      onClose()
    } finally {
      setIsCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreate()
    }
  }

  const formContent = (
    <>
        {/* Health alert removed — not relevant in a Create Dashboard form */}

        {/* Dashboard name input */}
        <div className="mb-4">
          <label htmlFor="create-dashboard-name" className="block text-sm font-medium text-foreground mb-2">
            {t('dashboard.create.nameLabel')}
          </label>
          <input
            id="create-dashboard-name"
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={generateDefaultName()}
            aria-invalid={showNameError}
            aria-describedby={showNameError ? NAME_ERROR_ID : undefined}
            className={`w-full px-4 py-3 bg-secondary/30 border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 focus:border-transparent ${
              showNameError ? 'border-destructive' : 'border-border'
            }`}
          />
          {showNameError && (
            <p id={NAME_ERROR_ID} role="alert" className="mt-1 text-xs text-destructive">{t('dashboard.create.nameRequired')}</p>
          )}
        </div>

        {/* Description input (optional) */}
        <div className="mb-6">
          <label htmlFor="create-dashboard-description" className="block text-sm font-medium text-foreground mb-2">
            {t('dashboard.create.descriptionLabel')} <span className="text-muted-foreground font-normal">{t('dashboard.create.optional')}</span>
          </label>
          <textarea
            id="create-dashboard-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('dashboard.create.descriptionPlaceholder')}
            rows={2}
            className="w-full px-4 py-3 bg-secondary/30 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 focus:border-transparent resize-none"
          />
        </div>

        {/* Starting content options */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-foreground">
            {t('dashboard.create.startingContent')}
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
              <h3 className="text-sm font-medium text-foreground">{t('dashboard.create.startBlank')}</h3>
              <p className="text-xs text-muted-foreground">{t('dashboard.create.startBlankDesc')}</p>
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
                {selectedTemplate ? selectedTemplate.name : t('dashboard.create.startWithCollection')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {selectedTemplate
                  ? t('dashboard.create.preConfiguredCards', { count: selectedTemplate.cards.length })
                  : t('dashboard.create.chooseFromCollections')
                }
              </p>
            </div>
            {selectedTemplate ? (
              <Check className="w-5 h-5 text-purple-400" />
            ) : (
              <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform ${showTemplates ? 'rotate-90' : ''}`} />
            )}
          </button>

          {/* Collection selection - categorized view */}
          {showTemplates && (
            <div className="ml-14 space-y-2 animate-fade-in max-h-64 overflow-y-auto">
              <p className="text-xs text-muted-foreground">{t('dashboard.create.selectByCategoryCollection')}</p>

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
                      {(() => { const CatIcon = getIcon(category.icon); return <CatIcon className="w-4 h-4" /> })()}
                      <span className="text-xs font-medium text-foreground flex-1 text-left">{category.name}</span>
                      <span className="text-2xs text-muted-foreground">{categoryTemplates.length}</span>
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
                              // Don't collapse — user may want to browse more
                            }}
                            className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all ${
                              selectedTemplate?.id === template.id
                                ? 'bg-purple-500/30 border border-purple-500'
                                : 'bg-secondary/50 border border-transparent hover:border-purple-500/30'
                            }`}
                          >
                            {(() => { const TplIcon = getIcon(template.icon); return <TplIcon className="w-4 h-4 text-muted-foreground shrink-0" /> })()}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-medium text-foreground truncate">{template.name}</h4>
                              <p className="text-xs text-muted-foreground truncate">{template.cards.map(c => c.card_type.replace(/_/g, ' ')).join(', ')}</p>
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
    </>
  )

  const createButton = (
    <Button
      variant="accent"
      size="lg"
      iconRight={isCreating ? undefined : <ChevronRight className="w-4 h-4" />}
      onClick={handleCreate}
      loading={isCreating}
      disabled={isCreateDisabled}
    >
      {isCreating ? t('dashboard.create.creating') : t('dashboard.create.title', 'Create Dashboard')}
    </Button>
  )

  // Embedded mode: render inline within Console Studio
  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-muted-foreground mb-4">{t('dashboard.create.descriptionCollection')}</p>
          {formContent}
        </div>
        <div className="border-t border-border px-4 py-3 flex items-center justify-end gap-2">
          {createButton}
        </div>
      </div>
    )
  }

  // Standard modal mode
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('dashboard.create.title', 'Create Dashboard')}
        description={t('dashboard.create.descriptionCollection', 'Name your dashboard and optionally start with a card collection.')}
        icon={LayoutDashboard}
        onClose={onClose}
        showBack={false}
      />
      <BaseModal.Content>
        {formContent}
      </BaseModal.Content>
      <BaseModal.Footer showKeyboardHints={false} className="justify-end">
        <Button variant="ghost" size="lg" onClick={onClose} disabled={isCreating}>
          {t('actions.cancel')}
        </Button>
        {createButton}
      </BaseModal.Footer>
    </BaseModal>
  )
}
