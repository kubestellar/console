/**
 * WorkloadImportYamlTab - raw YAML/JSON paste-or-upload import tab.
 */
import { Download, Eye } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button'
import { cn } from '../../../lib/cn'
import { inputClasses } from './workloadImportDialog.constants'
import type { ParsedResource } from './workloadImportDialog.utils'
import { ImportErrorList, ImportPreviewTable } from './WorkloadImportShared'

export interface WorkloadImportYamlTabProps {
  text: string
  preview: ParsedResource[]
  errors: string[]
  importSuccess: boolean
  isDemoData: boolean
  isLoading: boolean
  onChange: (text: string) => void
  onPreview: () => void
  onImport: () => void
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function WorkloadImportYamlTab({
  text,
  preview,
  errors,
  importSuccess,
  isDemoData,
  isLoading,
  onChange,
  onPreview,
  onImport,
  onFileUpload,
}: WorkloadImportYamlTabProps) {
  const { t } = useTranslation('cards')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <p className="text-xs text-muted-foreground">
          {t('workloadImport.yamlDescription')}
        </p>
        <label className="flex items-center gap-1.5 px-2.5 py-1 text-2xs font-medium rounded-md bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
          <Download className="h-3 w-3" />
          Upload file
          <input type="file" accept=".yaml,.yml,.json" onChange={onFileUpload} className="hidden" />
        </label>
      </div>
      <textarea
        className={cn(inputClasses, 'h-48 font-mono text-xs resize-y')}
        placeholder={t('workloadImport.yamlPlaceholder')}
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />
      <ImportErrorList errors={errors} />
      <ImportPreviewTable resources={preview} />
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="secondary"
          size="sm"
          icon={<Eye className="h-3.5 w-3.5" />}
          onClick={onPreview}
          disabled={!text.trim()}
        >
          {t('workloadImport.preview')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={onImport}
          disabled={!text.trim() || importSuccess || isDemoData || isLoading}
          loading={isLoading}
        >
          {t('workloadImport.import')}
        </Button>
      </div>
    </div>
  )
}
