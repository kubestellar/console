import { useState, useMemo, useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { BACKEND_DEFAULT_URL } from '../../../lib/constants'
import { emitWidgetDownloaded } from '../../../lib/analytics'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import {
  generateWidget,
  getWidgetFilename,
  type WidgetConfig
} from '../../../lib/widgets/codeGenerator'
import { copyToClipboard } from '../../../lib/clipboard'
import { safeRevokeObjectURL } from '../../../lib/download'
import {
  getWidgetPreviewDimensions,
  getWidgetPreviewScale
} from './WidgetExportModalPreview'
import { moveFocusByKey } from '../../../lib/a11y/rovingFocus'
import type { ExportTab } from './widgetExportConstants'

export function useWidgetExport(cardType?: string) {
  const [activeTab, setActiveTab] = useState<ExportTab>(
    cardType ? 'card' : 'templates'
  )
  const [selectedCard, setSelectedCard] = useState<string | null>(
    cardType || null
  )
  const [selectedStats, setSelectedStats] = useState<string[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(
    'cluster_overview'
  )
  const [apiEndpoint, setApiEndpoint] = useState(() => {
    // Use the current site origin on Netlify deployments so exported widgets
    // fetch from the Netlify Functions; fall back to local backend otherwise.
    const host = window.location.hostname
    if (host === 'console.kubestellar.io' || host.includes('netlify.app'))
      return window.location.origin
    return BACKEND_DEFAULT_URL
  })
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [copied, setCopied] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const isOnPublicSite =
    window.location.hostname === 'console.kubestellar.io' ||
    window.location.hostname.includes('netlify')
  const cardListRef = useRef<HTMLDivElement>(null)

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nextTab = moveFocusByKey(event, {
      selector: '[role="tab"]',
      orientation: 'horizontal'
    })
    const nextValue = nextTab?.dataset.tab as ExportTab | undefined
    if (nextValue) {
      setActiveTab(nextValue)
    }
  }

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  // Auto-scroll to the pre-selected card when opening via "Export Widget" menu
  useEffect(() => {
    if (!cardType || activeTab !== 'card') return
    const SCROLL_DELAY_MS = 100
    const timer = setTimeout(() => {
      const el = cardListRef.current?.querySelector(
        `[data-widget-card="${cardType}"]`
      )
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, SCROLL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [cardType, activeTab])

  // Determine what we're exporting
  const exportConfig: WidgetConfig | null = (() => {
    if (activeTab === 'card' && selectedCard) {
      return {
        type: 'card' as const,
        cardType: selectedCard,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark' as const
      }
    }
    if (activeTab === 'stats' && selectedStats.length > 0) {
      return {
        type: 'stat' as const,
        statIds: selectedStats,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark' as const
      }
    }
    if (activeTab === 'templates' && selectedTemplate) {
      return {
        type: 'template' as const,
        templateId: selectedTemplate,
        apiEndpoint,
        refreshInterval: refreshInterval * 1000,
        theme: 'dark' as const
      }
    }
    return null
  })()

  // Generate widget code
  const widgetCode = useMemo(() => {
    if (!exportConfig) return ''
    try {
      return generateWidget(exportConfig)
    } catch (err: unknown) {
      return `// Error generating widget: ${err}`
    }
  }, [exportConfig])

  const previewDimensions = useMemo(
    () => getWidgetPreviewDimensions(exportConfig),
    [exportConfig]
  )
  const previewScale = useMemo(
    () => getWidgetPreviewScale(previewDimensions),
    [previewDimensions]
  )
  const previewStyle = useMemo<CSSProperties>(
    () => ({
      transform: `scale(${previewScale})`,
      transformOrigin: 'top center'
    }),
    [previewScale]
  )

  const filename = exportConfig ? getWidgetFilename(exportConfig) : 'widget.jsx'

  // Download widget file
  const handleDownload = () => {
    if (!widgetCode) return

    setIsLoading(true)
    const blob = new Blob([widgetCode], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    safeRevokeObjectURL(url)
    setIsLoading(false)
    emitWidgetDownloaded('uebersicht')
  }

  // Copy to clipboard
  const handleCopy = async () => {
    if (!widgetCode) return
    await copyToClipboard(widgetCode)
    setCopied(true)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(
      () => setCopied(false),
      UI_FEEDBACK_TIMEOUT_MS
    )
  }

  // Toggle stat selection
  const toggleStat = (statId: string) => {
    setSelectedStats((prev) =>
      prev.includes(statId)
        ? prev.filter((s) => s !== statId)
        : [...prev, statId]
    )
  }

  return {
    activeTab,
    setActiveTab,
    selectedCard,
    setSelectedCard,
    selectedStats,
    selectedTemplate,
    setSelectedTemplate,
    apiEndpoint,
    setApiEndpoint,
    refreshInterval,
    setRefreshInterval,
    copied,
    showCode,
    setShowCode,
    isLoading,
    isOnPublicSite,
    cardListRef,
    handleTabKeyDown,
    exportConfig,
    widgetCode,
    previewStyle,
    filename,
    handleDownload,
    handleCopy,
    toggleStat
  }
}
