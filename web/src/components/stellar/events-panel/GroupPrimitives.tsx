import type { GroupConfig } from './types'

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
        <span style={{ fontSize: 10, color: 'var(--s-text-dim)', fontStyle: 'italic' }}>{subtitle ?? config.subtitle}</span>
      </div>
      <div className="flex flex-col gap-1">
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2" style={{ color: 'var(--s-text-dim)' }}>
      <span style={{ fontSize: 22, opacity: 0.4 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{text}</span>
    </div>
  )
}
