import { X, AlertTriangle, Settings, ExternalLink, Coins, Eye, Maximize2 } from 'lucide-react'
import { Save } from 'lucide-react'
import { Github } from '@/lib/icons'
import { Button } from '../ui/Button'
import { isDemoModeForced } from '../../lib/demoMode'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { useRef, useEffect } from 'react'

// ── Discard / Save Draft confirmation dialog ──

interface DiscardConfirmDialogProps {
  onSaveAndClose: () => void
  onDiscard: () => void
  onKeepEditing: () => void
}

export function DiscardConfirmDialog({
  onSaveAndClose,
  onDiscard,
  onKeepEditing,
}: DiscardConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-critical flex items-center justify-center bg-black/60 backdrop-blur-xs" role="presentation">
      <div className="bg-background border border-border rounded-lg shadow-xl p-6 max-w-sm w-full mx-4" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            {t('common:common.discardUnsavedChanges', 'Unsaved changes')}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          You have unsaved content. Would you like to save it as a draft for later?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveAndClose}
            className="w-full px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Draft & Close
          </button>
          <div className="flex gap-2">
            <button
              onClick={onDiscard}
              className="flex-1 px-4 py-2 text-sm rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
            >
              {t('common:common.discard', 'Discard')}
            </button>
            <button
              onClick={onKeepEditing}
              className="flex-1 px-4 py-2 text-sm rounded-lg border border-border hover:bg-secondary/50 text-foreground transition-colors"
            >
              {t('common:common.keepEditing', 'Keep editing')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Login Prompt Dialog ──

interface LoginPromptDialogProps {
  onClose: () => void
  onLoginRedirect: () => void
  onSetupOAuth: () => void
}

export function LoginPromptDialog({
  onClose,
  onLoginRedirect,
  onSetupOAuth,
}: LoginPromptDialogProps) {
  const { t } = useTranslation()
  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-critical"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-critical flex items-center justify-center p-4 pointer-events-none">
        {isDemoModeForced ? (
          /* Demo mode: simple prompt to get their own console */
          <div
            className="bg-background border border-border rounded-lg shadow-xl p-6 max-w-sm w-full pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t('feedback.loginRequired')}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t('feedback.loginDemoExplanation')}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={onClose}
                className="border border-border"
              >
                Cancel
              </Button>
              <button
                onClick={onLoginRedirect}
                className="px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors"
              >
                {t('feedback.getYourOwn')}
              </button>
            </div>
          </div>
        ) : (
          /* Localhost/cluster: OAuth setup guidance + GitHub issues fallback */
          <div
            className="bg-background border border-border rounded-lg shadow-xl p-6 max-w-md w-full pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Github className="w-4 h-4 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {t('feedback.oauthRequired')}
              </h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {t('feedback.oauthExplanation')}
            </p>

            {/* How it works */}
            <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Coins className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-semibold text-purple-400">{t('feedback.howItWorks')}</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">1.</span>
                  <span>{t('feedback.oauthStep1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">2.</span>
                  <span>{t('feedback.oauthStep2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">3.</span>
                  <span>{t('feedback.oauthStep3')}</span>
                </li>
              </ul>
            </div>

            {/* In the meantime */}
            <div className="p-3 bg-secondary/30 border border-border rounded-lg mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">{t('feedback.inTheMeantime')}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('feedback.githubIssuesInfo')}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={onClose}
                  className="border border-border"
                >
                  Cancel
                </Button>
                <a
                  href="https://github.com/kubestellar/console/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-secondary/50 transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('feedback.openGitHubIssue')}
                </a>
                <button
                  onClick={onSetupOAuth}
                  className="flex-1 px-4 py-2 text-sm rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition-colors flex items-center justify-center gap-2"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {t('feedback.setupOAuth')}
                </button>
              </div>
              <button
                onClick={onLoginRedirect}
                className="text-xs text-center text-muted-foreground hover:text-purple-400 transition-colors py-1"
              >
                {t('feedback.alreadySetUp')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Fullscreen Markdown Preview Overlay ──

interface FullscreenPreviewProps {
  description: string
  onClose: () => void
}

export function FullscreenPreview({ description, onClose }: FullscreenPreviewProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Expanded markdown preview"
    >
      <div className="relative w-[90vw] h-[85vh] max-w-5xl bg-background border border-border rounded-xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Eye className="w-4 h-4" />
            Markdown Preview
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            aria-label="Close expanded preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 ghmd">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
            {description}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

// ── Screenshot Preview Overlay ──

interface ScreenshotPreviewOverlayProps {
  src: string
  onClose: () => void
}

export function ScreenshotPreviewOverlay({ src, onClose }: ScreenshotPreviewOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Auto-focus the overlay so it can receive keyboard events (e.g. Escape)
  useEffect(() => {
    overlayRef.current?.focus()
  }, [])

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 backdrop-blur-xs outline-hidden"
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onClose()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot preview"
    >
      <div className="relative max-w-[90vw] max-h-[85vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Maximize2 className="w-4 h-4" />
            Screenshot Preview
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            aria-label="Close screenshot preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
          <img
            src={src}
            alt="Screenshot preview"
            className="max-w-full max-h-[75vh] object-contain rounded-lg"
          />
        </div>
      </div>
    </div>
  )
}
