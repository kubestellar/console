import type { CustodianViolationSeverity } from '../../../lib/demo/cloud-custodian'

export function severityClass(sev: CustodianViolationSeverity): string {
  switch (sev) {
    case 'critical':
      return 'text-red-400'
    case 'high':
      return 'text-orange-400'
    case 'medium':
      return 'text-yellow-400'
    case 'low':
      return 'text-muted-foreground'
    default:
      return 'text-muted-foreground'
  }
}
