import { useEffect, useMemo, useState } from 'react'
import { stellarApi } from '../../services/stellar'
import type { ProviderSession } from '../../types/stellar'

interface Props {
  session: ProviderSession | null
  onSelect: (session: ProviderSession) => void
}

export function ProviderSelector({ session, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [providers, setProviders] = useState<Array<{ name: string; displayName: string; model: string; available: boolean; latencyMs: number; source: ProviderSession['source'] }>>([])

  useEffect(() => {
    void stellarApi.getProviders().then((resp) => {
      const globalItems = (resp.global || []).map(item => ({ ...item, source: 'env-default' as const }))
      const userItems = (resp.user || []).map(item => ({
        name: item.provider,
        displayName: item.displayName || item.provider,
        model: item.model || '',
        available: true,
        latencyMs: item.lastLatency || 0,
        source: 'user-default' as const,
      }))
      setProviders([...userItems, ...globalItems])
    })
  }, [])

  const selected = session ?? { provider: 'auto', model: '', source: 'fallback' as const }
  const title = useMemo(() => `${selected.provider} · ${selected.model || 'default'}`, [selected.model, selected.provider])

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{ border: '1px solid var(--s-border)', borderRadius: 'var(--s-rs)', padding: '2px 6px', fontSize: 10, color: 'var(--s-text-muted)', background: 'var(--s-bg)' }}>
        {title} ▾
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 260, background: 'var(--s-surface)', border: '1px solid var(--s-border)', borderRadius: 'var(--s-rs)', zIndex: 40, padding: 6 }}>
          {(providers || []).map(provider => (
            <button
              key={`${provider.name}:${provider.model}`}
              onClick={() => {
                onSelect({ provider: provider.name, model: provider.model, source: provider.source })
                setOpen(false)
              }}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--s-text)', padding: 6, borderRadius: 4, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 11 }}>{provider.displayName} · {provider.model}</span>
              <span style={{ fontSize: 10, color: provider.available ? 'var(--s-success)' : 'var(--s-text-dim)' }}>{provider.latencyMs}ms</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
