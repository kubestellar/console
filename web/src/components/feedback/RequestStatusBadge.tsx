interface RequestStatusBadgeProps {
  label: string
  className: string
}

export function RequestStatusBadge({ label, className }: RequestStatusBadgeProps) {
  return (
    <span className={`px-1.5 py-0.5 text-2xs font-medium rounded ${className}`}>
      {label}
    </span>
  )
}
