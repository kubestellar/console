import { cn } from '../../lib/cn'

interface DateRangeOption {
  label: string
  value: string
}

interface AuditFilterChipsProps {
  options: readonly DateRangeOption[]
  selectedRange: string
  onSelect: (value: string) => void
}

export function AuditFilterChips({ options, selectedRange, onSelect }: AuditFilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {(options || []).map(option => (
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
