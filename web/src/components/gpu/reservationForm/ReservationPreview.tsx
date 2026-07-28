import { useTranslation } from 'react-i18next'

interface ReservationPreviewProps {
  title: string
  cluster: string
  namespace: string
  gpuCount: string
  startDate: string
  durationHours: string
  enforceQuota: boolean
  quotaName: string
  gpuResourceKey: string
}

export function ReservationPreview({
  title,
  cluster,
  namespace,
  gpuCount,
  startDate,
  durationHours,
  enforceQuota,
  quotaName,
  gpuResourceKey,
}: ReservationPreviewProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
      <div className="text-xs font-medium text-purple-400 mb-1">
        {t('gpuReservations.form.fields.preview')}
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>
          {t('gpuReservations.form.fields.previewFields.title')}{' '}
          <span className="text-foreground">{title || '...'}</span>
        </div>
        <div>
          {t('gpuReservations.form.fields.previewFields.cluster')}{' '}
          <span className="text-foreground">{cluster || '...'}</span>
        </div>
        <div>
          {t('gpuReservations.form.fields.previewFields.namespace')}{' '}
          <span className="text-foreground">{namespace || '...'}</span>
        </div>
        <div>
          {t('gpuReservations.form.fields.previewFields.gpus')}{' '}
          <span className="text-foreground">{gpuCount || '...'}</span>
        </div>
        <div>
          {t('gpuReservations.form.fields.previewFields.start')}{' '}
          <span className="text-foreground">{startDate || '...'}</span>
        </div>
        <div>
          {t('gpuReservations.form.fields.previewFields.duration')}{' '}
          <span className="text-foreground">{durationHours || '24'}h</span>
        </div>
        {enforceQuota && (
          <div>
            {t('gpuReservations.form.fields.previewFields.k8sQuota')}{' '}
            <span className="text-foreground">
              {quotaName || '...'} ({gpuResourceKey})
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
