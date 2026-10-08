import { useTranslation } from 'react-i18next'
import { Select } from '../../ui/Select'

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
      <Select
        selectSize="sm"
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="min-w-[100px]"
      >
        {!noAllOption && <option value="all">{t('common:common.all')}</option>}
        {options.map(o => (
          <option key={o} value={o}>{optionLabels?.[o] ?? o}</option>
        ))}
      </Select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle switch — small pill-style toggle
// ---------------------------------------------------------------------------

const TOGGLE_TRACK_STYLE = { width: 26, height: 14 } as const
const TOGGLE_KNOB_STYLE_ON = { top: 2, width: 10, height: 10, left: 14 } as const
const TOGGLE_KNOB_STYLE_OFF = { top: 2, width: 10, height: 10, left: 2 } as const

export function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!active)} className="flex flex-wrap items-center justify-between gap-y-2 w-full group">
      <span className="text-2xs text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
      <span
        className={`relative inline-flex rounded-full transition-colors ${
          active ? 'bg-foreground/30' : 'bg-muted'
        }`}
        style={TOGGLE_TRACK_STYLE}
      >
        <span
          className={`absolute rounded-full transition-all ${
            active ? 'bg-foreground' : 'bg-muted-foreground/50'
          }`}
          style={active ? TOGGLE_KNOB_STYLE_ON : TOGGLE_KNOB_STYLE_OFF}
        />
      </span>
    </button>
  )
}
