import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Code, Layers, Wand2, Sparkles,
  CheckCircle } from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { deleteDynamicCard, getAllDynamicCards } from '../../lib/dynamic-cards'
import type { DynamicCardDefinition } from '../../lib/dynamic-cards/types'
import { CardFactoryTemplates } from './CardFactoryTemplates'
import { CardFactoryCode } from './CardFactoryCode'
import { AiCardTab } from './cardFactoryAiTab'
import { ManageCardsTab } from './cardFactoryManageTab'

interface CardFactoryModalProps {
  isOpen: boolean
  onClose: () => void
  onCardCreated?: (cardId: string) => void
  /** When true, renders content inline without BaseModal wrapper (used by Console Studio) */
  embedded?: boolean
}

type Tab = 'declarative' | 'code' | 'ai' | 'manage'

const SAVE_MESSAGE_TIMEOUT_MS = 3000 // Duration to display save/error messages before auto-clearing


// ============================================================================
// Main Component
// ============================================================================

export function CardFactoryModal({ isOpen, onClose, onCardCreated, embedded = false }: CardFactoryModalProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('declarative')

  // Manage state
  const [existingCards, setExistingCards] = useState<DynamicCardDefinition[]>([])
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Track timeouts for cleanup
  const timeoutsRef = useRef<number[]>([])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
    }
  }, [])

  // Refresh existing cards list when switching to manage tab
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
    if (newTab === 'manage') {
      setExistingCards(getAllDynamicCards())
    }
  }

  // Delete a card
  const handleDelete = (id: string) => {
    deleteDynamicCard(id)
    setExistingCards(getAllDynamicCards())
  }

  // Handle save message with timeout
  const handleSaveMessage = (message: string) => {
    setSaveMessage(message)
    const timeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
    timeoutsRef.current.push(timeoutId)
  }

  // Shared content for both modal and embedded modes
  const factoryContent = (
      <div className="flex flex-col">
        {/* Tabs */}
        <div
          role="tablist"
          className="flex items-center gap-1 border-b border-border pb-2 mb-4"
          onKeyDown={(e) => {
            const tabIds: Tab[] = ['declarative', 'code', 'ai', 'manage']
            const idx = tabIds.indexOf(tab)
            if (e.key === 'ArrowRight') handleTabChange(tabIds[Math.min(idx + 1, tabIds.length - 1)])
            else if (e.key === 'ArrowLeft') handleTabChange(tabIds[Math.max(idx - 1, 0)])
          }}
        >
          {[
            { id: 'declarative' as Tab, label: t('dashboard.cardFactory.declarativeTab'), icon: Layers },
            { id: 'code' as Tab, label: t('dashboard.cardFactory.customCodeTab'), icon: Code },
            { id: 'ai' as Tab, label: t('dashboard.cardFactory.aiCreateTab'), icon: Sparkles },
            { id: 'manage' as Tab, label: t('dashboard.cardFactory.manageTab'), icon: Wand2 },
          ].map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => handleTabChange(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
              )}
            >
              {/* Icon removed for cleaner look */}
              {t.label}
            </button>
          ))}
        </div>

        {/* Save feedback */}
        {saveMessage && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-sm text-green-400">{saveMessage}</span>
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1">
          {/* Declarative (Tier 1) — split pane */}
          {tab === 'declarative' && (
            <CardFactoryTemplates
              onCardCreated={onCardCreated}
              onSaveMessage={handleSaveMessage}
            />
          )}

          {/* Code (Tier 2) — split pane */}
          {tab === 'code' && (
            <CardFactoryCode
              onCardCreated={onCardCreated}
              onSaveMessage={handleSaveMessage}
            />
          )}

          {/* AI Create */}
          {tab === 'ai' && (
            <AiCardTab
              onCardCreated={(id) => {
                handleSaveMessage('Card created with AI!')
                onCardCreated?.(id)
              }}
            />
          )}

          {/* Manage */}
          {tab === 'manage' && (
            <ManageCardsTab
              existingCards={existingCards}
              onDeleteRequest={setDeleteConfirmId}
            />
          )}
        </div>
      </div>
  )

  const confirmDialog = (
    <ConfirmDialog
      isOpen={deleteConfirmId !== null}
      onClose={() => setDeleteConfirmId(null)}
      onConfirm={() => {
        if (deleteConfirmId) {
          handleDelete(deleteConfirmId)
          setDeleteConfirmId(null)
        }
      }}
      title={t('dashboard.cardFactory.deleteCard')}
      message={t('dashboard.delete.warning')}
      confirmLabel={t('actions.delete')}
      cancelLabel={t('actions.cancel')}
      variant="danger"
    />
  )

  // Embedded mode: render content inline within Console Studio
  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          {factoryContent}
        </div>
        {confirmDialog}
      </div>
    )
  }

  // Standard modal mode
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <BaseModal.Header title={t('dashboard.cardFactory.title')} icon={Wand2} onClose={onClose} showBack={false} />
      <BaseModal.Content className="max-h-[70vh]">
        {factoryContent}
      </BaseModal.Content>
      {confirmDialog}
    </BaseModal>
  )
}
