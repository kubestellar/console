import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePodLabelsContext } from './PodLabelsContext'
import { LabelsSection } from './LabelsSection'
import { AnnotationsSection } from './AnnotationsSection'

export interface PodLabelsTabProps {
  labels: Record<string, string> | null
  annotations: Record<string, string> | null
}

export function PodLabelsTab({ labels, annotations }: PodLabelsTabProps) {
  const { t } = useTranslation()
  const { describeLoading } = usePodLabelsContext()

  return (
    <div className="space-y-6">
      {describeLoading && !labels && !annotations ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">{t('drilldown.status.loadingLabels')}</span>
        </div>
      ) : (
        <>
          <LabelsSection labels={labels} />
          <AnnotationsSection annotations={annotations} />
        </>
      )}
    </div>
  )
}
