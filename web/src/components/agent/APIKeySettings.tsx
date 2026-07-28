import { useState, useEffect, useCallback, useRef } from 'react'
import { Key, Loader2 } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { KC_AGENT } from '../../config/externalApis'
import { useTranslation } from 'react-i18next'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'
import { SavedKeysTable } from './SavedKeysTable'
import { TestConnectionPanel } from './TestConnectionPanel'
import { type KeyStatus, type KeysStatusResponse, type RegisteredProvider } from './apiKeySettingsTypes'
import { KC_AGENT_URL, buildBaseURLPayload } from './apiKeySettingsUtils'

const INSTALL_COMMAND = KC_AGENT.installCommand

interface APIKeySettingsProps {
  isOpen: boolean
  onClose: () => void
}

export { buildBaseURLPayload }

export function APIKeySettings({ isOpen, onClose }: APIKeySettingsProps) {
  const { t } = useTranslation(['common', 'cards'])
  const [keysStatus, setKeysStatus] = useState<KeyStatus[]>([])
  const [registeredProviders, setRegisteredProviders] = useState<RegisteredProvider[]>([])
  const [configPath, setConfigPath] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number>(undefined)

  const fetchKeysStatus = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(t('agent.failedToFetchKeyStatus'))
      }
      const data: KeysStatusResponse = await response.json()
      setKeysStatus(data.keys || [])
      setRegisteredProviders(data.registeredProviders || [])
      setConfigPath(data.configPath || '')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('agent.failedToConnect'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (isOpen) {
      fetchKeysStatus()
    }
  }, [isOpen, fetchKeysStatus])

  const copyInstallCommand = async () => {
    await copyToClipboard(INSTALL_COMMAND)
    setCopied(true)
    timeoutRef.current = window.setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const registeredNames = new Set(registeredProviders.map(p => p.name))
  const filteredKeys = registeredProviders.length === 0
    ? keysStatus
    : keysStatus.filter(k => registeredNames.has(k.provider))

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('agent.apiKeySettings')}
        icon={Key}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error && filteredKeys.length === 0 ? (
          <TestConnectionPanel
            mode="connection-error"
            installCommand={INSTALL_COMMAND}
            copied={copied}
            onCopyInstallCommand={copyInstallCommand}
            onRetryConnection={fetchKeysStatus}
            t={t as (key: string) => string}
          />
        ) : filteredKeys.length === 0 ? (
          <TestConnectionPanel
            mode="no-providers"
            installCommand={INSTALL_COMMAND}
            copied={copied}
            onCopyInstallCommand={copyInstallCommand}
            onRetryConnection={fetchKeysStatus}
            t={t as (key: string) => string}
          />
        ) : (
          <SavedKeysTable
            keysStatus={keysStatus}
            registeredProviders={registeredProviders}
            configPath={configPath}
            initialError={error}
            onRefresh={fetchKeysStatus}
          />
        )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <p className="text-xs text-muted-foreground text-center flex-1">
          {t('agent.securityNote')}
        </p>
      </BaseModal.Footer>
    </BaseModal>
  )
}
