import { useRef } from 'react'
import { Bug, Lightbulb, ImagePlus, Trash2, Copy, Check, Film, ExternalLink, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../ui/StatusBadge'
import { REWARD_ACTIONS } from '../../hooks/useRewards'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { emitScreenshotAttached } from '../../lib/analytics'
import { ACCEPTED_MEDIA_TYPES, ATTACHMENT_HELP_TEXT } from './FeatureRequestTypes'
import { moveFocusByKey } from '../../lib/a11y/rovingFocus'
import type { FeedbackType } from './FeedbackModal.types'
import { LinkedInShareButton } from './FeedbackModal.actions'

interface FeedbackTabBarProps {
  type: FeedbackType
  setType: (t: FeedbackType) => void
}

export function FeedbackTabBar({ type, setType }: FeedbackTabBarProps) {
  const { t } = useTranslation(['common'])
  return (
    <div
      role="radiogroup"
      aria-label={t('feedback.feedbackType', 'Feedback type')}
      className="flex gap-2 mb-4"
      onKeyDown={(e) => {
        const next = moveFocusByKey(e, { selector: '[role="radio"]:not([disabled])', orientation: 'horizontal' })
        const nextType = next?.dataset.radioValue as FeedbackType | undefined
        if (nextType) setType(nextType)
      }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={type === 'bug'}
        tabIndex={type === 'bug' ? 0 : -1}
        data-radio-value="bug"
        onClick={() => setType('bug')}
        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70 ${
          type === 'bug' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        <Bug className="w-4 h-4" />
        <span className="text-sm font-medium">{t('feedback.bugReport', 'Bug Report')}</span>
        <StatusBadge color="yellow">+{REWARD_ACTIONS.bug_report.coins}</StatusBadge>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={type === 'feature'}
        tabIndex={type === 'feature' ? 0 : -1}
        data-radio-value="feature"
        onClick={() => setType('feature')}
        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/70 ${
          type === 'feature' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
        }`}
      >
        <Lightbulb className="w-4 h-4" />
        <span className="text-sm font-medium">{t('feedback.featureRequest', 'Feature Request')}</span>
        <StatusBadge color="yellow">+{REWARD_ACTIONS.feature_suggestion.coins}</StatusBadge>
      </button>
    </div>
  )
}

type ScreenshotItem = { file: File; preview: string; mediaType?: 'image' | 'video' }

interface ScreenshotAttacherProps {
  screenshots: ScreenshotItem[]
  isDragOver: boolean
  copiedIndex: number | null
  onFiles: (files: FileList | null) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onCopy: (preview: string, index: number) => void
  onRemove: (index: number) => void
}

export function ScreenshotAttacher({
  screenshots, isDragOver, copiedIndex,
  onFiles, onDragOver, onDragLeave, onDrop, onCopy, onRemove,
}: ScreenshotAttacherProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">
        Screenshots <span className="text-muted-foreground font-normal text-xs">(optional)</span>
      </label>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
          isDragOver ? 'border-purple-400 bg-purple-500/10' : 'border-border hover:border-muted-foreground'
        }`}
      >
        <div className="flex items-center gap-2">
          <ImagePlus className="w-5 h-5 text-muted-foreground" />
          <Film className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-xs text-muted-foreground text-center">Drop images or videos here, or click to browse</span>
        <span className="text-2xs text-muted-foreground/70">{ATTACHMENT_HELP_TEXT}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MEDIA_TYPES}
          multiple
          onChange={e => {
            const files = e.target.files
            if (files && files.length > 0) emitScreenshotAttached('file_picker', files.length)
            onFiles(files)
          }}
          className="hidden"
        />
      </div>
      {screenshots.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {screenshots.map((s, i) => (
            <div key={i} className="relative group w-20 h-20 shrink-0">
              {s.mediaType === 'video' ? (
                <div className="w-20 h-20 rounded-lg border border-border bg-black flex items-center justify-center overflow-hidden">
                  <video src={s.preview} className="w-full h-full object-cover" muted playsInline />
                  <Film className="absolute w-5 h-5 text-white/80 drop-shadow-md" />
                </div>
              ) : (
                <img src={s.preview} alt={`Attachment ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-border" loading="lazy" width={80} height={80} />
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 bg-black/60 rounded-lg transition-opacity">
                {s.mediaType !== 'video' && (
                  <button type="button" onClick={e => { e.stopPropagation(); onCopy(s.preview, i) }}
                    className="p-1.5 rounded-md bg-secondary/80 text-foreground hover:bg-secondary transition-colors"
                    title="Copy to clipboard" aria-label="Copy screenshot to clipboard">
                    {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button type="button" onClick={e => { e.stopPropagation(); onRemove(i) }}
                  className="p-1.5 rounded-md bg-secondary/80 text-red-400 hover:bg-red-500/20 transition-colors"
                  title="Remove attachment" aria-label="Remove screenshot">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface FeedbackSuccessViewProps {
  type: FeedbackType
  coins: number
  issueUrl?: string
  screenshotsUploaded?: number
  screenshotsFailed?: number
  screenshotCount: number
  appShortName: string
  onAwardLinkedIn: () => void
}

export function FeedbackSuccessView({
  type, coins, issueUrl, screenshotsUploaded, screenshotsFailed,
  screenshotCount, appShortName, onAwardLinkedIn,
}: FeedbackSuccessViewProps) {
  return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">Thank you!</h3>
      <p className="text-sm text-muted-foreground mb-2">
        Your {type === 'bug' ? 'bug report' : 'feature suggestion'} has been created as a GitHub issue.
      </p>
      <p className="text-sm text-yellow-400 mb-4">+{coins} coins earned!</p>

      {issueUrl && (
        <a href={sanitizeUrl(issueUrl)} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-sm font-medium transition-colors mb-4">
          <ExternalLink className="w-4 h-4" />
          View issue on GitHub
        </a>
      )}

      {screenshotCount > 0 && (screenshotsUploaded ?? 0) > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-xs text-green-400 font-medium">
            {(screenshotsUploaded ?? 0) === 1
              ? 'Screenshot attached to the issue. It will render as an image shortly.'
              : `${screenshotsUploaded} screenshots attached to the issue. They will render as images shortly.`}
          </p>
        </div>
      )}
      {screenshotCount > 0 && (screenshotsFailed ?? 0) > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs text-yellow-400 font-medium">
            {screenshotsFailed === 1
              ? 'Screenshot could not be attached — invalid image format.'
              : `${screenshotsFailed} screenshots could not be attached — invalid image format.`}
          </p>
        </div>
      )}

      <div className="pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-3">Love {appShortName}? Share it with your network!</p>
        <LinkedInShareButton onShare={onAwardLinkedIn} />
      </div>
    </div>
  )
}
