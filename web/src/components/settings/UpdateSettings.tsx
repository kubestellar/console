import { useState, useEffect } from 'react'
import {
  Download,
  RefreshCw,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Terminal,
  Ship,
} from 'lucide-react'
import { useVersionCheck } from '../../hooks/useVersionCheck'
import type { UpdateChannel } from '../../types/updates'

const CHANNEL_OPTIONS: { value: UpdateChannel; label: string; description: string }[] = [
  {
    value: 'stable',
    label: 'Stable (Weekly releases)',
    description: 'Recommended for production use',
  },
  {
    value: 'unstable',
    label: 'Unstable (Nightly releases)',
    description: 'Latest features, may be unstable',
  },
]

export function UpdateSettings() {
  const {
    currentVersion,
    commitHash,
    channel,
    setChannel,
    latestRelease,
    hasUpdate,
    isChecking,
    error,
    lastChecked,
    forceCheck,
  } = useVersionCheck()

  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false)

  // Check for updates on mount
  useEffect(() => {
    forceCheck()
  }, [forceCheck])

  const copyCommand = async (command: string, id: string) => {
    await navigator.clipboard.writeText(command)
    setCopiedCommand(id)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  const formatLastChecked = () => {
    if (!lastChecked) return 'Never'
    const now = Date.now()
    const diff = now - lastChecked
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`
    return new Date(lastChecked).toLocaleDateString()
  }

  const helmCommand = latestRelease
    ? `helm upgrade kc kubestellar-console/kubestellar-console --version ${latestRelease.tag.replace(/^v/, '')} -n kc`
    : 'helm upgrade kc kubestellar-console/kubestellar-console -n kc'

  const brewCommand = 'brew upgrade kubestellar/tap/kc-agent'

  return (
    <div id="system-updates-settings" className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${hasUpdate ? 'bg-green-500/20' : 'bg-secondary'}`}
          >
            <Download
              className={`w-5 h-5 ${hasUpdate ? 'text-green-400' : 'text-muted-foreground'}`}
            />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">System Updates</h2>
            <p className="text-sm text-muted-foreground">
              Check for and install console updates
            </p>
          </div>
        </div>
        <button
          onClick={forceCheck}
          disabled={isChecking}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          Check Now
        </button>
      </div>

      {/* Channel Selector */}
      <div className="mb-4">
        <label className="block text-sm text-muted-foreground mb-2">
          Update Channel
        </label>
        <div className="relative">
          <button
            onClick={() => setChannelDropdownOpen(!channelDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-secondary border border-border text-foreground hover:bg-secondary/80 transition-colors"
          >
            <span>
              {CHANNEL_OPTIONS.find((o) => o.value === channel)?.label}
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${channelDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {channelDropdownOpen && (
            <div className="absolute z-50 mt-2 w-full rounded-lg bg-card border border-border shadow-xl">
              {CHANNEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setChannel(option.value)
                    setChannelDropdownOpen(false)
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    channel === option.value ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="text-left">
                    <p
                      className={`text-sm ${channel === option.value ? 'text-primary font-medium' : 'text-foreground'}`}
                    >
                      {option.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                  {channel === option.value && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dev Mode Warning */}
      {!currentVersion.includes('nightly') && !currentVersion.includes('weekly') && currentVersion !== 'unknown' && (
        <div className="p-3 rounded-lg mb-4 bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400">
            Running development version. Set <code className="px-1 py-0.5 rounded bg-secondary">VITE_APP_VERSION</code> to test update detection.
          </p>
        </div>
      )}

      {/* Version Status */}
      <div
        className={`p-4 rounded-lg mb-4 ${
          hasUpdate
            ? 'bg-green-500/10 border border-green-500/20'
            : error
              ? 'bg-red-500/10 border border-red-500/20'
              : 'bg-secondary/30 border border-border'
        }`}
      >
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Current Version</span>
            <span className="text-sm font-mono text-foreground">
              {currentVersion}
              {commitHash !== 'unknown' && (
                <span className="text-muted-foreground"> ({commitHash.slice(0, 7)})</span>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Latest Available</span>
            <span className="text-sm font-mono text-foreground">
              {isChecking ? (
                <span className="text-muted-foreground">Checking...</span>
              ) : latestRelease ? (
                latestRelease.tag
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Status</span>
            <span
              className={`text-sm font-medium ${
                hasUpdate
                  ? 'text-green-400'
                  : error
                    ? 'text-red-400'
                    : 'text-muted-foreground'
              }`}
            >
              {error
                ? 'Error checking updates'
                : hasUpdate
                  ? 'Update available'
                  : 'Up to date'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Last Checked</span>
            <span className="text-sm text-muted-foreground">{formatLastChecked()}</span>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* Release Notes */}
      {latestRelease && latestRelease.releaseNotes && (
        <div className="mb-4">
          <button
            onClick={() => setShowReleaseNotes(!showReleaseNotes)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {showReleaseNotes ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Release Notes
          </button>
          {showReleaseNotes && (
            <div className="mt-2 p-4 rounded-lg bg-secondary/30 border border-border">
              <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">
                {latestRelease.releaseNotes}
              </pre>
              <a
                href={latestRelease.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-sm text-primary hover:underline"
              >
                View on GitHub
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Update Instructions */}
      {hasUpdate && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">How to Update</h3>

          {/* Web Console */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-foreground">Web Console</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Refresh your browser to load the latest version.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Browser
            </button>
          </div>

          {/* Local Agent */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-foreground">Local Agent</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Update via Homebrew to get the latest agent features.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
                {brewCommand}
              </code>
              <button
                onClick={() => copyCommand(brewCommand, 'brew')}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500 text-white text-sm hover:bg-green-600"
              >
                <Copy className="w-4 h-4" />
                {copiedCommand === 'brew' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Cluster Deployment */}
          <div className="p-4 rounded-lg bg-secondary/30 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Ship className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-foreground">
                Cluster Deployment
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Update your Helm release to the latest chart version.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
                {helmCommand}
              </code>
              <button
                onClick={() => copyCommand(helmCommand, 'helm')}
                className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
              >
                <Copy className="w-4 h-4" />
                {copiedCommand === 'helm' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
