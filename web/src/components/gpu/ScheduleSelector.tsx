type TranslateFn = (key: string, options?: Record<string, unknown>) => string

interface ScheduleSelectorProps {
  t: TranslateFn
  startDate: string
  setStartDate: (value: string) => void
  durationHours: string
  setDurationHours: (value: string) => void
}

/**
 * Start-date and duration fields for the reservation form. Extracted
 * from ReservationFormModal.tsx (#21613) to reduce the parent
 * component's line count.
 */
export function ScheduleSelector({ t, startDate, setStartDate, durationHours, setDurationHours }: ScheduleSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.startDateLabel')}</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground" />
      </div>
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('gpuReservations.form.fields.durationLabel')}</label>
        <input type="number" value={durationHours} onChange={e => setDurationHours(e.target.value)}
          min="1" placeholder={t('gpuReservations.form.fields.durationPlaceholder')}
          className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground" />
      </div>
    </div>
  )
}
