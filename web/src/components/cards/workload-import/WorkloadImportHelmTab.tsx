/**
 * WorkloadImportHelmTab - Helm chart/release import tab.
 */
import { Download, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button'
import { cn } from '../../../lib/cn'
import { inputClasses, labelClasses } from './workloadImportDialog.constants'
import type { ParsedResource } from './workloadImportDialog.utils'
import { ImportErrorList, ImportSinglePreview } from './WorkloadImportShared'

export interface WorkloadImportHelmTabProps {
  repoUrl: string
  setRepoUrl: (value: string) => void
  chartName: string
  setChartName: (value: string) => void
  releaseName: string
  setReleaseName: (value: string) => void
  namespace: string
  setNamespace: (value: string) => void
  values: string
  setValues: (value: string) => void
  preview: ParsedResource | null
  errors: string[]
  importSuccess: boolean
  isDemoData: boolean
  isLoading: boolean
  onFieldChange: () => void
  onPreview: () => void
  onImport: () => void
}

export function WorkloadImportHelmTab({
  repoUrl,
  setRepoUrl,
  chartName,
  setChartName,
  releaseName,
  setReleaseName,
  namespace,
  setNamespace,
  values,
  setValues,
  preview,
  errors,
  importSuccess,
  isDemoData,
  isLoading,
  onFieldChange,
  onPreview,
  onImport,
}: WorkloadImportHelmTabProps) {
  const { t } = useTranslation('cards')
  const canSubmit = repoUrl.trim() && chartName.trim() && releaseName.trim()

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t('workloadImport.helmDescription')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClasses}>{t('workloadImport.helmRepoUrl')}</label>
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from WorkloadImportDialog split; migrate to ui/Input separately */}
          <input
            className={inputClasses}
            placeholder="https://charts.example.com"
            value={repoUrl}
            onChange={(e) => { setRepoUrl(e.target.value); onFieldChange() }}
          />
        </div>
        <div>
          <label className={labelClasses}>{t('workloadImport.helmChartName')}</label>
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from WorkloadImportDialog split; migrate to ui/Input separately */}
          <input
            className={inputClasses}
            placeholder="my-chart"
            value={chartName}
            onChange={(e) => { setChartName(e.target.value); onFieldChange() }}
          />
        </div>
        <div>
          <label className={labelClasses}>{t('workloadImport.helmReleaseName')}</label>
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from WorkloadImportDialog split; migrate to ui/Input separately */}
          <input
            className={inputClasses}
            placeholder="my-release"
            value={releaseName}
            onChange={(e) => { setReleaseName(e.target.value); onFieldChange() }}
          />
        </div>
        <div>
          <label className={labelClasses}>{t('workloadImport.helmNamespaceLabel')}</label>
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from WorkloadImportDialog split; migrate to ui/Input separately */}
          <input
            className={inputClasses}
            placeholder="default"
            value={namespace}
            onChange={(e) => { setNamespace(e.target.value); onFieldChange() }}
          />
        </div>
      </div>
      <div>
        <label className={labelClasses}>{t('workloadImport.helmValuesLabel')}</label>
        {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from WorkloadImportDialog split; migrate to ui/TextArea separately */}
        <textarea
          className={cn(inputClasses, 'h-24 font-mono text-xs resize-y')}
          placeholder={t('workloadImport.helmValuesPlaceholder')}
          value={values}
          onChange={(e) => { setValues(e.target.value); onFieldChange() }}
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
          disabled={!canSubmit}
        >
          {t('workloadImport.preview')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={onImport}
          disabled={!canSubmit || importSuccess || isDemoData || isLoading}
          loading={isLoading}
        >
          {t('workloadImport.import')}
        </Button>
      </div>
    </div>
  )
}
