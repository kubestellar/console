import { useState, useEffect, useRef, startTransition } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, X, Save, Activity, Sparkles,
  CheckCircle, GripVertical, Eye, EyeOff,
  Maximize2, Minimize2 } from 'lucide-react'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { cn } from '../../lib/cn'
import {
  saveDynamicStatsDefinition,
  deleteDynamicStatsDefinition,
  getAllDynamicStats } from '../../lib/dynamic-cards'
import type { StatBlockColor } from '../../lib/stats/types'
import { COLOR_CLASSES } from '../../lib/stats/types'
import { AiGenerationPanel } from './AiGenerationPanel'
import { InlineAIAssist } from './InlineAIAssist'
import { STAT_BLOCK_SYSTEM_PROMPT, STAT_INLINE_ASSIST_PROMPT } from '../../lib/ai/prompts'
import { useAIMode } from '../../hooks/useAIMode'
import { StatusBadge } from '../ui/StatusBadge'
import { Button } from '../ui/Button'
import type { StatBlockFactoryModalProps, Tab, BlockEditorItem, StatAssistResult, AiStatBlockResult } from './statBlockFactoryModal.types'
import {
  AVAILABLE_COLORS,
  POPULAR_ICONS,
  VALUE_FORMATS,
  SAVE_MESSAGE_TIMEOUT_MS,
  UNSAVED_CHANGES_MESSAGE,
  STAT_ASSIST_INITIAL_STATE,
  AI_STAT_BLOCK_INITIAL_STATE,
} from './statBlockFactoryModal.utils'
import { StatBlockManageTab } from './StatBlockManageTab'
import { StatBlockPreviewRenderer } from './StatBlockPreviewRenderer'
import { StatsPreview } from './StatBlockPreview'

export function StatBlockFactoryModal({
  isOpen,
  onClose,
  onBlocksChanged,
  initialTab = 'manage',
}: StatBlockFactoryModalProps) {
  const { t } = useTranslation()

  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [blocks, setBlocks] = useState<BlockEditorItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [blockToDelete, setBlockToDelete] = useState<string | null>(null)
  const [previewBlock, setPreviewBlock] = useState<BlockEditorItem | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [statAssist, setStatAssist] = useState(STAT_ASSIST_INITIAL_STATE)
  const [aiStatBlock, setAiStatBlock] = useState(AI_STAT_BLOCK_INITIAL_STATE)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)
    void getAllDynamicStats().then((saved) => {
      setBlocks(
        saved.map((s) => ({
          ...s,
          isEditing: false,
          hasUnsavedChanges: false,
        })),
      )
      setIsLoading(false)
    })
  }, [isOpen])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      for (const block of blocks) {
        if (block.hasUnsavedChanges) {
          await saveDynamicStatsDefinition(block)
        }
      }
      setBlocks((prev) =>
        prev.map((b) => ({ ...b, hasUnsavedChanges: false, isEditing: false })),
      )
      setSaveMessage('✓ Saved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(
        () => setSaveMessage(''),
        SAVE_MESSAGE_TIMEOUT_MS,
      )
      onBlocksChanged?.()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setBlockToDelete(id)
    setShowConfirmDelete(true)
  }

  const handleConfirmDelete = async () => {
    if (!blockToDelete) return
    await deleteDynamicStatsDefinition(blockToDelete)
    setBlocks((prev) => prev.filter((b) => b.id !== blockToDelete))
    setShowConfirmDelete(false)
    setBlockToDelete(null)
    onBlocksChanged?.()
  }

  const handleAddBlock = () => {
    const newBlock: BlockEditorItem = {
      id: `custom_${Date.now()}`,
      label: 'New Stat',
      value: '0',
      color: 'blue',
      icon: 'Activity',
      format: 'number',
      isEditing: true,
      hasUnsavedChanges: true,
    }
    setBlocks((prev) => [...prev, newBlock])
    setActiveTab('manage')
  }

  const handleBlockUpdate = (updated: BlockEditorItem) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === updated.id
          ? { ...updated, hasUnsavedChanges: true }
          : b,
      ),
    )
  }

  const handleStatAssistResult = (result: StatAssistResult) => {
    setStatAssist({ result, isVisible: true })
    setShowAiPanel(false)
  }

  const handleApplyStatAssist = () => {
    if (!statAssist.result) return
    const newBlock: BlockEditorItem = {
      id: `custom_${Date.now()}`,
      label: statAssist.result.label,
      value: statAssist.result.value,
      color: statAssist.result.color as StatBlockColor,
      icon: statAssist.result.icon,
      format: statAssist.result.format,
      description: statAssist.result.description,
      isEditing: false,
      hasUnsavedChanges: true,
    }
    setBlocks((prev) => [...prev, newBlock])
    setStatAssist(STAT_ASSIST_INITIAL_STATE)
    setActiveTab('manage')
  }

  const handleAiStatBlockResult = (result: AiStatBlockResult) => {
    setAiStatBlock({ result, isGenerating: false })
  }

  const handleApplyAiStatBlock = () => {
    if (!aiStatBlock.result) return
    const newBlock: BlockEditorItem = {
      id: `custom_${Date.now()}`,
      label: aiStatBlock.result.label,
      value: aiStatBlock.result.previewValue ?? '—',
      color: (aiStatBlock.result.color as StatBlockColor) ?? 'blue',
      icon: aiStatBlock.result.icon ?? 'Activity',
      format: aiStatBlock.result.format ?? 'text',
      description: aiStatBlock.result.description,
      isEditing: false,
      hasUnsavedChanges: true,
    }
    setBlocks((prev) => [...prev, newBlock])
    setAiStatBlock(AI_STAT_BLOCK_INITIAL_STATE)
    setActiveTab('manage')
  }

  const hasUnsaved = blocks.some((b) => b.hasUnsavedChanges)

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title={t('statBlockFactory.title', 'Stat Block Factory')}
        size={isFullscreen ? 'fullscreen' : 'xl'}
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFullscreen((f) => !f)}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
              {saveMessage && (
                <span className="text-sm text-green-600 dark:text-green-400">
                  {saveMessage}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={() => { void handleSave() }}
                disabled={!hasUnsaved || isSaving}
              >
                {isSaving ? (
                  <>
                    <Save className="w-4 h-4 mr-1 animate-spin" />
                    {t('common.saving', 'Saving...')}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1" />
                    {t('common.save', 'Save')}
                  </>
                )}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Tab navigation */}
          <div className="flex border-b border-border">
            {(['manage', 'preview', 'ai'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab === 'manage' && t('statBlockFactory.tabs.manage', 'Manage')}
                {tab === 'preview' && t('statBlockFactory.tabs.preview', 'Preview')}
                {tab === 'ai' && (
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {t('statBlockFactory.tabs.ai', 'AI Assist')}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'manage' && (
            <StatBlockManageTab
              blocks={blocks}
              isLoading={isLoading}
              onAddBlock={handleAddBlock}
              onBlockUpdate={handleBlockUpdate}
              onDeleteBlock={handleDelete}
              onPreviewBlock={setPreviewBlock}
              statAssist={statAssist}
              onApplyStatAssist={handleApplyStatAssist}
              onDismissStatAssist={() => setStatAssist(STAT_ASSIST_INITIAL_STATE)}
              aiStatBlock={aiStatBlock}
              onApplyAiStatBlock={handleApplyAiStatBlock}
              onDismissAiStatBlock={() => setAiStatBlock(AI_STAT_BLOCK_INITIAL_STATE)}
            />
          )}

          {activeTab === 'preview' && (
            <div className="space-y-4">
              <StatsPreview blocks={blocks} />
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAiPanel((v) => !v)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                    showAiPanel
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('statBlockFactory.ai.toggleAssist', 'Stat Assist')}
                </button>
                <span className="text-xs text-muted-foreground">
                  {t('statBlockFactory.ai.assistHint', 'Describe what you want to track')}
                </span>
              </div>

              {showAiPanel && (
                <AiGenerationPanel
                  systemPrompt={STAT_BLOCK_SYSTEM_PROMPT}
                  onResult={handleStatAssistResult}
                  placeholder={t(
                    'statBlockFactory.ai.placeholder',
                    'e.g. "Show me CPU usage across all clusters"',
                  )}
                />
              )}

              <InlineAIAssist
                systemPrompt={STAT_INLINE_ASSIST_PROMPT}
                onResult={handleAiStatBlockResult}
                placeholder={t(
                  'statBlockFactory.ai.inlinePlaceholder',
                  'Ask AI to generate a stat block...',
                )}
              />

              {aiStatBlock.result && (
                <div className="border border-border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {t('statBlockFactory.ai.generatedBlock', 'Generated Block')}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAiStatBlock(AI_STAT_BLOCK_INITIAL_STATE)}
                      >
                        <X className="w-3 h-3 mr-1" />
                        {t('common.dismiss', 'Dismiss')}
                      </Button>
                      <Button size="sm" onClick={handleApplyAiStatBlock}>
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {t('common.apply', 'Apply')}
                      </Button>
                    </div>
                  </div>
                  <StatBlockPreviewRenderer block={aiStatBlock.result} />
                </div>
              )}
            </div>
          )}
        </div>
      </BaseModal>

      <ConfirmDialog
        isOpen={showConfirmDelete}
        onClose={() => {
          setShowConfirmDelete(false)
          setBlockToDelete(null)
        }}
        onConfirm={() => { void handleConfirmDelete() }}
        title={t('statBlockFactory.deleteConfirm.title', 'Delete Stat Block')}
        message={t(
          'statBlockFactory.deleteConfirm.message',
          'Are you sure you want to delete this stat block? This action cannot be undone.',
        )}
        confirmLabel={t('common.delete', 'Delete')}
        variant="danger"
      />

      {previewBlock && (
        <BaseModal
          isOpen={!!previewBlock}
          onClose={() => setPreviewBlock(null)}
          title={t('statBlockFactory.preview.title', 'Preview: {{label}}', {
            label: previewBlock.label,
          })}
          size="sm"
        >
          <div className="p-4">
            <StatsPreview blocks={[previewBlock]} />
          </div>
        </BaseModal>
      )}
    </>
  )
}

export type { StatBlockFactoryModalProps }
