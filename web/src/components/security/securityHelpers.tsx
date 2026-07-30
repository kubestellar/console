
/** CSS classes for severity badge color coding. */
export function severityColor(severity: string) {
  switch (severity) {
    case 'high': return 'text-red-400 bg-red-500/20'
    case 'medium': return 'text-yellow-400 bg-yellow-500/20'
    case 'low': return 'text-blue-400 bg-blue-500/20'
    default: return 'text-muted-foreground bg-card'
  }
}

/** SVG icon for a security issue type. */
export function typeIcon(type: string) {
  switch (type) {
    case 'privileged':
      return (
        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      )
    case 'root':
      return (
        <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    default:
      return (
        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
  }
}

/** Human-readable label for a security issue type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTypeLabel(type: string, t: (...args: any[]) => string): string {
  const labels: Record<string, string> = {
    privileged: t('security.privilegedContainers'),
    root: t('security.runAsRoot'),
    hostNetwork: t('security.hostNetwork'),
    hostPID: t('security.hostPID'),
    noSecurityContext: t('security.noSecurityContext'),
  }
  return labels[type] || type
}
