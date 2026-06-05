/**
 * UnifiedStatsSection - Container for multiple stat blocks
 *
 * Renders a configurable grid of stat blocks with optional
 * collapsing and a configuration modal.
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, ChevronDown, ChevronRight, Settings, FlaskConical } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { BaseModal } from '../../modals/BaseModal'
import type { UnifiedStatsSectionProps, UnifiedStatBlockConfig, StatBlockValue } from '../types'
import { UnifiedStatBlock } from './UnifiedStatBlock'
import { resolveStatValue } from './valueResolvers'
import { getResponsiveGridCols } from '../../stats/gridUtils'

/**
 * UnifiedStatsSection - Renders a section of stat blocks from config
 */
export function UnifiedStatsSection({
  config,
  data,
  getStatValue,
  hasData = true,
  isLoading = false,
  lastUpdated: _lastUpdated = null,
  className = '' }: UnifiedStatsSectionProps) {
  const { t } = useTranslation('common')
  const defaultIsExpanded = !config.defaultCollapsed

  // Collapsed state with localStorage persistence.
  // The storage key name says "collapsed", so the stored value represents
  // collapsed state (true = collapsed). Historically the read path here
  // interpreted the saved value as `isExpanded` while the write path stored
  // `!isExpanded` — they disagreed, so reloading the page showed the inverse
  // of the last toggle. Keep read and write aligned with the name of the key.
  const storageKey = config.storageKey || `kubestellar-${config.type}-stats-collapsed`
  const [collapsedState, setCollapsedState] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null) {
        const parsed = JSON.parse(saved) as boolean
        return {
          isExpanded: !parsed,
          error: null as string | null,
        }
      }
      return {
        isExpanded: defaultIsExpanded,
        error: null as string | null,
      }
    } catch (error) {
      console.error('Failed to restore unified stats section state', error)
      return {
        isExpanded: defaultIsExpanded,
        error: t('errors.storageRestoreFailed'),
      }
    }
  })
  const { isExpanded, error: storageError } = collapsedState

  // Configuration modal state
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [customBlocks, setCustomBlocks] = useState<UnifiedStatBlockConfig[] | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  // Determine visible blocks
  const visibleBlocks = (() => {
    const blocks = customBlocks || config.blocks
    return blocks.filter((block) => block.visible !== false)
  })()

  // Check if any block uses demo data
  const isDemoData = (() => {
    if (!data) return false
    return visibleBlocks.some((block) => {
      const resolved = resolveStatValue(block.valueSource, data, block.format)
      return resolved.isDemo
    })
  })()

  // Toggle collapsed state
  const toggleExpanded = () => {
    setCollapsedState((prev) => {
      const newValue = !prev.isExpanded
      try {
        localStorage.setItem(storageKey, JSON.stringify(!newValue))
        return {
          isExpanded: newValue,
          error: null,
        }
      } catch (error) {
        console.error('Failed to persist unified stats section state', error)
        return {
          isExpanded: newValue,
          error: t('errors.storagePersistFailed'),
        }
      }
    })
  }

  // Get value for a block
  const getBlockValue = (block: UnifiedStatBlockConfig): (() => StatBlockValue) | undefined => {
      if (getStatValue) {
        return () => getStatValue(block.id)
      }
      return undefined
    }

  // Save custom block configuration
  const saveBlocks = (blocks: UnifiedStatBlockConfig[]) => {
    setCustomBlocks(blocks)
    // Persist to localStorage
    try {
      localStorage.setItem(`${storageKey}-blocks`, JSON.stringify(blocks))
      setConfigError(null)
    } catch (error) {
      console.error('Failed to persist unified stats block configuration', error)
      setConfigError(t('errors.storagePersistFailed'))
    }
  }

  // Load custom blocks on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${storageKey}-blocks`)
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCustomBlocks(JSON.parse(saved))
      }
      setConfigError(null)
    } catch (error) {
      console.error('Failed to restore unified stats block configuration', error)
      setConfigError(t('errors.storageRestoreFailed'))
    }
  }, [storageKey, t])

  // Dynamic grid columns based on visible blocks
  const gridCols = (() => {
    const count = visibleBlocks.length

    // Use custom grid config if provided
    if (config.grid?.responsive) {
      const { sm = 2, md = 4, lg = count } = config.grid.responsive
      return `grid-cols-${sm} md:grid-cols-${md} lg:grid-cols-${lg}`
    }

    // Default responsive behavior
    return getResponsiveGridCols(count)
  })()

  const collapsible = config.collapsible !== false

  return (
    <div className={`mb-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {collapsible ? (
            <button
              onClick={toggleExpanded}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${config.title || 'Stats Overview'}`}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Activity className="w-4 h-4" />
              <span>{config.title || 'Stats Overview'}</span>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="w-4 h-4" />
              <span>{config.title || 'Stats Overview'}</span>
            </div>
          )}

          {/* Demo indicator */}
          {isDemoData && (
            <StatusBadge color="yellow" size="xs" variant="outline" rounded="full" icon={<FlaskConical className="w-2.5 h-2.5" />}>
              Demo
            </StatusBadge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Configure button */}
          {config.showConfigButton !== false && isExpanded && (
            <Button
              variant="ghost"
              onClick={() => setIsConfigOpen(true)}
              className="p-1 rounded-md"
              title="Configure stats"
              icon={<Settings className="w-4 h-4" />}
            />
          )}
        </div>
      </div>

      {(storageError || configError) && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {storageError || configError}
        </div>
      )}

      {/* Stats grid */}
      {(!collapsible || isExpanded) && (
        <div className={`grid ${gridCols} gap-4`}>
          {visibleBlocks.map((block) => (
            <UnifiedStatBlock
              key={block.id}
              config={block}
              data={hasData ? data : undefined}
              getValue={getBlockValue(block)}
              isLoading={isLoading}
            />
          ))}
        </div>
      )}

      {/* Configuration modal placeholder */}
      {isConfigOpen && (
        <StatsConfigModal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          blocks={customBlocks || config.blocks}
          onSave={saveBlocks}
          defaultBlocks={config.blocks}
          title={`Configure ${config.title || 'Stats'}`}
        />
      )}
    </div>
  )
}

/**
 * Simple configuration modal for stat blocks
 */
interface StatsConfigModalProps {
  isOpen: boolean
  onClose: () => void
  blocks: UnifiedStatBlockConfig[]
  onSave: (blocks: UnifiedStatBlockConfig[]) => void
  defaultBlocks: UnifiedStatBlockConfig[]
  title: string
}

function StatsConfigModal({
  isOpen,
  onClose,
  blocks,
  onSave,
  defaultBlocks,
  title }: StatsConfigModalProps) {
  const [localBlocks, setLocalBlocks] = useState(blocks)

  if (!isOpen) return null

  const toggleVisibility = (blockId: string) => {
    setLocalBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, visible: !block.visible } : block
      )
    )
  }

  const handleSave = () => {
    onSave(localBlocks)
    onClose()
  }

  const handleReset = () => {
    setLocalBlocks(defaultBlocks)
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="sm" closeOnBackdrop={false} closeOnEscape={true}>
      <BaseModal.Header title={title} onClose={onClose} showBack={false} />
      <BaseModal.Content className="space-y-6">
        <div className="space-y-2">
          {localBlocks.map((block) => (
            <label
              key={block.id}
              className="flex items-center gap-3 p-2 rounded hover:bg-secondary/50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={block.visible !== false}
                onChange={() => toggleVisibility(block.id)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">{block.name}</span>
            </label>
          ))}
        </div>
      </BaseModal.Content>
      <BaseModal.Footer>
        <div className="flex items-center justify-between w-full">
          <Button
            variant="ghost"
            onClick={handleReset}
          >
            Reset to default
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={onClose}
              className="rounded-md"
            >
              Cancel
            </Button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}

export default UnifiedStatsSection
