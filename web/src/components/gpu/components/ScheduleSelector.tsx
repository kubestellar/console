import { useTranslation } from 'react-i18next'

type TranslateFn = (key: string, options?: string | Record<string, unknown>) => string

interface ScheduleSelectorProps {
  startDate: string
  durationHours: string
  onStartDateChange: (value: string) => void
  onDurationHoursChange: (value: string) => void
}

export function ScheduleSelector({
  startDate,
  durationHours,
  onStartDateChange,
  onDurationHoursChange,
}: ScheduleSelectorProps) {
  const { t: tTyped } = useTranslation(['cards', 'common'])
  const t = tTyped as unknown as TranslateFn

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.startDateLabel')}</label>
        <input
          type="date"
          value={startDate}
          onChange={e => onStartDateChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.durationLabel')}</label>
        <input
          type="number"
          value={durationHours}
          onChange={e => onDurationHoursChange(e.target.value)}
          min="1"
          placeholder={t('gpuReservations.form.fields.durationPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>
    </div>
  )
}
