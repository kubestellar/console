import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react'
import { useToast } from '../ui/Toast'
import { emitScreenshotAttached } from '../../lib/analytics'
import { FeedbackTabBar } from './FeedbackModal.TabBar'
import { ScreenshotAttacher } from './FeedbackModal.ScreenshotAttacher'

type FeedbackType = 'bug' | 'feature'

interface ScreenshotItem {
  file: File
  preview: string
  mediaType?: 'image' | 'video'
}

interface FeedbackFormBodyProps {
  type: FeedbackType
  setType: (v: FeedbackType) => void
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  validationErrors: { title?: string; description?: string }
  setValidationErrors: React.Dispatch<React.SetStateAction<{ title?: string; description?: string }>>
  screenshots: ScreenshotItem[]
  setScreenshots: React.Dispatch<React.SetStateAction<ScreenshotItem[]>>
  submitError: string | null
  isSubmitting: boolean
  coins: number
  submitShortcutLabel: string
  onSubmit: (e: React.FormEvent) => void
  hasDraftRestored: boolean
}

export function FeedbackFormBody({
  type,
  setType,
  title,
  setTitle,
  description,
  setDescription,
  validationErrors,
  setValidationErrors,
  screenshots,
  setScreenshots,
  submitError,
  isSubmitting,
  coins,
  submitShortcutLabel,
  onSubmit,
  hasDraftRestored,
}: FeedbackFormBodyProps) {
  const { t } = useTranslation(['common'])
  const { showToast } = useToast()
  const formRef = useRef<HTMLFormElement>(null)

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const allItems = Array.from(items)
    const imageItems = allItems.filter(item => item.type.startsWith('image/'))
    if (imageItems.length === 0) return
    e.preventDefault()
    imageItems.forEach(item => {
      const file = item.getAsFile()
      if (file) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          setScreenshots(prev => [...prev, { file, preview: ev.target?.result as string }])
        }
        reader.onerror = (err) => {
          console.error('[Screenshot] Paste FileReader failed:', err)
          showToast('Failed to read pasted screenshot. Try attaching the image instead.', 'error')
        }
        reader.readAsDataURL(file)
      }
    })
    emitScreenshotAttached('paste', imageItems.length)
    showToast(`Screenshot${imageItems.length > 1 ? 's' : ''} added`, 'success')
  }

  return (
    <>
      {hasDraftRestored && (
        <div className="flex items-center gap-2 p-2 mb-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-muted-foreground">
          <span>{t('feedback.draftRestored')}</span>
        </div>
      )}

      <FeedbackTabBar type={type} onChange={setType} />

      <form ref={formRef} onSubmit={onSubmit}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (validationErrors.title) setValidationErrors(prev => ({ ...prev, title: undefined })) }}
              placeholder={type === 'bug' ? 'Brief description of the bug' : 'Brief description of the feature'}
              className={`w-full px-3 py-2.5 rounded-lg bg-secondary border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 ${validationErrors.title ? 'border-red-500' : 'border-border'}`}
              required
            />
            {validationErrors.title && <p className="mt-1 text-xs text-red-400">{validationErrors.title}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); if (validationErrors.description) setValidationErrors(prev => ({ ...prev, description: undefined })) }}
              onPaste={handlePaste}
              placeholder={type === 'bug'
                ? 'Steps to reproduce, expected behavior, actual behavior... (paste screenshots here!)'
                : 'Describe the feature, use case, and how it would help... (paste screenshots here!)'}
              rows={4}
              className={`w-full px-3 py-2.5 rounded-lg bg-secondary border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 resize-none ${validationErrors.description ? 'border-red-500' : 'border-border'}`}
              required
            />
            {validationErrors.description && <p className="mt-1 text-xs text-red-400">{validationErrors.description}</p>}
          </div>

          <ScreenshotAttacher screenshots={screenshots} setScreenshots={setScreenshots} />

          {submitError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="text-red-400">{submitError}</span>
            </div>
          )}

          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
            <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-muted-foreground">
              {screenshots.length > 0
                ? 'A GitHub issue will be created automatically with your screenshots attached.'
                : 'A GitHub issue will be created automatically. No GitHub login required.'}
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSubmitting ? 'Creating issue...' : `Submit & Earn ${coins} Coins`}
            {!isSubmitting && (
              <kbd className="ml-1 px-2 py-1 rounded-md bg-foreground/20 text-xs font-semibold leading-none shadow-xs">
                {submitShortcutLabel}
              </kbd>
            )}
          </button>
        </div>
      </form>
    </>
  )
}
