import { useState, useEffect, useCallback, useRef } from 'react'
import { useCardExpanded } from './CardWrapper'
import {
  ExternalLink, Settings, X, AlertTriangle, Loader2,
  RotateCcw, Globe, Save, Trash2
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface IframeEmbedConfig {
  url?: string
  title?: string
  refreshInterval?: number // seconds, 0 = disabled
  height?: number // pixels
  sandboxPermissions?: string[]
}

interface SavedEmbed {
  id: string
  url: string
  title: string
  refreshInterval: number
}

const STORAGE_KEY = 'iframe_embed_saved'
const DEFAULT_HEIGHT = 400
const DEFAULT_SANDBOX = ['allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-popups']

// Preset embeds for quick setup
const PRESET_EMBEDS = [
  { title: 'Grafana', url: 'http://localhost:3000', icon: '📊' },
  { title: 'Prometheus', url: 'http://localhost:9090', icon: '🔥' },
  { title: 'Kibana', url: 'http://localhost:5601', icon: '📈' },
  { title: 'ArgoCD', url: 'http://localhost:8080', icon: '🔄' },
  { title: 'Jaeger', url: 'http://localhost:16686', icon: '🔍' },
]

export function IframeEmbed({ config }: { config?: IframeEmbedConfig }) {
  const { t } = useTranslation()
  const { isExpanded } = useCardExpanded()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Each card instance has its own ID based on config or generates one
  const [instanceId] = useState(() => {
    if (config?.url) return btoa(config.url).slice(0, 12)
    return `embed_${Date.now()}`
  })

  const [url, setUrl] = useState(config?.url || '')
  const [title, setTitle] = useState(config?.title || 'Embed')
  const [refreshInterval, setRefreshInterval] = useState(config?.refreshInterval || 0)
  const [height, setHeight] = useState(config?.height || DEFAULT_HEIGHT)

  const [showSettings, setShowSettings] = useState(!config?.url)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [, setLastRefresh] = useState(new Date())
  const [urlInput, setUrlInput] = useState(config?.url || '')
  const [titleInput, setTitleInput] = useState(config?.title || '')

  const [savedEmbeds, setSavedEmbeds] = useState<SavedEmbed[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Load saved config for this instance
  useEffect(() => {
    if (!config?.url) {
      const saved = savedEmbeds.find(e => e.id === instanceId)
      if (saved) {
        setUrl(saved.url)
        setTitle(saved.title)
        setRefreshInterval(saved.refreshInterval)
        setUrlInput(saved.url)
        setTitleInput(saved.title)
        setShowSettings(false)
      }
    }
  }, [instanceId, config?.url, savedEmbeds])

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0 || !url) return

    const interval = setInterval(() => {
      handleRefresh()
    }, refreshInterval * 1000)

    return () => clearInterval(interval)
  }, [refreshInterval, url])

  const handleRefresh = useCallback(() => {
    if (!iframeRef.current || !url) return
    setIsLoading(true)
    setLoadError(null)
    // Force iframe reload by resetting src
    const currentSrc = iframeRef.current.src
    iframeRef.current.src = ''
    setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.src = currentSrc
      }
    }, 50)
    setLastRefresh(new Date())
  }, [url])

  const handleLoad = useCallback(() => {
    setIsLoading(false)
    setLoadError(null)
  }, [])

  const handleError = useCallback(() => {
    setIsLoading(false)
    setLoadError('Failed to load content. The site may block embedding (X-Frame-Options) or be unavailable.')
  }, [])

  const handleSaveConfig = useCallback(() => {
    if (!urlInput.trim()) return

    const newUrl = urlInput.trim()
    const newTitle = titleInput.trim() || 'Embed'

    setUrl(newUrl)
    setTitle(newTitle)
    setShowSettings(false)
    setIsLoading(true)
    setLoadError(null)
    setLastRefresh(new Date())

    // Save to localStorage
    const newSaved: SavedEmbed = {
      id: instanceId,
      url: newUrl,
      title: newTitle,
      refreshInterval,
    }

    setSavedEmbeds(prev => {
      const filtered = prev.filter(e => e.id !== instanceId)
      const updated = [...filtered, newSaved]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [urlInput, titleInput, refreshInterval, instanceId])

  const handleClear = useCallback(() => {
    setUrl('')
    setTitle('Embed')
    setUrlInput('')
    setTitleInput('')
    setShowSettings(true)
    setLoadError(null)

    setSavedEmbeds(prev => {
      const filtered = prev.filter(e => e.id !== instanceId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
      return filtered
    })
  }, [instanceId])

  const handlePresetSelect = useCallback((preset: typeof PRESET_EMBEDS[0]) => {
    setUrlInput(preset.url)
    setTitleInput(preset.title)
  }, [])

  const openInNewTab = useCallback(() => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }, [url])

  const displayHeight = isExpanded ? 600 : height

  return (
    <div className="h-full flex flex-col">
      <div className="h-full flex flex-col">
        {/* Header controls */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {url && !showSettings ? (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={url}>
                {url}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Configure URL</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {url && !showSettings && (
              <>
                <button
                  onClick={openInNewTab}
                  className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1 rounded transition-colors ${
                showSettings
                  ? 'bg-primary/20 text-primary'
                  : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="mb-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Embed Configuration</span>
              {url && (
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* URL input */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">URL</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://grafana.example.com/d/dashboard"
                  className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">Title</label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="My Dashboard"
                  className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Auto-refresh (seconds)</label>
                  <input
                    type="number"
                    min="0"
                    max="3600"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 0)}
                    placeholder="0 = disabled"
                    className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Height (px)</label>
                  <input
                    type="number"
                    min="200"
                    max="1000"
                    value={height}
                    onChange={(e) => setHeight(parseInt(e.target.value) || DEFAULT_HEIGHT)}
                    className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Preset buttons */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Quick presets</label>
                <div className="flex flex-wrap gap-1">
                  {PRESET_EMBEDS.map(preset => (
                    <button
                      key={preset.title}
                      onClick={() => handlePresetSelect(preset)}
                      className="px-2 py-1 text-xs rounded bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      {preset.icon} {preset.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveConfig}
                  disabled={!urlInput.trim()}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  Save & Load
                </button>
                {url && (
                  <button
                    onClick={handleClear}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              Note: Some sites block iframe embedding. If content doesn't load, try opening in a new tab.
            </p>
          </div>
        )}

        {/* Content area */}
        {!showSettings && (
          <div className="flex-1 relative rounded overflow-hidden border border-border/50">
            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
                </div>
              </div>
            )}

            {/* Error state */}
            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10">
                <div className="flex flex-col items-center gap-3 text-center p-4 max-w-xs">
                  <AlertTriangle className="w-10 h-10 text-yellow-500" />
                  <p className="text-sm text-foreground">Unable to load content</p>
                  <p className="text-xs text-muted-foreground">{loadError}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleRefresh}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Retry
                    </button>
                    <button
                      onClick={openInNewTab}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-secondary text-foreground rounded hover:bg-secondary/80"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Iframe */}
            {url ? (
              <iframe
                ref={iframeRef}
                src={url}
                title={title}
                width="100%"
                height={displayHeight}
                style={{ border: 'none', display: 'block' }}
                sandbox={DEFAULT_SANDBOX.join(' ')}
                onLoad={handleLoad}
                onError={handleError}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            ) : (
              <div
                className="flex items-center justify-center bg-secondary/20 text-muted-foreground"
                style={{ height: displayHeight }}
              >
                <div className="text-center">
                  <Globe className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No URL configured</p>
                  <p className="text-xs">Click settings to add a URL</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Refresh interval indicator */}
        {!showSettings && url && refreshInterval > 0 && (
          <div className="mt-2 text-xs text-muted-foreground text-center">
            Auto-refreshes every {refreshInterval}s
          </div>
        )}
      </div>
    </div>
  )
}
