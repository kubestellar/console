import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../lib/modals'
import { emitApiKeyConfigured, emitApiKeyRemoved, emitConversionStep } from '../../lib/analytics'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { ProviderKeyForm } from './ProviderKeyForm'
import { type KeyStatus, type RegisteredProvider } from './apiKeySettingsTypes'
import { buildBaseURLPayload, KC_AGENT_URL } from './apiKeySettingsUtils'

interface SavedKeysTableProps {
  keysStatus: KeyStatus[]
  registeredProviders: RegisteredProvider[]
  configPath: string
  initialError: string | null
  onRefresh: () => Promise<void>
}

export function SavedKeysTable({
  keysStatus,
  registeredProviders,
  configPath,
  initialError,
  onRefresh,
}: SavedKeysTableProps) {
  const { t } = useTranslation(['common', 'cards'])
  const [error, setError] = useState<string | null>(initialError)
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteConfirmProvider, setDeleteConfirmProvider] = useState<string | null>(null)
  const [newKeyValue, setNewKeyValue] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDeletingKey, setIsDeletingKey] = useState(false)
  const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(new Set())
  const [baseURLDraft, setBaseURLDraft] = useState<Record<string, string>>({})
  const [baseURLSaved, setBaseURLSaved] = useState<Set<string>>(new Set())
  const [baseURLError, setBaseURLError] = useState<Record<string, string>>({})

  useEffect(() => {
    setError(initialError)
  }, [initialError])

  const filteredKeys = useMemo(() => {
    if (registeredProviders.length === 0) return keysStatus
    const registeredNames = new Set((registeredProviders || []).map(p => p.name))
    return keysStatus.filter(k => registeredNames.has(k.provider))
  }, [keysStatus, registeredProviders])

  const getApiKeyErrorMessage = useCallback((message: string) => {
    if (message.includes('not_found_error')) {
      return t('agent.validationFailedModel')
    }
    if (message.includes('invalid_api_key') || message.includes('authentication')) {
      return t('agent.invalidApiKey')
    }
    if (message.includes('rate_limit')) {
      return t('agent.rateLimitExceeded')
    }
    return t('agent.failedToValidate')
  }, [t])

  const toggleAdvanced = useCallback((provider: string, initialValue: string) => {
    setExpandedAdvanced(prev => {
      const next = new Set(prev)
      if (next.has(provider)) {
        next.delete(provider)
      } else {
        next.add(provider)
        setBaseURLDraft(d => ({ ...d, [provider]: initialValue }))
      }
      return next
    })
  }, [])

  const handleSaveBaseURL = useCallback(async (provider: string) => {
    const draft = (baseURLDraft[provider] ?? '').trim()
    setBaseURLError(e => ({ ...e, [provider]: '' }))
    try {
      setSaving(true)
      const body = buildBaseURLPayload(provider, draft)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) {
        let message = t('agent.failedToSaveKey')
        try {
          const data = await response.json()
          message = data.message || message
        } catch {
          // Response body was not JSON — use default message
        }
        throw new Error(message)
      }
      setBaseURLSaved(prev => new Set(prev).add(provider))
      await onRefresh()
    } catch (err: unknown) {
      setBaseURLError(e => ({ ...e, [provider]: err instanceof Error ? err.message : t('agent.failedToSaveKey') }))
    } finally {
      setSaving(false)
    }
  }, [baseURLDraft, onRefresh, t])

  const handleSaveKey = async (provider: string) => {
    if (!newKeyValue.trim()) return

    try {
      setSaving(true)
      setEditError(null)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: newKeyValue }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!response.ok) {
        let message = t('agent.failedToSaveKey')
        try {
          const data = await response.json()
          message = data.message || message
        } catch {
          // Response body was not JSON — use default message
        }
        throw new Error(message)
      }

      setEditingProvider(null)
      setEditError(null)
      setNewKeyValue('')
      setShowKey(false)
      await onRefresh()
      emitApiKeyConfigured(provider)
      emitConversionStep(5, 'api_key', { provider })
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : t('agent.failedToSaveKey'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteKey = async (provider: string) => {
    try {
      setSaving(true)
      setIsDeletingKey(true)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys/${provider}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!response.ok) {
        let message = t('agent.failedToDeleteKey')
        try {
          const data = await response.json()
          message = data.message || message
        } catch {
          // Response body was not JSON — use default message
        }
        throw new Error(message)
      }

      await onRefresh()
      setDeleteConfirmProvider(null)
      emitApiKeyRemoved(provider)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('agent.failedToDeleteKey'))
    } finally {
      setIsDeletingKey(false)
      setSaving(false)
    }
  }

  const startEditing = (provider: string) => {
    setEditingProvider(provider)
    setNewKeyValue('')
    setShowKey(false)
    setEditError(null)
    setError(null)
  }

  const cancelEditing = () => {
    setEditingProvider(null)
    setEditError(null)
    setNewKeyValue('')
    setShowKey(false)
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive cursor-help"
          title={error}
        >
          {getApiKeyErrorMessage(error)}
        </div>
      )}

      {filteredKeys.map((keyStatus) => (
        <ProviderKeyForm
          key={keyStatus.provider}
          keyStatus={keyStatus}
          editingProvider={editingProvider}
          newKeyValue={newKeyValue}
          showKey={showKey}
          saving={saving}
          editError={editError}
          expandedAdvanced={expandedAdvanced}
          baseURLDraft={baseURLDraft}
          baseURLSaved={baseURLSaved}
          baseURLError={baseURLError}
          t={t}
          onStartEditing={startEditing}
          onCancelEditing={cancelEditing}
          onSetDeleteConfirmProvider={setDeleteConfirmProvider}
          onSetNewKeyValue={setNewKeyValue}
          onSetShowKey={setShowKey}
          onSetEditError={setEditError}
          onSaveKey={handleSaveKey}
          onToggleAdvanced={toggleAdvanced}
          onSetBaseURLDraft={(provider, value) => setBaseURLDraft(d => ({ ...d, [provider]: value }))}
          onSaveBaseURL={handleSaveBaseURL}
          getApiKeyErrorMessage={getApiKeyErrorMessage}
        />
      ))}

      {configPath && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          {t('agent.keysSavedTo')}: <code className="bg-secondary px-1 rounded">{configPath}</code>
        </p>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmProvider !== null}
        onClose={() => setDeleteConfirmProvider(null)}
        onConfirm={() => {
          if (deleteConfirmProvider) {
            void handleDeleteKey(deleteConfirmProvider)
          }
        }}
        title={t('agent.removeKey')}
        message={t('dashboard.delete.warning')}
        confirmLabel={t('actions.delete')}
        cancelLabel={t('actions.cancel')}
        variant="danger"
        isLoading={isDeletingKey}
      />
    </div>
  )
}
