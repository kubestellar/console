import { useTranslation } from 'react-i18next'
import { Loader2, RotateCcw, Sparkles } from 'lucide-react'

interface GenerationActionButtonsProps {
  isGenerating: boolean
  onGenerate: () => void
  onReset: () => void
}

export function GenerationActionButtons({
  isGenerating,
  onGenerate,
  onReset,
}: GenerationActionButtonsProps) {
  const { t } = useTranslation(['common', 'cards'])

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm font-medium disabled:opacity-50"
        title={t('sidebar.customizer.autoOrganizeTooltip')}
      >
        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {isGenerating ? t('sidebar.customizer.analyzing') : t('sidebar.customizer.autoOrganize')}
      </button>
      <button
        onClick={onReset}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        title={t('sidebar.customizer.resetSidebarTooltip')}
      >
        <RotateCcw className="w-4 h-4" />
        {t('sidebar.customizer.resetSidebar')}
      </button>
    </div>
  )
}
