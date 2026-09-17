/**
 * WorkloadImportKustomizeTab - import workloads from a kustomization directory.
 */
import { Download, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button'
import { inputClasses, labelClasses } from './workloadImportDialog.constants'
import type { ParsedResource } from './workloadImportDialog.utils'
import { ImportErrorList, ImportSinglePreview } from './WorkloadImportShared'

export interface WorkloadImportKustomizeTabProps {
  url: string
  setUrl: (value: string) => void
  preview: ParsedResource | null
  errors: string[]
  importSuccess: boolean
  isDemoData: boolean
  isLoading: boolean
  onFieldChange: () => void
  onPreview: () => void
  onImport: () => void
}

export function WorkloadImportKustomizeTab({
  url,
  setUrl,
  preview,
  errors,
  importSuccess,
  isDemoData,
  isLoading,
  onFieldChange,
  onPreview,
  onImport,
}: WorkloadImportKustomizeTabProps) {
  const { t } = useTranslation('cards')

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('workloadImport.kustomizeDescription')}
      </p>
      <div>
        <label className={labelClasses}>{t('workloadImport.kustomizeDirUrl')}</label>
        <input
          className={inputClasses}
          placeholder="https://github.com/org/repo/tree/main/overlays/prod"
          value={url}
          onChange={(e) => { setUrl(e.target.value); onFieldChange() }}
        />
      </div>
      <ImportErrorList errors={errors} />
      <ImportSinglePreview resource={preview} />
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          icon={<Eye className="h-3.5 w-3.5" />}
          onClick={onPreview}
          disabled={!url.trim()}
        >
          {t('workloadImport.preview')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={onImport}
          disabled={!url.trim() || importSuccess || isDemoData || isLoading}
          loading={isLoading}
        >
          {t('workloadImport.import')}
        </Button>
      </div>
    </div>
  )
}
