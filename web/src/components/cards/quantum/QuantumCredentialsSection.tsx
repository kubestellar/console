import React, { useState, useEffect, useCallback } from 'react'
import { Key, Check, ShieldCheck, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../../lib/modals/ConfirmDialog'
import { useDrillDown } from '../../../hooks/useDrillDown'
import { useToast } from '../../ui/Toast'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

function buildQuantumMutationHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

interface QuantumCredentialsSectionProps {
  ibmAuthenticated: boolean
  ibmTokenStored: boolean
  sessionValidatedAt: number | null
  setSessionValidatedAt: (val: number | null) => void
  isAuthRefreshing: boolean
  refetchAuthStatus: () => Promise<void>
  token: string | null
  isDemoFallback: boolean
}

type IbmCredentialState = 'configured' | 'stored' | 'none'

export const QuantumCredentialsSection: React.FC<QuantumCredentialsSectionProps> = ({
  ibmAuthenticated,
  ibmTokenStored,
  sessionValidatedAt,
  setSessionValidatedAt,
  isAuthRefreshing,
  refetchAuthStatus,
  token,
  isDemoFallback,
}) => {
  const { t } = useTranslation(['cards', 'common'])
  const { open: openDrillDown, close: closeDrillDown } = useDrillDown()
  const { showToast } = useToast()

  const [showClearCredentialsDialog, setShowClearCredentialsDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const ibmCredentialState: IbmCredentialState =
    sessionValidatedAt !== null
      ? 'configured'
      : ibmTokenStored
        ? 'stored'
        : 'none'

  useEffect(() => {
    if (ibmAuthenticated && !isAuthRefreshing) {
      setSessionValidatedAt(Date.now())
    }
  }, [ibmAuthenticated, isAuthRefreshing, setSessionValidatedAt])

  useEffect(() => {
    if (!showClearCredentialsDialog || isClearing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowClearCredentialsDialog(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showClearCredentialsDialog, isClearing])

  const handleOpenCredentialsDialog = useCallback(() => {
    if (isDemoFallback) return

    const handleSaveCredentials = async (form: { apiKey: string; crn: string }) => {
      if (!form.apiKey.trim() || !form.crn.trim()) {
        throw new Error(t('quantumControlPanel.credentialFieldsRequired'))
      }

      const res = await fetch('/api/quantum/auth/save', {
        method: 'POST',
        headers: buildQuantumMutationHeaders(token),
        credentials: 'include',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
        body: JSON.stringify({
          api_key: form.apiKey,
          crn: form.crn,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || t('quantumControlPanel.saveCredentialsFailed'))
      }

      setMutationError(null)
      await refetchAuthStatus()
      showToast(t('quantumControlPanel.ibmCredentialsSaved'), 'success')
    }

    openDrillDown({
      type: 'quantum-credentials',
      title: t('quantumControlPanel.ibmCredentialsTitle'),
      data: {
        ibmAuthenticated,
        onSave: handleSaveCredentials,
        onClose: closeDrillDown,
      },
    })
  }, [ibmAuthenticated, openDrillDown, closeDrillDown, refetchAuthStatus, showToast, t, token, isDemoFallback])

  const handleClearCredentials = useCallback(async () => {
    if (isDemoFallback) return

    setIsClearing(true)
    try {
      const res = await fetch('/api/quantum/auth/clear', {
        method: 'DELETE',
        headers: buildQuantumMutationHeaders(token),
        credentials: 'include',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || t('quantumControlPanel.clearCredentialsFailed'))
      }

      setSessionValidatedAt(null)
      await refetchAuthStatus()
      setShowClearCredentialsDialog(false)
      setMutationError(null)
      showToast(t('quantumControlPanel.ibmCredentialsCleared'), 'success')
    } catch (err) {
      console.error('Error clearing credentials:', err)
      setMutationError(err instanceof Error ? err.message : t('quantumControlPanel.unknownError'))
    } finally {
      setIsClearing(false)
    }
  }, [refetchAuthStatus, showToast, t, token, setSessionValidatedAt, isDemoFallback])

  return (
    <>
      <div className="flex gap-2 items-stretch">
        <button
          onClick={handleOpenCredentialsDialog}
          disabled={isDemoFallback}
          className="flex-1 px-3 py-2 flex items-center justify-between rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('quantumControlPanel.ibmCredentialsLabel')}</span>
          </div>
          <div className={cn('flex items-center gap-1 text-xs font-semibold',
            ibmCredentialState === 'configured' && 'text-green-600 dark:text-green-400',
            ibmCredentialState === 'stored' && 'text-blue-600 dark:text-blue-400',
            ibmCredentialState === 'none' && 'text-gray-500 dark:text-gray-400',
          )}>
            {ibmCredentialState === 'configured' && (
              <>
                <ShieldCheck className="w-3 h-3" />
                {t('quantumControlPanel.credsConfigured')}
              </>
            )}
            {ibmCredentialState === 'stored' && (
              <>
                <Check className="w-3 h-3" />
                {t('quantumControlPanel.credsStored')}
              </>
            )}
            {ibmCredentialState === 'none' && t('quantumControlPanel.credsNone')}
          </div>
        </button>
        {ibmCredentialState === 'stored' && (
          <button
            onClick={() => { void refetchAuthStatus() }}
            disabled={isAuthRefreshing || isDemoFallback}
            className="px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 flex items-center"
            title={t('quantumControlPanel.validateNow')}
            aria-label={t('quantumControlPanel.validateNow')}
          >
            <RefreshCw className={cn('w-4 h-4 text-blue-600 dark:text-blue-400', isAuthRefreshing && 'animate-spin')} />
          </button>
        )}
        {ibmCredentialState !== 'none' && (
          <button
            onClick={() => setShowClearCredentialsDialog(true)}
            disabled={isClearing || isDemoFallback}
            className="px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 flex items-center"
            title={t('quantumControlPanel.clearCredentials')}
          >
            <Trash2 className={`w-4 h-4 ${isClearing ? 'text-gray-400' : 'text-red-600 dark:text-red-400'}`} />
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={showClearCredentialsDialog}
        onClose={() => setShowClearCredentialsDialog(false)}
        onConfirm={handleClearCredentials}
        title={t('quantumControlPanel.clearCredentialsTitle')}
        message={t('quantumControlPanel.clearCredentialsMessage')}
        confirmLabel={t('quantumControlPanel.clearCredentials')}
        cancelLabel={t('common:actions.cancel')}
        variant="danger"
        isLoading={isClearing}
      />

      {mutationError && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{mutationError}</p>
      )}
    </>
  )
}
