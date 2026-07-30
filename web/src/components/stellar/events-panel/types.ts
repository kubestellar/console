export interface GroupConfig {
  key: 'critical' | 'warning' | 'info'
  label: string
  subtitle: string
  color: string
  background: string
}

export const GROUP_CONFIGS: GroupConfig[] = [
  {
    key: 'critical',
    label: 'Critical alerts',
    subtitle: 'Auto-investigation in progress',
    color: 'var(--s-critical)',
    background: 'rgba(229,73,73,0.06)',
  },
  {
    key: 'warning',
    label: 'High priority',
    subtitle: 'Investigation complete, awaiting input',
    color: 'var(--s-warning)',
    background: 'rgba(227,179,65,0.05)',
  },
  {
    key: 'info',
    label: 'Info',
    subtitle: 'On-demand investigation',
    color: 'var(--s-info)',
    background: 'transparent',
  },
]

export const EVENTS_PANEL_LAYOUT_STYLE = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } as const
export const FLEX_SPACER_STYLE = { flex: 1 } as const

export interface CurrentBatch {
  timestamp: string
  totalEvents: number
  solvingCount: number
}
