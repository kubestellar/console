import { useEffect, useMemo, useState } from 'react'
import { stellarApi } from '../../services/stellar'
import { useMissions } from '../../hooks/useMissions'
import { AgentIcon } from '../agent/AgentIcon'
import type { ProviderSession } from '../../types/stellar'

interface Props {
  session: ProviderSession | null
  onSelect: (session: ProviderSession) => void
}

interface ProviderOption {
  key: string
  label: string
  sublabel: string
  available: boolean
  source: ProviderSession['source']
  agentProvider?: string  // maps to AgentIcon's provider prop
}

export function ProviderSelector({ session, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [stellarProviders, setStellarProviders] = useState<ProviderOption[]>([])

  // Pull live CLI/local-LLM agents from the same source as AI Missions
  const { agents } = useMissions()

  useEffect(() => {
    void stellarApi.getProviders().then((resp) => {
      const userItems: ProviderOption[] = (resp.user || []).map(item => ({
        key: `user:${item.id}`,
        label: item.displayName || item.provider,
        sublabel: item.model || item.provider,
        available: true,
        source: 'user-default' as const,
      }))
      const globalItems: ProviderOption[] = (resp.global || []).map(item => ({
        key: `global:${item.name}`,
        label: item.displayName || item.name,
        sublabel: item.model || '',
        available: item.available,
        source: 'env-default' as const,
      }))
      setStellarProviders([...userItems, ...globalItems])
    }).catch(() => { /* ignore fetch errors */ })
  }, [])

  // Build CLI agent options from the same list that AI Missions uses
  const cliOptions: ProviderOption[] = useMemo(() =>
    (agents || [])
      .filter(a => a.available)
      .map(a => ({
        key: `cli:${a.name}`,
        label: a.displayName,
        sublabel: a.model ? a.model : 'CLI agent',
        available: true,
        source: 'env-default' as const,
        agentProvider: a.provider,
      })),
    [agents],
  )

  const selectedLabel = useMemo(() => {
    if (!session?.provider) return 'auto'
    // Try to find a human-readable label for the selected provider
    const allOpts = [...cliOptions, ...stellarProviders]
    const match = allOpts.find(o =>
      o.key === `cli:${session.provider}` ||
      o.key === `global:${session.provider}` ||
      o.key.startsWith('user:') && o.label === session.provider,
    )
    return match?.label ?? session.provider
  }, [session, cliOptions, stellarProviders])

  return (
    <div style={{ position: 'relative' }}>
      <button
        id="stellar-provider-selector-btn"
        onClick={() => setOpen(v => !v)}
        style={{
          border: '1px solid var(--s-border)',
          borderRadius: 'var(--s-rs)',
          padding: '2px 8px',
          fontSize: 10,
          color: 'var(--s-text-muted)',
          background: 'var(--s-bg)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {selectedLabel} ▾
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          marginTop: 4,
          minWidth: 280,
          background: 'var(--s-surface)',
          border: '1px solid var(--s-border)',
          borderRadius: 'var(--s-rs)',
          zIndex: 40,
          padding: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          maxHeight: 340,
          overflowY: 'auto',
        }}>

          {/* Auto / default */}
          <button
            onClick={() => {
              onSelect({ provider: '', model: '', source: 'fallback' })
              setOpen(false)
            }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              textAlign: 'left',
              background: !session?.provider ? 'rgba(99,102,241,0.12)' : 'transparent',
              border: 'none', color: 'var(--s-text)', padding: '6px 8px',
              borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}
          >
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>✦</span>
            <div>
              <div style={{ fontWeight: 600 }}>Auto</div>
              <div style={{ fontSize: 10, color: 'var(--s-text-dim)' }}>Use best available provider</div>
            </div>
          </button>

          {/* CLI Agents — same providers that power AI Missions */}
          {cliOptions.length > 0 && (
            <>
              <div style={{ padding: '6px 8px 2px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--s-text-dim)', marginTop: 4 }}>
                CLI Agents
              </div>
              {cliOptions.map(opt => {
                const agentName = opt.key.replace('cli:', '')
                const isSelected = session?.provider === agentName
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      onSelect({ provider: agentName, model: '', source: 'env-default', isCli: true })
                      setOpen(false)
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      textAlign: 'left',
                      background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                      border: 'none', color: 'var(--s-text)', padding: '6px 8px',
                      borderRadius: 4, cursor: 'pointer', fontSize: 11,
                    }}
                  >
                    {opt.agentProvider
                      ? <AgentIcon provider={opt.agentProvider as never} className="w-4 h-4 shrink-0" />
                      : <span style={{ width: 16 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--s-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.sublabel}</div>
                    </div>
                    <span style={{ fontSize: 8, color: 'var(--s-success)', flexShrink: 0 }}>●</span>
                  </button>
                )
              })}
            </>
          )}

          {/* LLM Providers — configured via Stellar provider settings */}
          {stellarProviders.length > 0 && (
            <>
              <div style={{
                padding: '6px 8px 2px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--s-text-dim)', marginTop: 4,
                borderTop: cliOptions.length > 0 ? '1px solid var(--s-border)' : 'none',
                paddingTop: cliOptions.length > 0 ? 8 : 2,
              }}>
                LLM Providers
              </div>
              {stellarProviders.map(opt => {
                const providerName = opt.key.replace(/^(global|user):/, '')
                const isSelected = session?.provider === providerName
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      if (!opt.available) return
                      onSelect({ provider: providerName, model: opt.sublabel, source: opt.source, isCli: false })
                      setOpen(false)
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      textAlign: 'left',
                      background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                      border: 'none', color: opt.available ? 'var(--s-text)' : 'var(--s-text-dim)',
                      padding: '6px 8px', borderRadius: 4,
                      cursor: opt.available ? 'pointer' : 'default', fontSize: 11,
                    }}
                  >
                    <span style={{ width: 16 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{opt.label}</div>
                      {opt.sublabel && <div style={{ fontSize: 10, color: 'var(--s-text-dim)' }}>{opt.sublabel}</div>}
                    </div>
                    <span style={{ fontSize: 8, color: opt.available ? 'var(--s-success)' : 'var(--s-text-dim)', flexShrink: 0 }}>
                      {opt.available ? '●' : '○'}
                    </span>
                  </button>
                )
              })}
            </>
          )}

          {cliOptions.length === 0 && stellarProviders.length === 0 && (
            <div style={{ padding: '10px 8px', fontSize: 11, color: 'var(--s-text-dim)', textAlign: 'center' }}>
              No providers detected. Configure an AI agent in the toolbar above.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
