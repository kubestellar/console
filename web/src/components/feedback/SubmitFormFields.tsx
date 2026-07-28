import { Eye, ExternalLink, Maximize2, Pencil, Settings } from 'lucide-react'
import type { ClipboardEvent, Dispatch, SetStateAction } from 'react'
import { LazyMarkdown as ReactMarkdown } from '../ui/LazyMarkdown'
import { cn } from '@/lib/cn'
import { Github } from '@/lib/icons'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import type { TFunction } from 'i18next'
import type { ScreenshotItem } from './FeatureRequestTypes'
import {
  DESCRIPTION_EDITOR_HEIGHT_CLASS,
  DESCRIPTION_EXAMPLE_MAX_HEIGHT_CLASS,
  preventModalScrollChaining,
} from './submitTab.utils'
import { SubmitTabAttachments } from './SubmitTabAttachments'
import { TextArea } from '../ui/TextArea'

interface ErrorDetails {
  message: string
  guidance: string
  action: 'reauthenticate' | 'setup' | null
}

interface SubmitFormFieldsProps {
  descriptionTab: 'write' | 'preview'
  setDescriptionTab: (value: 'write' | 'preview') => void
  description: string
  setDescription: (value: string) => void
  descriptionPlaceholder: string
  descriptionExample: string
  screenshots: ScreenshotItem[]
  setScreenshots: Dispatch<SetStateAction<ScreenshotItem[]>>
  setPreviewImageSrc: (value: string | null) => void
  setIsPreviewFullscreen: (value: boolean) => void
  inputsDisabled: boolean
  isSubmitting: boolean
  onPaste: (event: ClipboardEvent) => void
  errorDetails: ErrorDetails | null
  directIssueUrl: string
  onReauthenticate: () => void
  onShowSetupDialog: () => void
  setError: (value: string | null) => void
  t: TFunction
}

export function SubmitFormFields({
  descriptionTab,
  setDescriptionTab,
  description,
  setDescription,
  descriptionPlaceholder,
  descriptionExample,
  screenshots,
  setScreenshots,
  setPreviewImageSrc,
  setIsPreviewFullscreen,
  inputsDisabled,
  isSubmitting,
  onPaste,
  errorDetails,
  directIssueUrl,
  onReauthenticate,
  onShowSetupDialog,
  setError,
  t,
}: SubmitFormFieldsProps) {
  return (
    <>
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
          <TextArea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onPaste={onPaste}
            onWheel={preventModalScrollChaining}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isSubmitting) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={descriptionPlaceholder}
            className={cn(
              'overflow-y-auto bg-secondary/50 font-mono',
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

      <SubmitTabAttachments
        screenshots={screenshots}
        setScreenshots={setScreenshots}
        setPreviewImageSrc={setPreviewImageSrc}
        inputsDisabled={inputsDisabled}
      />

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

      <p className="text-xs text-muted-foreground">
        {t('feedback.submitInfo')}
      </p>
    </>
  )
}
