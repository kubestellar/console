import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../lib/modals/BaseModal'
import { Button } from '../ui/Button'
import {
  getStatusIconClassName,
  getTypeIconComponent,
  type WorkloadStatus,
  type WorkloadType,
} from './WorkloadDeployment.utils'

interface StatusIconProps {
  status: WorkloadStatus
}

export function StatusIcon({ status }: StatusIconProps) {
  const Icon = getStatusIconClassName(status)
  const className = status === 'Running'
    ? 'h-4 w-4 text-green-500'
    : status === 'Degraded'
      ? 'h-4 w-4 text-yellow-500'
      : status === 'Pending'
        ? 'h-4 w-4 text-blue-500'
        : status === 'Failed'
          ? 'h-4 w-4 text-red-500'
          : 'h-4 w-4 text-muted-foreground'

  return <Icon className={className} />
}

interface TypeIconProps {
  type: WorkloadType
}

export function TypeIcon({ type }: TypeIconProps) {
  const Icon = getTypeIconComponent(type)
  const className = type === 'Deployment'
    ? 'h-4 w-4 text-blue-500'
    : type === 'StatefulSet'
      ? 'h-4 w-4 text-purple-500'
      : type === 'DaemonSet'
        ? 'h-4 w-4 text-orange-500'
        : type === 'Job' || type === 'CronJob'
          ? 'h-4 w-4 text-green-500'
          : 'h-4 w-4 text-muted-foreground'

  return <Icon className={className} />
}

interface ScaleToZeroConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  workloadName: string
  namespace: string
}

export function ScaleToZeroConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  workloadName,
  namespace,
}: ScaleToZeroConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('workloads.scaleToZero.title')}
        description={t('workloads.scaleToZero.description')}
        icon={AlertTriangle}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-sm text-yellow-300">
            {t('workloads.scaleToZero.warning', { workload: workloadName, namespace })}
          </p>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t('workloads.scaleToZero.impact')}</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>{t('workloads.scaleToZero.impactItem1')}</li>
            <li>{t('workloads.scaleToZero.impactItem2')}</li>
            <li>{t('workloads.scaleToZero.impactItem3')}</li>
          </ul>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex-1" />
        <div className="flex gap-3">
          <Button variant="ghost" size="lg" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" size="lg" onClick={onConfirm}>
            {t('workloads.scaleToZero.confirm')}
          </Button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
