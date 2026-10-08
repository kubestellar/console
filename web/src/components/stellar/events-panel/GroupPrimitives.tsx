import type { GroupConfig } from './types'

const GROUP_SUBTITLE_STYLE = { fontSize: 10, color: 'var(--s-text-dim)', fontStyle: 'italic' } as const
const EMPTY_STATE_CONTAINER_STYLE = { color: 'var(--s-text-dim)' } as const
const EMPTY_STATE_ICON_STYLE = { fontSize: 22, opacity: 0.4 } as const
const EMPTY_STATE_TEXT_STYLE = { fontSize: 12 } as const

export function Group({
  config, count, subtitle, children,
}: { config: GroupConfig; count: number; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 px-1">
      <div className="mb-1 flex items-baseline gap-2 px-1.5 py-1" style={{
        background: config.background,
        borderLeft: `3px solid ${config.color}`,
        borderRadius: 'var(--s-rs)',
      }}>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: config.color,
        }}>{config.label}</span>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
          color: config.color, opacity: 0.7,
        }}>{count}</span>
        <span style={GROUP_SUBTITLE_STYLE}>{subtitle ?? config.subtitle}</span>
      </div>
      <div className="flex flex-col gap-1">
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2" style={EMPTY_STATE_CONTAINER_STYLE}>
      <span style={EMPTY_STATE_ICON_STYLE}>{icon}</span>
      <span style={EMPTY_STATE_TEXT_STYLE}>{text}</span>
    </div>
  )
}
