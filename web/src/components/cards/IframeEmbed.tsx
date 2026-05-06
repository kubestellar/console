import { useState, useEffect, useCallback, useRef } from 'react'
import { useCardExpanded } from './CardWrapper'
import {
  ExternalLink, Settings, X, AlertTriangle,
  RotateCcw, Globe, Save, Trash2
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { Skeleton } from '../ui/Skeleton'
import type { CSSProperties } from 'react'

// Inline style constants
const IFRAME_EMBED_IFRAME_STYLE_1: CSSProperties = { border: 'none', display: 'block' }


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

/**
 * Allowed URL schemes for iframe embedding.
 * javascript:, data:, and other schemes must never be loaded in an iframe src
 * because they bypass sandbox restrictions and execute in the embedder's origin.
 */
const ALLOWED_URL_SCHEMES = ['http:', 'https:']

/**
 * Validate a URL before using it as an iframe src.
 * Returns the original URL if it has an allowed scheme, or an empty string
 * if the scheme is disallowed (e.g. javascript:, data:, blob:).
 * This prevents XSS-through-DOM attacks via scheme injection.
 */
function sanitizeIframeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    // Return parsed.href (URL object property) not the raw input — this breaks
    // CodeQL's js/xss-through-dom taint chain at the URL parse boundary.
    return ALLOWED_URL_SCHEMES.includes(parsed.protocol) ? parsed.href : ''
  } catch {
    // Relative or malformed URLs — disallow
    return ''
  }
}

// Preset embeds for quick setup
const PRESET_EMBEDS = [
  { title: 'Grafana', url: 'http://localhost:3000', icon: '📊' },
  { title: 'Prometheus', url: 'http://localhost:9090', icon: '🔥' },
  { title: 'Kibana', url: 'http://localhost:5601', icon: '📈' },
  { title: 'ArgoCD', url: 'http://localhost:8080', icon: '🔄' },
  { title: 'Jaeger', url: 'http://localhost:16686', icon: '🔍' },
]

export function IframeEmbed({ config }: { config?: IframeEmbedConfig }) {
  const { t } = useTranslation(['common', 'cards'])
  const { isExpanded } = useCardExpanded()
  const { isDemoMode } = useDemoMode()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Each card instance has its own ID based on config or generates one
  const [instanceId] = useState(() => {
    if (config?.url) return btoa(config.url).slice(0, 12)
    return `embed_${Date.now()}`
  })

  const [url, setUrl] = useState(sanitizeIframeUrl(config?.url || ''))
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
        // Sanitize URL loaded from localStorage to guard against scheme injection
        // (e.g. javascript: or data: URLs stored by a compromised page)
        const safeUrl = sanitizeIframeUrl(saved.url)
        setUrl(safeUrl)
        setTitle(saved.title)
        setRefreshInterval(saved.refreshInterval)
        setUrlInput(safeUrl)
        setTitleInput(saved.title)
        setShowSettings(!safeUrl)
      }
    }
  }, [instanceId, config?.url, savedEmbeds])

  const handleRefresh = useCallback(() => {
    if (!iframeRef.current || !url) return
    setIsLoading(true)
    setLoadError(null)
    // Force iframe reload using the sanitized `url` state — never read back
    // from iframeRef.current.src (DOM property), which is an XSS-through-DOM
    // sink when written back without re-validation.
    iframeRef.current.src = ''
    setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.src = sanitizeIframeUrl(url)
      }
    }, 50)
    setLastRefresh(new Date())
  }, [url])

  // Auto-refresh (disabled in demo mode because the iframe itself is disabled)
  useEffect(() => {
    if (isDemoMode || refreshInterval <= 0 || !url) return

    const interval = setInterval(() => {
      handleRefresh()
    }, refreshInterval * 1000)

    return () => clearInterval(interval)
  }, [isDemoMode, refreshInterval, url, handleRefresh])

  const handleLoad = () => {
    setIsLoading(false)
    setLoadError(null)
  }

  const handleError = () => {
    setIsLoading(false)
    setLoadError('Failed to load content. The site may block embedding (X-Frame-Options) or be unavailable.')
  }

  const handleSaveConfig = () => {
    if (!urlInput.trim()) return

    const newUrl = sanitizeIframeUrl(urlInput.trim())
    if (!newUrl) return
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
      refreshInterval }

    setSavedEmbeds(prev => {
      const filtered = prev.filter(e => e.id !== instanceId)
      const updated = [...filtered, newSaved]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  const handleClear = () => {
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
  }

  const handlePresetSelect = (preset: typeof PRESET_EMBEDS[0]) => {
    setUrlInput(preset.url)
    setTitleInput(preset.title)
  }

  const openInNewTab = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const displayHeight = isExpanded ? 600 : height

  return (
    <div className="h-full flex flex-col">
      <div className="h-full flex flex-col">
        {/* Header controls */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
            {url && !showSettings ? (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={url}>
                {url}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t('cards:iframeEmbed.configureUrl')}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {url && !showSettings && (
              <>
                <button
                  onClick={openInNewTab}
                  className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
                  title={t('cards:iframeEmbed.openInNewTab')}
                  aria-label={t('cards:iframeEmbed.openInNewTab')}
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
              title={t('cards:iframeEmbed.settings')}
              aria-label={t('cards:iframeEmbed.settings')}
              aria-expanded={showSettings}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="mb-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
              <span className="text-sm font-medium">{t('cards:iframeEmbed.embedConfiguration')}</span>
              {url && (
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground"
                  aria-label={t('cards:iframeEmbed.closeSettingsAria')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* URL input */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('cards:iframeEmbed.urlLabel')}</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://grafana.example.com/d/dashboard"
                  className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('cards:iframeEmbed.titleLabel')}</label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder={t('cards:iframeEmbed.titlePlaceholder')}
                  className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('cards:iframeEmbed.autoRefreshLabel')}</label>
                  <input
                    type="number"
                    min="0"
                    max="3600"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 0)}
                    placeholder="0 = disabled"
                    className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('cards:iframeEmbed.heightLabel')}</label>
                  <input
                    type="number"
                    min="200"
                    max="1000"
                    value={height}
                    onChange={(e) => setHeight(parseInt(e.target.value) || DEFAULT_HEIGHT)}
                    className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Preset buttons */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('cards:iframeEmbed.quickPresets')}</label>
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
                  {t('cards:iframeEmbed.saveAndLoad')}
                </button>
                {url && (
                  <button
                    onClick={handleClear}
                    className="flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('cards:iframeEmbed.clear')}
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              {t('cards:iframeEmbed.iframeNote')}
            </p>
          </div>
        )}

        {/* Content area */}
        {!showSettings && (
          <div className="flex-1 relative rounded overflow-hidden border border-border/50">
            {/* Demo mode placeholder */}
            {isDemoMode && (
              <div
                className="flex flex-col items-center justify-center bg-secondary/20 text-muted-foreground gap-2"
                style={{ height: displayHeight }}
              >
                <Globe className="w-10 h-10 opacity-40" />
                <span className="text-sm font-medium">{title}</span>
                <span className="text-xs opacity-60">{t('cards:iframeEmbed.demoModePlaceholder')}</span>
              </div>
            )}

            {/* Skeleton loading state */}
            {!isDemoMode && isLoading && (
              <div className="absolute inset-0 z-10 p-4 space-y-3 bg-background/80">
                <Skeleton variant="text" width={180} height={16} />
                <Skeleton variant="rounded" height={displayHeight - 60} />
                <Skeleton variant="text" width={120} height={12} />
              </div>
            )}

            {/* Error state */}
            {!isDemoMode && loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10">
                <div className="flex flex-col items-center gap-3 text-center p-4 max-w-xs">
                  <AlertTriangle className="w-10 h-10 text-yellow-500" />
                  <p className="text-sm text-foreground">{t('cards:iframeEmbed.unableToLoad')}</p>
                  <p className="text-xs text-muted-foreground">{loadError}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleRefresh}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {t('cards:iframeEmbed.retryButton')}
                    </button>
                    <button
                      onClick={openInNewTab}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-secondary text-foreground rounded hover:bg-secondary/80"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {t('cards:iframeEmbed.openButton')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Iframe */}
            {!isDemoMode && url ? (
              <iframe
                ref={iframeRef}
                src={url}
                title={title}
                width="100%"
                height={displayHeight}
                style={IFRAME_EMBED_IFRAME_STYLE_1}
                sandbox={DEFAULT_SANDBOX.join(' ')}
                onLoad={handleLoad}
                onError={handleError}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            ) : !isDemoMode && (
              <div
                className="flex items-center justify-center bg-secondary/20 text-muted-foreground"
                style={{ height: displayHeight }}
              >
                <div className="text-center">
                  <Globe className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('cards:iframeEmbed.noUrlConfigured')}</p>
                  <p className="text-xs">{t('cards:iframeEmbed.clickSettings')}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Refresh interval indicator */}
        {!showSettings && url && refreshInterval > 0 && (
          <div className="mt-2 text-xs text-muted-foreground text-center">
            {t('cards:iframeEmbed.autoRefreshEvery', { seconds: refreshInterval })}
          </div>
        )}
      </div>
    </div>
  )
}
