import { useTranslation } from 'react-i18next'

// ---------------------------------------------------------------------------
// FilterDropdown — labeled select dropdown
// ---------------------------------------------------------------------------

export function FilterDropdown({
  label,
  value,
  onChange,
  options,
  optionLabels,
  noAllOption }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  optionLabels?: Record<string, string>
  noAllOption?: boolean
}) {
  const { t } = useTranslation(['cards', 'common'])
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs text-muted-foreground font-medium">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground min-w-[100px]"
      >
        {!noAllOption && <option value="all">{t('common:common.all')}</option>}
        {options.map(o => (
          <option key={o} value={o}>{optionLabels?.[o] ?? o}</option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle switch — small pill-style toggle
// ---------------------------------------------------------------------------

export function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!active)} className="flex flex-wrap items-center justify-between gap-y-2 w-full group">
      <span className="text-2xs text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
      <span
        className={`relative inline-flex rounded-full transition-colors ${
          active ? 'bg-foreground/30' : 'bg-muted'
        }`}
        style={{ width: 26, height: 14 }}
      >
        <span
          className={`absolute rounded-full transition-all ${
            active ? 'bg-foreground' : 'bg-muted-foreground/50'
          }`}
          style={{ top: 2, width: 10, height: 10, left: active ? 14 : 2 }}
        />
      </span>
    </button>
  )
}
