import { Trash2, Sparkles, FileCode, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

interface KubectlToolbarProps {
  showAI: boolean
  showYAMLEditor: boolean
  showHistory: boolean
  onToggleAI: () => void
  onToggleYAMLEditor: () => void
  onToggleHistory: () => void
  onClearOutput: () => void
}

export function KubectlToolbar({
  showAI,
  showYAMLEditor,
  showHistory,
  onToggleAI,
  onToggleYAMLEditor,
  onToggleHistory,
  onClearOutput,
}: KubectlToolbarProps) {
  const { t } = useTranslation(['common', 'cards'])
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onToggleAI}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          showAI ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
        )}
        title={t('cards:kubectl.aiAssist')}
      >
        <Sparkles className="w-4 h-4" />
      </button>
      <button
        onClick={onToggleYAMLEditor}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          showYAMLEditor ? 'bg-blue-500/20 text-blue-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
        )}
        title={t('cards:kubectl.yamlEditor')}
      >
        <FileCode className="w-4 h-4" />
      </button>
      <button
        onClick={onToggleHistory}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          showHistory ? 'bg-orange-500/20 text-orange-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
        )}
        title={t('cards:kubectl.history')}
      >
        <History className="w-4 h-4" />
      </button>
      <button
        onClick={onClearOutput}
        className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
        title={t('cards:kubectl.clearOutput')}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
