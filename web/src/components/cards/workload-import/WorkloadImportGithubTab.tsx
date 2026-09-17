/**
 * WorkloadImportGithubTab - import workloads from a GitHub repo path.
 */
import { Download, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button'
import { inputClasses, labelClasses } from './workloadImportDialog.constants'
import type { ParsedResource } from './workloadImportDialog.utils'
import { ImportErrorList, ImportSinglePreview } from './WorkloadImportShared'

export interface WorkloadImportGithubTabProps {
  url: string
  setUrl: (value: string) => void
  path: string
  setPath: (value: string) => void
  preview: ParsedResource | null
  errors: string[]
  importSuccess: boolean
  isDemoData: boolean
  isLoading: boolean
  onFieldChange: () => void
  onPreview: () => void
  onImport: () => void
}

export function WorkloadImportGithubTab({
  url,
  setUrl,
  path,
  setPath,
  preview,
  errors,
  importSuccess,
  isDemoData,
  isLoading,
  onFieldChange,
  onPreview,
  onImport,
}: WorkloadImportGithubTabProps) {
  const { t } = useTranslation('cards')

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('workloadImport.githubDescription')}
      </p>
      <div>
        <label className={labelClasses}>{t('workloadImport.githubRepoUrl')}</label>
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from WorkloadImportDialog split; migrate to ui/Input separately */}
        <input
          className={inputClasses}
          placeholder="https://github.com/org/repo"
          value={url}
          onChange={(e) => { setUrl(e.target.value); onFieldChange() }}
        />
      </div>
      <div>
        <label className={labelClasses}>{t('workloadImport.githubManifestPath')}</label>
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from WorkloadImportDialog split; migrate to ui/Input separately */}
        <input
          className={inputClasses}
          placeholder="k8s/ or deploy/manifests/"
          value={path}
          onChange={(e) => { setPath(e.target.value); onFieldChange() }}
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
