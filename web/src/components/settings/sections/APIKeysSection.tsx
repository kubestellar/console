import { useState } from 'react'
import { Key } from 'lucide-react'
import { APIKeySettings } from '../../agent/APIKeySettings'

export function APIKeysSection() {
  const [showAPIKeySettings, setShowAPIKeySettings] = useState(false)

  return (
    <>
      <div id="api-keys-settings" className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary">
              <Key className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">AI Provider Keys</h2>
              <p className="text-sm text-muted-foreground">Configure API keys for Claude, OpenAI, and Gemini</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-secondary/30 mb-4">
          <p className="text-sm text-muted-foreground">
            API keys are stored securely on your local machine in <code className="px-1 py-0.5 rounded bg-secondary text-foreground">~/.kc/config.yaml</code> and are never sent to our servers.
          </p>
        </div>

        <button
          onClick={() => setShowAPIKeySettings(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
        >
          <Key className="w-4 h-4" />
          Manage API Keys
        </button>
      </div>

      <APIKeySettings isOpen={showAPIKeySettings} onClose={() => setShowAPIKeySettings(false)} />
    </>
  )
}
