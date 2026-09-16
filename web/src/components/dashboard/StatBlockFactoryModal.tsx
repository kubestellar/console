import type { KeyboardEvent } from 'react'
import { Activity, Sparkles, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { STAT_BLOCK_SYSTEM_PROMPT } from '../../lib/ai/prompts'
import { useAIMode } from '../../hooks/useAIMode'
import type { StatBlockFactoryModalProps, Tab, AiStatBlockResult } from './statBlockFactoryModal.types'
import {
  normalizeBlockEditorItems,
  validateStatBlockResult } from './statBlockFactoryModal.utils'
import { StatsPreview } from './StatBlockFactoryPreview'
import { StatBlockManageTab } from './StatBlockManageTab'
import { AiGenerationPanel } from './AiGenerationPanel'
import { StatBlockFactoryBuilderTab } from './StatBlockFactoryBuilderTab'
import { useStatBlockFactoryModal } from './useStatBlockFactoryModal'

export function StatBlockFactoryModal({ isOpen, onClose, onStatsCreated, embedded = false }: StatBlockFactoryModalProps) {
  const { t } = useTranslation()
  const { isFeatureEnabled } = useAIMode()
  const {
    tab,
    title,
    statsType,
    blocks,
    gridCols,
    existingStats,
    deleteConfirmType,
    saveMessage,
    hasLabeledBlocks,
    setTitle,
    setStatsType,
    setGridCols,
    setDeleteConfirmType,
    handleTabChange,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
    handleSave,
    handleDelete,
    handleAssistResult,
    handleAiSave,
  } = useStatBlockFactoryModal({ onStatsCreated })

  const tabs = [
    { id: 'builder' as Tab, label: t('dashboard.statFactory.buildTab'), icon: Activity },
    { id: 'ai' as Tab, label: t('dashboard.statFactory.aiGenerateTab'), icon: Sparkles },
    { id: 'manage' as Tab, label: t('dashboard.statFactory.manageTab'), icon: Activity },
  ]

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex(currentTab => currentTab.id === tab)
    let next: Tab | null = null

    if (event.key === 'ArrowRight') next = tabs[Math.min(idx + 1, tabs.length - 1)].id
    else if (event.key === 'ArrowLeft') next = tabs[Math.max(idx - 1, 0)].id
    else if (event.key === 'Home') next = tabs[0].id
    else if (event.key === 'End') next = tabs[tabs.length - 1].id

    if (!next) return
    event.preventDefault()
    handleTabChange(next)
  }

  const statContent = (
    <>
      {saveMessage && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <span className="text-sm text-green-400">{saveMessage}</span>
        </div>
      )}

      {tab === 'builder' && (
        <StatBlockFactoryBuilderTab
          title={title}
          statsType={statsType}
          blocks={blocks}
          gridCols={gridCols}
          hasLabeledBlocks={hasLabeledBlocks}
          isNaturalLanguageEnabled={isFeatureEnabled('naturalLanguage')}
          onTitleChange={setTitle}
          onStatsTypeChange={setStatsType}
          onGridColsChange={setGridCols}
          onAssistResult={handleAssistResult}
          onAddBlock={addBlock}
          onUpdateBlock={updateBlock}
          onRemoveBlock={removeBlock}
          onMoveBlock={moveBlock}
          onSave={handleSave}
        />
      )}

      {tab === 'ai' && (
        <AiGenerationPanel<AiStatBlockResult>
          systemPrompt={STAT_BLOCK_SYSTEM_PROMPT}
          placeholder="Describe the stat blocks you want, e.g., 'Stats for monitoring a Redis cluster: total instances, healthy, memory usage, connections, latency'"
          missionTitle="AI Stat Block Generation"
          validateResult={validateStatBlockResult}
          renderPreview={result => (
            <StatsPreview
              title={result.title}
              blocks={normalizeBlockEditorItems(result.blocks)}
            />
          )}
          onSave={handleAiSave}
          saveLabel="Create Stat Block"
        />
      )}

      {tab === 'manage' && (
        <StatBlockManageTab
          existingStats={existingStats}
          onDeleteRequest={setDeleteConfirmType}
        />
      )}
    </>
  )

  const statConfirmDialog = (
    <ConfirmDialog
      isOpen={deleteConfirmType !== null}
      onClose={() => setDeleteConfirmType(null)}
      onConfirm={() => {
        if (deleteConfirmType) {
          handleDelete(deleteConfirmType)
          setDeleteConfirmType(null)
        }
      }}
      title={t('dashboard.statFactory.deleteStatBlock')}
      message={t('dashboard.delete.warning')}
      confirmLabel={t('actions.delete')}
      cancelLabel={t('actions.cancel')}
      variant="danger"
    />
  )

  if (embedded) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <div
            role="tablist"
            aria-label={t('dashboard.statFactory.title')}
            onKeyDown={handleTabKeyDown}
            className="flex items-center gap-1 border-b border-border pb-2 mb-4"
          >
            {tabs.map(currentTab => (
              <button key={currentTab.id} onClick={() => handleTabChange(currentTab.id)}
                role="tab"
                aria-selected={tab === currentTab.id}
                tabIndex={tab === currentTab.id ? 0 : -1}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === currentTab.id ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
                {currentTab.label}
              </button>
            ))}
          </div>
          {statContent}
        </div>
        {statConfirmDialog}
      </div>
    )
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <BaseModal.Header title={t('dashboard.statFactory.title')} icon={Activity} onClose={onClose} showBack={false} />
      <BaseModal.Tabs tabs={tabs} activeTab={tab} onTabChange={currentTab => handleTabChange(currentTab as Tab)} />
      <BaseModal.Content className="max-h-[70vh]">
        {statContent}
      </BaseModal.Content>
      {statConfirmDialog}
    </BaseModal>
  )
}
