import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { stellarApi } from '../../services/stellar'
import { useMissions } from '../../hooks/useMissions'
import { AgentIcon } from '../agent/AgentIcon'
import type { ProviderSession } from '../../types/stellar'

const PROVIDER_LABEL_STYLE = { fontWeight: 600 } as const

const PROVIDER_SUBLABEL_STYLE = {
  fontSize: 10,
  color: 'var(--s-text-dim)',
} as const

const PROVIDER_TRUNCATED_SUBLABEL_STYLE = {
  ...PROVIDER_SUBLABEL_STYLE,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const PROVIDER_ICON_PLACEHOLDER_STYLE = { width: 16 } as const

const PROVIDER_TEXT_CONTAINER_STYLE = {
  flex: 1,
  minWidth: 0,
} as const

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
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [stellarProviders, setStellarProviders] = useState<ProviderOption[]>([])
  const [isLoadingProviders, setIsLoadingProviders] = useState(true)
  const [providersError, setProvidersError] = useState<string | null>(null)

  // Pull live CLI/local-LLM agents from the same source as AI Missions
  const { agents } = useMissions()

  const loadProviders = useCallback(async () => {
    setIsLoadingProviders(true)
    setProvidersError(null)
    try {
      const resp = await stellarApi.getProviders({ fallbackOnError: false })
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
    } catch {
      setStellarProviders([])
      setProvidersError(t('stellar.providerLoadFailed', 'Could not load provider list.'))
    } finally {
      setIsLoadingProviders(false)
    }
  }, [t])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

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
        className="flex items-center gap-1 px-2 py-0.5"
        style={{
          border: '1px solid var(--s-border)',
          borderRadius: 'var(--s-rs)',
          fontSize: 10,
          color: 'var(--s-text-muted)',
          background: 'var(--s-bg)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {selectedLabel} ▾
      </button>

      {open && (
        <div className="mt-1 max-h-[340px] overflow-y-auto p-1" style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          minWidth: 280,
          background: 'var(--s-surface)',
          border: '1px solid var(--s-border)',
          borderRadius: 'var(--s-rs)',
          zIndex: 40,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>

          {/* Auto / default */}
          <button
            onClick={() => {
              onSelect({ provider: '', model: '', source: 'auto' })
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px]"
            style={{
              background: !session?.provider ? 'rgba(99,102,241,0.12)' : 'transparent',
              border: 'none', color: 'var(--s-text)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>✦</span>
            <div>
              <div style={PROVIDER_LABEL_STYLE}>Auto</div>
              <div style={PROVIDER_SUBLABEL_STYLE}>Use best available provider</div>
            </div>
          </button>

          {/* CLI Agents — same providers that power AI Missions */}
          {cliOptions.length > 0 && (
            <>
              <div className="mt-1 px-2 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--s-text-dim)' }}>
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
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px]"
                    style={{
                      background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                      border: 'none', color: 'var(--s-text)',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.agentProvider
                      ? <AgentIcon provider={opt.agentProvider as never} className="w-4 h-4 shrink-0" />
                      : <span style={PROVIDER_ICON_PLACEHOLDER_STYLE} />}
                    <div style={PROVIDER_TEXT_CONTAINER_STYLE}>
                      <div style={PROVIDER_LABEL_STYLE}>{opt.label}</div>
                      <div style={PROVIDER_TRUNCATED_SUBLABEL_STYLE}>{opt.sublabel}</div>
                    </div>
                    <span style={{ fontSize: 8, color: 'var(--s-success)', flexShrink: 0 }}>●</span>
                  </button>
                )
              })}
            </>
          )}

          {/* LLM Providers — configured via Stellar provider settings */}
          {(isLoadingProviders || providersError || stellarProviders.length > 0) && (
            <>
              <div
                className={`mt-1 px-2 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${cliOptions.length > 0 ? 'border-t pt-2' : 'pt-0.5'}`}
                style={{
                  color: 'var(--s-text-dim)',
                  borderTopColor: 'var(--s-border)',
                }}
              >
                LLM Providers
              </div>
              {isLoadingProviders ? (
                <div className="flex items-center gap-2 px-2 py-2.5 text-[11px]" style={{ color: 'var(--s-text-dim)' }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{t('loading', 'Loading…')}</span>
                </div>
              ) : providersError ? (
                <div className="mx-2 mt-1.5 rounded-lg border px-2.5 py-2" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: 'var(--s-text)' }}>
                  <div className="flex items-center gap-2 text-[11px]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>{providersError}</span>
                  </div>
                  <button
                    onClick={() => void loadProviders()}
                    className="mt-2"
                    style={{ border: 'none', background: 'transparent', color: 'var(--s-text)', fontSize: 10, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                  >
                    {t('retry', 'Retry')}
                  </button>
                </div>
              ) : (
                stellarProviders.map(opt => {
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
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px]"
                      style={{
                        background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
                        border: 'none', color: opt.available ? 'var(--s-text)' : 'var(--s-text-dim)',
                        cursor: opt.available ? 'pointer' : 'default',
                      }}
                    >
                      <span style={PROVIDER_ICON_PLACEHOLDER_STYLE} />
                      <div style={PROVIDER_TEXT_CONTAINER_STYLE}>
                        <div style={PROVIDER_LABEL_STYLE}>{opt.label}</div>
                        {opt.sublabel && <div style={PROVIDER_SUBLABEL_STYLE}>{opt.sublabel}</div>}
                      </div>
                      <span style={{ fontSize: 8, color: opt.available ? 'var(--s-success)' : 'var(--s-text-dim)', flexShrink: 0 }}>
                        {opt.available ? '●' : '○'}
                      </span>
                    </button>
                  )
                })
              )}
            </>
          )}

          {cliOptions.length === 0 && !isLoadingProviders && !providersError && stellarProviders.length === 0 && (
            <div className="px-2 py-2.5 text-center text-[11px]" style={{ color: 'var(--s-text-dim)' }}>
              No providers detected. Configure an AI agent in the toolbar above.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
