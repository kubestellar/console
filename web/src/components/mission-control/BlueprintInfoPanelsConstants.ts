// ---------------------------------------------------------------------------
// Status display maps (shared with info panel components)
// ---------------------------------------------------------------------------

export const STATUS_COLORS: Record<string, string> = {
  pending: 'text-muted-foreground',
  running: 'text-amber-600 dark:text-amber-400',
  completed: 'text-green-600 dark:text-green-400',
  failed: 'text-red-600 dark:text-red-400',
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'READY TO DEPLOY',
  running: 'DEPLOYING',
  completed: 'INSTALLED',
  failed: 'FAILED',
}
