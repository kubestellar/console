import { useState } from 'react'
import { Key, Check, AlertCircle } from 'lucide-react'

interface Props {
  data: Record<string, unknown>
}

interface CredentialForm {
  apiKey: string
  crn: string
}

export function QuantumCredentialsDrillDown({ data }: Props) {
  const [credentialForm, setCredentialForm] = useState<CredentialForm>({
    apiKey: '',
    crn: '',
  })
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [credentialSaving, setCredentialSaving] = useState(false)
  const ibmAuthenticated = (data.ibmAuthenticated as boolean) || false
  const onSave = data.onSave as ((form: CredentialForm) => Promise<void>) | undefined
  const onClose = data.onClose as (() => void) | undefined

  const handleSaveCredentials = async () => {
    if (!onSave) return

    try {
      setCredentialError(null)
      setCredentialSaving(true)
      await onSave(credentialForm)
      setCredentialForm({ apiKey: '', crn: '' })
      // Close the modal after successful save
      if (onClose) {
        onClose()
      }
    } catch (err) {
      setCredentialError(err instanceof Error ? err.message : 'Failed to save credentials')
    } finally {
      setCredentialSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Key className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">IBM Quantum Credentials</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your IBM Quantum API credentials for hardware access
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {credentialError && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{credentialError}</p>
          </div>
        )}

        {ibmAuthenticated && (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-start gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-green-700 dark:text-green-300">Credentials are configured. Enter new credentials to update.</p>
          </div>
        )}

        {/* API Key Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API Key
          </label>
          <input
            type="password"
            placeholder="Your IBM Quantum API Key"
            value={credentialForm.apiKey}
            onChange={e => setCredentialForm(prev => ({ ...prev, apiKey: e.target.value }))}
            disabled={credentialSaving}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Get your API key from <a href="https://quantum.ibm.com/account" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">IBM Quantum Platform</a>
          </p>
        </div>

        {/* CRN Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            CRN (Cloud Resource Name)
          </label>
          <input
            type="text"
            placeholder="crn:v1:bluemix:public:quantum-computing:..."
            value={credentialForm.crn}
            onChange={e => setCredentialForm(prev => ({ ...prev, crn: e.target.value }))}
            disabled={credentialSaving}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm disabled:opacity-50"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Find your CRN in IBM Quantum Platform account settings
          </p>
        </div>
      </div>

      {/* Footer with Actions */}
      <div className="flex gap-2 p-4 border-t border-border bg-card/50">
        <button
          onClick={handleSaveCredentials}
          disabled={credentialSaving || !credentialForm.apiKey.trim() || !credentialForm.crn.trim()}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-50 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
        >
          {credentialSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save Credentials
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default QuantumCredentialsDrillDown
