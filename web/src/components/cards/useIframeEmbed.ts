import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export interface IframeEmbedConfig {
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
export const DEFAULT_HEIGHT = 400
/** Length of the existing URL-derived card instance identifier. */
const INSTANCE_ID_LENGTH = 12
/** Briefly clear the iframe source before reloading it. */
const RELOAD_DELAY_MS = 50
/** Convert the configured refresh interval from seconds to milliseconds. */
const MS_PER_SECOND = 1000

/**
 * Allowed URL schemes for iframe embedding.
 * javascript:, data:, and other schemes must never be loaded in an iframe src
 * because they bypass sandbox restrictions and execute in the embedder's origin.
 */
const ALLOWED_URL_SCHEMES = ['http:', 'https:']

/**
 * Validate a URL before using it as an iframe src.
 * Returns the normalized URL if it has an allowed scheme, or an empty string
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

/** Owns an embed's editable configuration, persistence, and reload lifecycle. */
export function useIframeEmbed(config: IframeEmbedConfig | undefined, shouldUseDemoData: boolean) {
  const { t } = useTranslation(['common', 'cards'])
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Each card instance has its own ID based on config or generates one
  const [instanceId] = useState(() => {
    if (config?.url) return btoa(config.url).slice(0, INSTANCE_ID_LENGTH)
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
      const saved = (savedEmbeds || []).find(e => e.id === instanceId)
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
    }, RELOAD_DELAY_MS)
    setLastRefresh(new Date())
  }, [url])

  // Auto-refresh (disabled in demo mode because the iframe itself is disabled)
  useEffect(() => {
    if (shouldUseDemoData || refreshInterval <= 0 || !url) return

    const interval = setInterval(() => {
      handleRefresh()
    }, refreshInterval * MS_PER_SECOND)

    return () => clearInterval(interval)
  }, [shouldUseDemoData, refreshInterval, url, handleRefresh])

  const handleLoad = () => {
    setIsLoading(false)
    setLoadError(null)
  }

  const handleError = () => {
    setIsLoading(false)
    setLoadError(t('cards:iframeEmbed.failedToLoadContent'))
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
      const filtered = (prev || []).filter(e => e.id !== instanceId)
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
      const filtered = (prev || []).filter(e => e.id !== instanceId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
      return filtered
    })
  }

  const handlePresetSelect = (preset: { url: string; title: string }) => {
    setUrlInput(preset.url)
    setTitleInput(preset.title)
  }

  const openInNewTab = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return {
    iframeRef, url, title, refreshInterval, setRefreshInterval, height, setHeight,
    showSettings, setShowSettings, isLoading, loadError, urlInput, setUrlInput,
    titleInput, setTitleInput, handleRefresh, handleLoad, handleError,
    handleSaveConfig, handleClear, handlePresetSelect, openInNewTab,
  }
}
