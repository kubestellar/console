import { AlertCircle, Check, ExternalLink, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react'
import type { TFunction } from 'i18next'
import { cn } from '../../lib/cn'
import { AgentIcon } from './AgentIcon'
import { PROVIDER_INFO, providerToIconMap, type KeyStatus } from './apiKeySettingsTypes'
import { Input } from '../ui/Input'

interface ProviderKeyFormProps {
  keyStatus: KeyStatus
  editingProvider: string | null
  newKeyValue: string
  showKey: boolean
  saving: boolean
  editError: string | null
  expandedAdvanced: Set<string>
  baseURLDraft: Record<string, string>
  baseURLSaved: Set<string>
  baseURLError: Record<string, string>
  t: TFunction
  onStartEditing: (provider: string) => void
  onCancelEditing: () => void
  onSetDeleteConfirmProvider: (provider: string) => void
  onSetNewKeyValue: (value: string) => void
  onSetShowKey: (show: boolean) => void
  onSetEditError: (error: string | null) => void
  onSaveKey: (provider: string) => void
  onToggleAdvanced: (provider: string, initialValue: string) => void
  onSetBaseURLDraft: (provider: string, value: string) => void
  onSaveBaseURL: (provider: string) => void
  getApiKeyErrorMessage: (message: string) => string
}

export function ProviderKeyForm({
  keyStatus,
  editingProvider,
  newKeyValue,
  showKey,
  saving,
  editError,
  expandedAdvanced,
  baseURLDraft,
  baseURLSaved,
  baseURLError,
  t,
  onStartEditing,
  onCancelEditing,
  onSetDeleteConfirmProvider,
  onSetNewKeyValue,
  onSetShowKey,
  onSetEditError,
  onSaveKey,
  onToggleAdvanced,
  onSetBaseURLDraft,
  onSaveBaseURL,
  getApiKeyErrorMessage,
}: ProviderKeyFormProps) {
  return (
    <div className="p-4 bg-secondary/30 border border-border rounded-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <AgentIcon
            provider={providerToIconMap(keyStatus.provider)}
            className="w-8 h-8"
          />
          <div>
            <h3 className="font-medium text-foreground">{keyStatus.displayName}</h3>
            <div className="flex items-center gap-2 mt-1">
              {keyStatus.configured ? (
                <>
                  {keyStatus.valid === true ? (
                    <span className="flex items-center gap-1 text-xs text-green-500">
                      <Check className="w-3 h-3" />
                      {t('agent.working')}
                    </span>
                  ) : keyStatus.valid === false ? (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="w-3 h-3" />
                      {t('agent.invalid')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Check className="w-3 h-3" />
                      {t('agent.configured')}
                    </span>
                  )}
                  {keyStatus.source === 'env' && (
                    <span className="text-xs text-muted-foreground">({t('agent.fromEnv')})</span>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t('agent.notConfigured')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {keyStatus.configured && keyStatus.source !== 'env' && (
            <button
              onClick={() => onSetDeleteConfirmProvider(keyStatus.provider)}
              disabled={saving}
              className="p-1.5 hover:bg-destructive/20 rounded transition-colors text-muted-foreground hover:text-destructive"
              title={t('agent.removeKey')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {PROVIDER_INFO[keyStatus.provider]?.docsUrl && (
            <a
              href={PROVIDER_INFO[keyStatus.provider].docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
              title={t('agent.getApiKey')}
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {editingProvider === keyStatus.provider ? (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              value={newKeyValue}
              onChange={(e) => {
                onSetNewKeyValue(e.target.value)
                onSetEditError(null)
              }}
              placeholder={PROVIDER_INFO[keyStatus.provider]?.placeholder || t('agent.enterApiKey')}
              className="px-3 py-2 pr-10 text-sm bg-background border-border focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button
              type="button"
              onClick={() => onSetShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground z-10"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {editError && (
            <div
              className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive cursor-help"
              title={editError}
            >
              {getApiKeyErrorMessage(editError)}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSaveKey(keyStatus.provider)}
              disabled={!newKeyValue.trim() || saving}
              className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/80 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                t('agent.saveAndValidate')
              )}
            </button>
            <button
              onClick={onCancelEditing}
              disabled={saving}
              className="px-3 py-1.5 bg-secondary text-secondary-foreground text-sm rounded-lg hover:bg-secondary/80"
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onStartEditing(keyStatus.provider)}
          disabled={keyStatus.source === 'env'}
          className={cn(
            'mt-3 w-full px-3 py-1.5 text-sm rounded-lg transition-colors',
            keyStatus.source === 'env'
              ? 'bg-secondary/50 text-muted-foreground cursor-not-allowed'
              : 'bg-secondary hover:bg-secondary/80 text-foreground'
          )}
        >
          {keyStatus.configured ? t('agent.updateKey') : t('agent.addKey')}
        </button>
      )}

      {keyStatus.source === 'env' && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('agent.envVariableNote')}
        </p>
      )}

      {keyStatus.baseURLEnvVar && (
        <div className="mt-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => onToggleAdvanced(keyStatus.provider, keyStatus.baseURL ?? '')}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className={cn('transition-transform', expandedAdvanced.has(keyStatus.provider) ? 'rotate-90' : '')}>
              ▸
            </span>
            {t('agent.advanced', 'Advanced')}
            {keyStatus.baseURL && (
              <span className="text-xs text-muted-foreground/70">
                — {keyStatus.baseURL}
                {keyStatus.baseURLSource === 'env' && ' (env)'}
              </span>
            )}
          </button>
          {expandedAdvanced.has(keyStatus.provider) && (
            <div className="mt-2 space-y-2">
              <label className="block text-xs font-medium text-foreground">
                {t('agent.baseUrlLabel', 'Base URL')}
              </label>
              <p className="text-xs text-muted-foreground">
                {t('agent.baseUrlHint', 'Override the endpoint this provider talks to. Leave blank to use the compiled-in default. The {{env}} environment variable takes precedence when set.', { env: keyStatus.baseURLEnvVar })}
              </p>
              <Input
                type="text"
                value={baseURLDraft[keyStatus.provider] ?? ''}
                onChange={(e) => onSetBaseURLDraft(keyStatus.provider, e.target.value)}
                placeholder="http://<service>.<namespace>.svc.cluster.local:8080"
                disabled={keyStatus.baseURLSource === 'env'}
                className="px-3 py-2 text-sm bg-background border-border focus:ring-1 focus:ring-primary"
              />
              {baseURLError[keyStatus.provider] && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {baseURLError[keyStatus.provider]}
                </p>
              )}
              {baseURLSaved.has(keyStatus.provider) && (
                <p className="text-xs text-yellow-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {t('agent.baseUrlRestartHint', 'Saved. Restart kc-agent for the change to take effect.')}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSaveBaseURL(keyStatus.provider)}
                  disabled={saving || keyStatus.baseURLSource === 'env'}
                  className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/80 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    t('agent.saveBaseUrl', 'Save Base URL')
                  )}
                </button>
              </div>
              {keyStatus.baseURLSource === 'env' && (
                <p className="text-xs text-muted-foreground">
                  {t('agent.baseUrlFromEnv', '{{env}} is currently set. Unset it to edit this value from the UI.', { env: keyStatus.baseURLEnvVar })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
