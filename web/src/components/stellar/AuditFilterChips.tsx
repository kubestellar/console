import { cn } from '../../lib/cn'

type DateRangeValue = 'all' | '24h' | '7d' | '30d'

interface DateRangeOption {
  label: string
  value: DateRangeValue
  windowMs: number | null
}

interface AuditFilterChipsProps {
  dateRangeOptions: readonly DateRangeOption[]
  selectedRange: DateRangeValue
  onSelect: (value: DateRangeValue) => void
}

export function AuditFilterChips({ dateRangeOptions, selectedRange, onSelect }: AuditFilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {dateRangeOptions.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          className={cn(
            'rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition',
            selectedRange === option.value
              ? 'border-[var(--s-border-focus)] bg-[var(--s-brand-dim)] text-[var(--s-brand)]'
              : 'border-[var(--s-border)] bg-[var(--s-surface-2)] text-[var(--s-text-muted)] hover:text-[var(--s-text)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
