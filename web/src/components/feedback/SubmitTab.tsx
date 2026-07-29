import {
  Eye, Pencil, Settings, Maximize2,
  ExternalLink, Loader2,
} from 'lucide-react'
import { Github } from '@/lib/icons'
import { cn } from '@/lib/cn'
import { useTranslation } from 'react-i18next'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { LazyMarkdown as ReactMarkdown } from '../ui/LazyMarkdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import type { CreateFeatureRequestInput } from '../../hooks/useFeatureRequests'
import type { RequestType, TargetRepo, ScreenshotItem, SuccessState } from './FeatureRequestTypes'
import {
  MIN_PARENT_ISSUE_NUMBER,
  DESCRIPTION_EDITOR_HEIGHT_CLASS,
  DESCRIPTION_EXAMPLE_MAX_HEIGHT_CLASS,
  preventModalScrollChaining,
} from './submitTab.utils'
import { SubmitTabAttachments } from './SubmitTabAttachments'
import { AuthGateBanner, FeedbackTokenMissingBanner, EditingDraftBanner, SubmitTypeSelector, RepositorySelector } from './SubmitTab.parts'
import { useSubmitFormHandler } from './useSubmitFormHandler'

export { SuccessView } from './SubmitTabSuccessView'

// ── Submit Form ──
interface SubmitFormProps {
  description: string
  setDescription: (v: string) => void
  requestType: RequestType
  setRequestType: (v: RequestType) => void
  targetRepo: TargetRepo
  setTargetRepo: (v: TargetRepo) => void
  screenshots: ScreenshotItem[]
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotItem[]>>
  isSubmitting: boolean
  canPerformActions: boolean
  feedbackTokenMissing: boolean
  editingDraftId: string | null
  setEditingDraftId: (id: string | null) => void
  initialRequestType?: RequestType
  error: string | null
  setError: (v: string | null) => void
  isPreviewFullscreen: boolean
  setIsPreviewFullscreen: (v: boolean) => void
  setPreviewImageSrc: (v: string | null) => void
  onSubmit: (payload: CreateFeatureRequestInput, options?: { timeout: number }) => Promise<{ github_issue_url?: string; screenshots_uploaded?: number; screenshots_failed?: number; warning?: string }>
  onSuccess: (result: SuccessState) => void
  onShowSetupDialog: () => void
  onShowLoginPrompt: () => void
  onReauthenticate: () => void
}

export function SubmitForm({
  description,
  setDescription,
  requestType,
  setRequestType,
  targetRepo,
  setTargetRepo,
  screenshots,
  setScreenshots,
  isSubmitting,
  canPerformActions,
  feedbackTokenMissing,
  editingDraftId,
  setEditingDraftId,
  initialRequestType,
  error,
  setError,
  isPreviewFullscreen,
  setIsPreviewFullscreen,
  setPreviewImageSrc,
  onSubmit,
  onSuccess,
  onShowSetupDialog,
  onShowLoginPrompt,
  onReauthenticate,
}: SubmitFormProps) {
  const { t } = useTranslation()
  const {
    directIssueUrl,
    errorDetails,
    descriptionExample,
    descriptionPlaceholder,
    descriptionTab, setDescriptionTab,
    parentIssueNumber, setParentIssueNumber,
    canLinkParentIssue,
    isCheckingParentIssueAccess,
    handlePaste,
    handleSubmit,
  } = useSubmitFormHandler({
    description,
    setScreenshots,
    requestType,
    targetRepo,
    screenshots,
    canPerformActions,
    error,
    setError,
    isPreviewFullscreen,
    setIsPreviewFullscreen,
    onSubmit,
    onSuccess,
    onShowLoginPrompt,
    t: t as unknown as (key: string, defaultValue?: string) => string,
  })

  const isAuthGated = !canPerformActions
  const inputsDisabled = isSubmitting || isAuthGated

  return (
    <form id="feedback-form" onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
        {isAuthGated && (
          <AuthGateBanner directIssueUrl={directIssueUrl} onShowLoginPrompt={onShowLoginPrompt} />
        )}

        {feedbackTokenMissing && (
          <FeedbackTokenMissingBanner targetRepo={targetRepo} description={description} />
        )}

        <EditingDraftBanner
          editingDraftId={editingDraftId}
          setEditingDraftId={setEditingDraftId}
          setDescription={setDescription}
          setRequestType={setRequestType}
          setTargetRepo={setTargetRepo}
          initialRequestType={initialRequestType}
        />

        <SubmitTypeSelector requestType={requestType} setRequestType={setRequestType} inputsDisabled={inputsDisabled} />

        <RepositorySelector targetRepo={targetRepo} setTargetRepo={setTargetRepo} inputsDisabled={inputsDisabled} />

        {(requestType === 'bug' && (canLinkParentIssue || isCheckingParentIssueAccess)) && (
          <details className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
            <summary className="cursor-pointer list-none text-xs font-medium text-foreground">
              {t('feedback.linkToParentIssue', 'Link to parent issue')}
            </summary>
            <div className="mt-3 space-y-2">
              {isCheckingParentIssueAccess ? (
                <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <p>{t('feedback.checkingIssueLinkAccess', 'Checking repository access…')}</p>
                </div>
              ) : canLinkParentIssue ? (
                <>
                  <label htmlFor="feedback-parent-issue" className="block text-xs font-medium text-muted-foreground">
                    {t('feedback.parentIssueNumber', 'Parent issue number')}
                  </label>
                  <input
                    id="feedback-parent-issue"
                    type="number"
                    min={MIN_PARENT_ISSUE_NUMBER}
                    inputMode="numeric"
                    value={parentIssueNumber}
                    onChange={e => setParentIssueNumber(e.target.value)}
                    disabled={inputsDisabled}
                    placeholder="12345"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden transition-colors focus:border-purple-500 disabled:opacity-60"
                  />
                  <p className="text-2xs text-muted-foreground">
                    {t('feedback.parentIssueHelp', 'If provided, this report will be linked as a child issue after submission.')}
                  </p>
                </>
              ) : null}
            </div>
          </details>
        )}

        {/* Description */}
        <div className="flex flex-col">
          <div className="flex items-center gap-3 mb-1.5 border-b border-border">
            <button
              type="button"
              onClick={() => setDescriptionTab('write')}
              className={`flex items-center gap-1.5 pb-1.5 text-xs font-medium transition-colors ${
                descriptionTab === 'write'
                  ? 'text-foreground border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Pencil className="w-3 h-3" />
              Write
            </button>
            <button
              type="button"
              onClick={() => setDescriptionTab('preview')}
              className={`flex items-center gap-1.5 pb-1.5 text-xs font-medium transition-colors ${
                descriptionTab === 'preview'
                  ? 'text-foreground border-b-2 border-purple-500'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
            {descriptionTab === 'preview' && description.trim() && (
              <button
                type="button"
                onClick={() => setIsPreviewFullscreen(true)}
                className="ml-auto pb-1.5 text-muted-foreground hover:text-foreground transition-colors"
                title="Expand preview"
                aria-label="Expand preview to fullscreen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {descriptionTab === 'write' ? (
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onPaste={handlePaste}
              onWheel={preventModalScrollChaining}
              onKeyDown={e => {
                // Cmd+Enter (Mac) / Ctrl+Enter (Win/Linux) submits the form,
                // matching the convention used by GitHub, Slack, and other
                // compose-style modals. See issue #8651.
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isSubmitting) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={descriptionPlaceholder}
              className={cn(
                'w-full overflow-y-auto px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 resize-none font-mono text-sm disabled:opacity-60 disabled:cursor-not-allowed',
                DESCRIPTION_EDITOR_HEIGHT_CLASS,
              )}
              disabled={inputsDisabled}
              aria-disabled={inputsDisabled}
            />
          ) : (
            <div
              onWheel={preventModalScrollChaining}
              className={cn(
                'w-full overflow-y-auto px-3 py-2 bg-secondary/50 border border-border rounded-lg ghmd',
                DESCRIPTION_EDITOR_HEIGHT_CLASS,
              )}
            >
              {description.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]}>
                  {description}
                </ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">{t('feedback.nothingToPreview', 'Nothing to preview')}</p>
              )}
            </div>
          )}
          {descriptionTab === 'write' && !description.trim() && (
            <div className="mt-2 rounded-lg border border-border bg-background/40">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('feedback.exampleReport', 'Example report')}
                </p>
                <button
                  type="button"
                  onClick={() => setDescription(descriptionExample)}
                  disabled={inputsDisabled}
                  className="text-xs font-medium text-purple-400 transition-colors hover:text-purple-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('feedback.useExample', 'Use example')}
                </button>
              </div>
              <pre
                onWheel={preventModalScrollChaining}
                className={cn(
                  'overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-muted-foreground',
                  DESCRIPTION_EXAMPLE_MAX_HEIGHT_CLASS,
                )}
              >
                {descriptionExample}
              </pre>
            </div>
          )}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              First line becomes the title. Add details below.
            </p>
            <div className="inline-flex items-center rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
              {t('feedback.submitShortcutHint')}
            </div>
          </div>
        </div>

        {/* Attachment Upload (images & videos) */}
        <SubmitTabAttachments
          screenshots={screenshots}
          setScreenshots={setScreenshots}
          setPreviewImageSrc={setPreviewImageSrc}
          inputsDisabled={inputsDisabled}
        />

        {/* Error with actionable guidance */}
        {errorDetails && (
          <div className="space-y-2">
            <p className="text-sm text-red-400">{errorDetails.message}</p>
            <div className="p-3 bg-secondary/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">
                {errorDetails.guidance}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={sanitizeUrl(directIssueUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs rounded-lg border border-border text-foreground hover:bg-secondary/50 transition-colors flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3 h-3" />
                  {t('feedback.openGitHubIssue')}
                </a>
                {errorDetails.action === 'reauthenticate' && (
                  <button
                    type="button"
                    onClick={onReauthenticate}
                    className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-1.5"
                  >
                    <Github className="w-3 h-3" />
                    {t('feedback.reauthenticateGitHub', 'Re-authenticate with GitHub')}
                  </button>
                )}
                {errorDetails.action === 'setup' && (
                  <button
                    type="button"
                    onClick={() => { setError(null); onShowSetupDialog() }}
                    className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-1.5"
                  >
                    <Settings className="w-3 h-3" />
                    {t('feedback.setupOAuth')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info */}
        <p className="text-xs text-muted-foreground">
          {t('feedback.submitInfo')}
        </p>
      </div>
    </form>
  )
}

export { SubmitFooter } from './SubmitTabFooter'
