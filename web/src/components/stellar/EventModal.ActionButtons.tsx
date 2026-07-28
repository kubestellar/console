import type { ReactNode } from 'react'

const CONFIRMATION_TEXTAREA_ROWS = 4

export function ActionButton({ children, color, disabled = false, onClick }: { children: ReactNode; color: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${color}`,
        color,
        background: 'var(--s-surface-2)',
        borderRadius: 8,
        opacity: disabled ? 0.5 : 1,
      }}
      className="px-3 py-1.5 text-sm font-medium"
    >
      {children}
    </button>
  )
}

export function ConfirmationPanel({
  title,
  description,
  value,
  onChange,
  placeholder,
  onCancel,
  onConfirm,
  confirmLabel,
  isSubmitting,
}: {
  title: string
  description: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  isSubmitting: boolean
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-[var(--s-text-muted)]">{description}</div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={CONFIRMATION_TEXTAREA_ROWS}
        className="w-full rounded border border-[var(--s-border)] bg-[var(--s-surface)] px-3 py-2 text-sm text-[var(--s-text)]"
        placeholder={placeholder}
      />
      <div className="flex flex-wrap gap-2">
        <ActionButton onClick={onCancel} color="var(--s-text-muted)">Cancel</ActionButton>
        <ActionButton onClick={onConfirm} color="var(--s-warning)" disabled={isSubmitting}>{isSubmitting ? 'Working…' : confirmLabel}</ActionButton>
      </div>
    </div>
  )
}
