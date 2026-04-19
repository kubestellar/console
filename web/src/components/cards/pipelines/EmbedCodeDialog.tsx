/**
 * EmbedCodeDialog — modal that generates an iframe embed URL and a markdown
 * badge snippet for a CI/CD pipeline card. Opened from each card's settings
 * or header menu.
 *
 * Provides:
 *   - A standalone owner/repo text input with validation
 *   - A preview of the embed URL
 *   - One-click copy for iframe HTML and markdown badge
 */
import { useState, useCallback, useMemo } from 'react'
import { Copy, Check, X, Code2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '../../ui/Input'
import { cn } from '../../../lib/cn'

/** Minimum ms the "Copied!" confirmation stays visible */
const COPY_FEEDBACK_MS = 2000

/** Default iframe width in pixels */
const DEFAULT_IFRAME_WIDTH = 600
/** Default iframe height in pixels */
const DEFAULT_IFRAME_HEIGHT = 400

/** Regex to validate owner/repo format (same as EmbedCard page) */
const REPO_FORMAT_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

/** Card type slug to embed route mapping */
export type EmbeddableCardType =
  | 'nightly-release-pulse'
  | 'workflow-matrix'
  | 'pipeline-flow'
  | 'recent-failures'

interface EmbedCodeDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Which card type to generate the embed for */
  cardType: EmbeddableCardType
  /** Human-readable card title */
  cardTitle: string
  /** Pre-filled repo (from current card filter state) */
  currentRepo?: string | null
  /** Close callback */
  onClose: () => void
}

export function EmbedCodeDialog({ open, cardType, cardTitle, currentRepo, onClose }: EmbedCodeDialogProps) {
  if (!open) return null
  const { t } = useTranslation()
  const [repo, setRepo] = useState(currentRepo ?? '')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const isValidRepo = useMemo(() => !repo || REPO_FORMAT_REGEX.test(repo.trim()), [repo])

  const baseUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://console.kubestellar.io'
    const repoParam = repo.trim() && REPO_FORMAT_REGEX.test(repo.trim())
      ? `?repo=${encodeURIComponent(repo.trim())}`
      : ''
    return `${origin}/embed/${cardType}${repoParam}`
  }, [cardType, repo])

  const iframeSnippet = useMemo(
    () => `<iframe src="${baseUrl}" width="${DEFAULT_IFRAME_WIDTH}" height="${DEFAULT_IFRAME_HEIGHT}" frameborder="0" title="${cardTitle}"></iframe>`,
    [baseUrl, cardTitle]
  )

  const markdownSnippet = useMemo(() => {
    const repoLabel = repo.trim() ? ` (${repo.trim()})` : ''
    return `[![${cardTitle}${repoLabel}](https://img.shields.io/badge/CI%2FCD-${encodeURIComponent(cardTitle)}-blue)](${baseUrl})`
  }, [baseUrl, cardTitle, repo])

  const copyToClipboard = useCallback(async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldId)
      setTimeout(() => setCopiedField(null), COPY_FEEDBACK_MS)
    } catch {
      // Fallback for insecure contexts (e.g. HTTP iframe)
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopiedField(fieldId)
      setTimeout(() => setCopiedField(null), COPY_FEEDBACK_MS)
    }
  }, [])

  // closeOnBackdropClick={false} — the repo input holds user-entered text the
  // user may not want to lose to a stray click. Close is reachable via the
  // explicit X button in the header.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('embed.getEmbedCode')}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Code2 size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              {t('embed.getEmbedCode')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
            aria-label={t('actions.close')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Repo input */}
          <div>
            <label htmlFor="embed-repo" className="block text-xs font-medium text-foreground mb-1.5">
              {t('embed.repoLabel')}
            </label>
            <Input
              id="embed-repo"
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/repo"
              inputSize="md"
              error={!isValidRepo}
              errorMessage={!isValidRepo ? t('embed.invalidRepo') : undefined}
            />
            <p className="text-2xs text-muted-foreground mt-1">{t('embed.repoHint')}</p>
          </div>

          {/* Embed URL preview */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('embed.embedUrl')}
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-2xs bg-secondary/50 border border-border rounded-lg px-3 py-2 text-muted-foreground break-all select-all">
                {baseUrl}
              </code>
              <CopyButton
                onClick={() => copyToClipboard(baseUrl, 'url')}
                copied={copiedField === 'url'}
              />
            </div>
          </div>

          {/* iframe snippet */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('embed.iframeSnippet')}
            </label>
            <div className="flex items-start gap-2">
              <code className="flex-1 text-2xs bg-secondary/50 border border-border rounded-lg px-3 py-2 text-muted-foreground break-all select-all whitespace-pre-wrap">
                {iframeSnippet}
              </code>
              <CopyButton
                onClick={() => copyToClipboard(iframeSnippet, 'iframe')}
                copied={copiedField === 'iframe'}
              />
            </div>
          </div>

          {/* Markdown badge */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {t('embed.markdownBadge')}
            </label>
            <div className="flex items-start gap-2">
              <code className="flex-1 text-2xs bg-secondary/50 border border-border rounded-lg px-3 py-2 text-muted-foreground break-all select-all whitespace-pre-wrap">
                {markdownSnippet}
              </code>
              <CopyButton
                onClick={() => copyToClipboard(markdownSnippet, 'markdown')}
                copied={copiedField === 'markdown'}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Small copy button with check feedback */
function CopyButton({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 p-2 rounded-lg border transition-colors',
        copied
          ? 'bg-green-500/10 border-green-500/30 text-green-400'
          : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50'
      )}
      title={copied ? t('embed.copied') : t('embed.copy')}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}
