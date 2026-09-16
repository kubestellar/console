import { startTransition, useEffect, useRef, useState } from 'react'
import {
  saveDynamicStatsDefinition,
  deleteDynamicStatsDefinition,
  getAllDynamicStats } from '../../lib/dynamic-cards'
import type { BlockEditorItem, StatAssistResult, AiStatBlockResult, StatBlockFactoryModalProps, Tab } from './statBlockFactoryModal.types'
import {
  SAVE_MESSAGE_TIMEOUT_MS,
  buildStatBlockDefinitions,
  buildStatsDefinition,
  createEmptyBlock,
  normalizeBlockEditorItems } from './statBlockFactoryModal.utils'

function createInitialBlocks(): BlockEditorItem[] {
  return [
    { ...createEmptyBlock(), label: 'Total', icon: 'Server', color: 'purple', field: 'total' },
    { ...createEmptyBlock(), label: 'Healthy', icon: 'CheckCircle2', color: 'green', field: 'healthy' },
    { ...createEmptyBlock(), label: 'Issues', icon: 'AlertTriangle', color: 'red', field: 'issues' },
  ]
}

interface UseStatBlockFactoryModalOptions {
  onStatsCreated?: StatBlockFactoryModalProps['onStatsCreated']
}

export function useStatBlockFactoryModal({ onStatsCreated }: UseStatBlockFactoryModalOptions) {
  const [tab, setTab] = useState<Tab>('builder')
  const [title, setTitle] = useState('')
  const [statsType, setStatsType] = useState('')
  const [blocks, setBlocks] = useState<BlockEditorItem[]>(() => createInitialBlocks())
  const [gridCols, setGridCols] = useState<number>(0)
  const [existingStats, setExistingStats] = useState(() => getAllDynamicStats())
  const [deleteConfirmType, setDeleteConfirmType] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const timeoutsRef = useRef<number[]>([])

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
    }
  }, [])

  const queueSaveMessageClear = () => {
    const timeoutId = window.setTimeout(() => setSaveMessage(null), SAVE_MESSAGE_TIMEOUT_MS)
    timeoutsRef.current.push(timeoutId)
  }

  const handleTabChange = (newTab: Tab) => {
    startTransition(() => {
      setTab(newTab)
      if (newTab === 'manage') {
        setExistingStats(getAllDynamicStats())
      }
    })
  }

  const addBlock = () => {
    setBlocks(prev => [...prev, createEmptyBlock()])
  }

  const updateBlock = (idx: number, field: keyof BlockEditorItem, value: string) => {
    setBlocks(prev => prev.map((block, blockIndex) => blockIndex === idx ? { ...block, [field]: value } : block))
  }

  const removeBlock = (idx: number) => {
    setBlocks(prev => prev.filter((_, blockIndex) => blockIndex !== idx))
  }

  const moveBlock = (idx: number, direction: 'up' | 'down') => {
    setBlocks(prev => {
      const newBlocks = [...prev]
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= newBlocks.length) return prev
      ;[newBlocks[idx], newBlocks[targetIdx]] = [newBlocks[targetIdx], newBlocks[idx]]
      return newBlocks
    })
  }

  const hasLabeledBlocks = blocks.some(block => block.label.trim())

  const handleSave = () => {
    const type = statsType.trim() || `custom_${Date.now()}`
    if (!hasLabeledBlocks) {
      setSaveMessage('Add at least one stat block.')
      queueSaveMessageClear()
      return
    }

    const definition = buildStatsDefinition(type, title, blocks, gridCols)
    saveDynamicStatsDefinition(definition)
    setSaveMessage(`Stats "${definition.title}" created!`)
    onStatsCreated?.(type)
    queueSaveMessageClear()
  }

  const handleDelete = (type: string) => {
    deleteDynamicStatsDefinition(type)
    startTransition(() => {
      setExistingStats(getAllDynamicStats())
    })
  }

  const handleAssistResult = (result: StatAssistResult) => {
    startTransition(() => {
      if (result.title) setTitle(result.title)
      if (result.blocks && result.blocks.length > 0) {
        setBlocks(normalizeBlockEditorItems(result.blocks))
      }
    })
  }

  const handleAiSave = (result: AiStatBlockResult) => {
    const type = result.type || `custom_${Date.now()}`
    const normalizedBlocks = normalizeBlockEditorItems(result.blocks)
    const definition = {
      type,
      title: result.title || 'AI-Generated Stats',
      blocks: buildStatBlockDefinitions(normalizedBlocks),
      defaultCollapsed: false,
    }

    saveDynamicStatsDefinition(definition)
    onStatsCreated?.(type)
    setSaveMessage(`Stats "${definition.title}" created with AI!`)
    queueSaveMessageClear()
  }

  return {
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
  }
}
