import { Eye, Pencil, Maximize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { LazyMarkdown as ReactMarkdown } from '../ui/LazyMarkdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import {
  DESCRIPTION_EDITOR_HEIGHT_CLASS,
  DESCRIPTION_EXAMPLE_MAX_HEIGHT_CLASS,
  preventModalScrollChaining,
} from './submitTab.utils'
import type { RequestType } from './FeatureRequestTypes'

interface SubmitFormFieldsProps {
  description: string
  setDescription: (v: string) => void
  requestType: RequestType
  descriptionTab: 'write' | 'preview'
  setDescriptionTab: (v: 'write' | 'preview') => void
  isPreviewFullscreen: boolean
  setIsPreviewFullscreen: (v: boolean) => void
  inputsDisabled: boolean
  handlePaste: (e: React.ClipboardEvent) => void
  isSubmitting: boolean
  descriptionExample: string
  descriptionPlaceholder: string
}

export function SubmitFormFields({
  description,
  setDescription,
  requestType: _requestType,
  descriptionTab,
  setDescriptionTab,
  isPreviewFullscreen: _isPreviewFullscreen,
  setIsPreviewFullscreen,
  inputsDisabled,
  handlePaste,
  isSubmitting,
  descriptionExample,
  descriptionPlaceholder,
}: SubmitFormFieldsProps) {
  const { t } = useTranslation()

  return (
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
  )
}
