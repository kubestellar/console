import { useTranslation } from 'react-i18next'
import { Input } from '../../ui/Input'

interface ScheduleSelectorProps {
  startDate: string
  onStartDateChange: (date: string) => void
  durationHours: number
  onDurationHoursChange: (hours: number) => void
}

export function ScheduleSelector({
  startDate,
  onStartDateChange,
  durationHours,
  onDurationHoursChange,
}: ScheduleSelectorProps) {
  const { t } = useTranslation(['cards'])

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('gpuReservations.form.startDate')}
        </label>
        <Input
          type="datetime-local"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          {t('gpuReservations.form.duration')}
        </label>
        <Input
          type="number"
          value={durationHours}
          onChange={(e) => onDurationHoursChange(parseInt(e.target.value) || 24)}
          min="1"
          max="8760"
          className="w-full"
        />
        <div className="text-xs text-muted-foreground mt-1">hours</div>
      </div>
    </div>
  )
}
