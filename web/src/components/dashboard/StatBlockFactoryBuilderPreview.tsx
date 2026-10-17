import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Maximize2, Minimize2 } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import type { BlockEditorItem } from './statBlockFactoryModal.types'
import { StatsPreview } from './StatBlockFactoryPreview'

interface BuilderPreviewPaneProps {
  title: string
  blocks: BlockEditorItem[]
}

export function BuilderPreviewPane({ title, blocks }: BuilderPreviewPaneProps) {
  const { t } = useTranslation()
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const [previewSize, setPreviewSize] = useState<'card' | 'full'>('full')

  if (previewCollapsed) {
    return (
      <div className="flex items-center justify-center border-l border-border/50 bg-secondary/10 w-10 shrink-0">
        <button
          onClick={() => setPreviewCollapsed(false)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={t('dashboard.preview.showPreview')}
          aria-label={t('dashboard.preview.showPreview')}
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="border-l border-border/50 bg-secondary/10 flex flex-col w-[45%] shrink-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('dashboard.preview.header')}</span>
          <StatusBadge color="purple" size="xs">
            {t('dashboard.preview.sampleValues')}
          </StatusBadge>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setPreviewSize(previewSize === 'card' ? 'full' : 'card')}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground transition-colors min-h-11 min-w-11 flex items-center justify-center"
            title={previewSize === 'card' ? t('dashboard.preview.fullWidth') : t('dashboard.preview.cardWidth')}
            aria-label={previewSize === 'card' ? t('dashboard.preview.fullWidth') : t('dashboard.preview.cardWidth')}
          >
            {previewSize === 'card' ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setPreviewCollapsed(true)}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground transition-colors min-h-11 min-w-11 flex items-center justify-center"
            title={t('dashboard.preview.hidePreview')}
            aria-label={t('dashboard.preview.hidePreview')}
          >
            <EyeOff className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div
          className="rounded-lg border border-border/50 bg-card/30 p-4 mx-auto transition-all"
          style={previewSize === 'card' ? { maxWidth: '300px' } : undefined}
        >
          <StatsPreview title={title || 'Custom Stats'} blocks={blocks} />
        </div>
      </div>
    </div>
  )
}
