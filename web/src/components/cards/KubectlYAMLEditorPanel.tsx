// ai-quality-ignore — sub-component of Kubectl card, not a standalone card
import { FileCode, Copy, Download, AlertCircle, CheckCircle, FileText } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { copyToClipboard } from '../../lib/clipboard'
import { downloadText } from '../../lib/download'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'
import type { YAMLManifest } from './Kubectl.types'

interface YAMLEditorPanelProps {
  yamlContent: string
  yamlError: string | null
  yamlManifests: YAMLManifest[]
  selectedManifest: string | null
  isDryRun: boolean
  isExecuting: boolean
  onContentChange: (content: string) => void
  onValidate: (content: string) => void
  onApply: () => void
  onClear: () => void
  onToggleDryRun: () => void
  onLoadManifest: (manifest: YAMLManifest) => void
  onAddOutput: (message: string) => void
}

export function YAMLEditorPanel({
  yamlContent,
  yamlError,
  yamlManifests,
  selectedManifest,
  isDryRun,
  isExecuting,
  onContentChange,
  onValidate,
  onApply,
  onClear,
  onToggleDryRun,
  onLoadManifest,
  onAddOutput,
}: YAMLEditorPanelProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()

  const handleExport = () => {
    if (!yamlContent.trim()) return
    const result = downloadText('manifest.yaml', yamlContent, 'text/yaml')
    if (!result.ok) {
      showToast(`Failed to export YAML: ${result.error?.message || 'unknown error'}`, 'error')
    }
  }

  return (
    <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-blue-300">{t('cards:kubectl.yamlEditor')}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleDryRun}
            className={cn(
              'px-2 py-1 text-xs rounded',
              isDryRun ? 'bg-yellow-500/20 text-yellow-400' : 'bg-secondary text-muted-foreground'
            )}
            title={isDryRun ? 'Dry-run enabled' : 'Dry-run disabled'}
          >
            {t('cards:kubectl.dryRun')}
          </button>
          <button
            onClick={() => {
              copyToClipboard(yamlContent)
              onAddOutput('YAML copied to clipboard!')
            }}
            disabled={!yamlContent.trim()}
            className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Copy YAML"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleExport}
            disabled={!yamlContent.trim()}
            className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Download YAML"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <textarea
        value={yamlContent}
        onChange={(e) => {
          onContentChange(e.target.value)
          onValidate(e.target.value)
        }}
        placeholder="Paste or write your YAML manifest here..."
        className="w-full h-40 px-3 py-2 text-xs font-mono bg-black/30 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-blue-500/50 resize-none"
      />
      {yamlError && (
        <div className="flex items-center gap-2 mt-2 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5" />
          {yamlError}
        </div>
      )}
      {!yamlError && yamlContent.trim() && (
        <div className="flex items-center gap-2 mt-2 text-xs text-green-400">
          <CheckCircle className="w-3.5 h-3.5" />
          {t('cards:kubectl.validYaml')}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <Button
          variant="accent"
          size="sm"
          onClick={onApply}
          disabled={isExecuting || !yamlContent.trim() || !!yamlError}
          className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300"
        >
          {isExecuting ? t('cards:kubectl.applying') : isDryRun ? t('cards:kubectl.dryRunApply') : t('common:common.apply')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
        >
          {t('common:common.clear')}
        </Button>
      </div>

      {/* Saved Manifests */}
      {yamlManifests.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('cards:kubectl.savedManifests')}</span>
          </div>
          <div className="space-y-1">
            {yamlManifests.slice(-5).reverse().map(manifest => (
              <button
                key={manifest.id}
                onClick={() => onLoadManifest(manifest)}
                className={cn(
                  'w-full px-2 py-1.5 text-xs rounded text-left hover:bg-secondary/50',
                  selectedManifest === manifest.id ? 'bg-secondary/50 text-foreground' : 'text-muted-foreground'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                  <span>{manifest.name}</span>
                  <span className="text-2xs">{manifest.timestamp.toLocaleTimeString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
