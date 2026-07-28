interface AuditExportButtonProps {
  onClick: () => void
  disabled: boolean
  label: string
}

export function AuditExportButton({ onClick, disabled, label }: AuditExportButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-md border border-[var(--s-border)] bg-[var(--s-surface-2)] px-3 py-2 text-sm font-medium text-[var(--s-text)] transition hover:border-[var(--s-border-focus)] hover:text-[var(--s-text)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  )
}
