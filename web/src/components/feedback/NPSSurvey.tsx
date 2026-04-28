import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Send, CheckCircle2 } from 'lucide-react'
import { useNPSSurvey } from '../../hooks/useNPSSurvey'
import { useToast } from '../ui/Toast'
import { cn } from '../../lib/cn'

const NPS_OPTIONS = [
  { score: 1, emoji: '\u{1F620}', labelKey: 'nps.notGreat' as const, category: 'detractor' as const },
  { score: 2, emoji: '\u{1F610}', labelKey: 'nps.meh' as const, category: 'passive' as const },
  { score: 3, emoji: '\u{1F642}', labelKey: 'nps.good' as const, category: 'satisfied' as const },
  { score: 4, emoji: '\u{1F60D}', labelKey: 'nps.loveIt' as const, category: 'promoter' as const },
] as const

/** Auto-hide thank-you message after this many ms */
const THANK_YOU_DISPLAY_MS = 2_000

const FEEDBACK_PROMPT_KEYS = {
  detractor: 'nps.feedbackNegative',
  passive: 'nps.feedbackNeutral',
  satisfied: 'nps.feedbackNeutral',
  promoter: 'nps.feedbackPositive',
} as const

export function NPSSurvey() {
  const { t } = useTranslation()
  const { isVisible, submitResponse, dismiss } = useNPSSurvey()
  const { showToast } = useToast()
  const [selectedScore, setSelectedScore] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showThankYou, setShowThankYou] = useState(false)
  const thankYouTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup thank-you timer on unmount
  useEffect(() => () => {
    if (thankYouTimerRef.current) clearTimeout(thankYouTimerRef.current)
  }, [])

  const selectedOption = NPS_OPTIONS.find(o => o.score === selectedScore) ?? null

  const handleSubmit = useCallback(async () => {
    if (selectedScore === null) return
    setIsSubmitting(true)
    try {
      await submitResponse(selectedScore, feedback.trim() || undefined)
      setShowThankYou(true)
      showToast(t('nps.thankYou'), 'success')
      thankYouTimerRef.current = setTimeout(() => setShowThankYou(false), THANK_YOU_DISPLAY_MS)
    } catch {
      // Keep the widget open so the user can retry — don't claim success
      // when the POST never reached the backend.
      showToast(t('nps.submitError'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedScore, feedback, submitResponse, showToast, t])

  const handleDismiss = useCallback(() => {
    dismiss()
    setSelectedScore(null)
    setFeedback('')
  }, [dismiss])

  if (!isVisible && !showThankYou) return null

  const content = showThankYou ? (
    <div className="fixed bottom-4 right-4 z-sticky w-80 rounded-xl border border-border bg-card shadow-xl p-5 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
        <p className="text-sm font-medium text-foreground">{t('nps.thankYou')}</p>
        <p className="text-xs text-muted-foreground">{t('nps.thankYouDetail')}</p>
      </div>
    </div>
  ) : (
    <div className="fixed bottom-4 right-4 z-sticky w-80 rounded-xl border border-border bg-card shadow-xl animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <p className="text-sm font-medium text-foreground pr-2">{t('nps.title')}</p>
        <button
          onClick={handleDismiss}
          className="p-1 -mt-1 -mr-1 rounded-md hover:bg-secondary/50 transition-colors shrink-0"
          aria-label={t('nps.dismiss')}
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Emoji buttons */}
      <div className="flex justify-center gap-3 px-4 py-3">
        {NPS_OPTIONS.map(option => (
          <button
            key={option.score}
            onClick={() => setSelectedScore(option.score)}
            className={cn(
              'flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200',
              selectedScore === option.score
                ? 'bg-primary/10 ring-2 ring-primary/50 scale-110'
                : 'hover:bg-secondary/50 hover:scale-105',
            )}
            aria-label={t(option.labelKey)}
          >
            <span className="text-2xl" role="img" aria-hidden="true">{option.emoji}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{t(option.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* Feedback textarea (shown after selecting an emoji) */}
      {selectedOption && (
        <div className="px-4 pb-3 animate-in slide-in-from-top-2 duration-200">
          <label className="text-xs text-muted-foreground mb-1 block">
            {t(FEEDBACK_PROMPT_KEYS[selectedOption.category])}
          </label>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder={t('nps.feedbackPlaceholder')}
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary/30 resize-none focus:outline-hidden focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/40"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 pb-4">
        <button
          onClick={handleDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('nps.dismiss')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={selectedScore === null || isSubmitting}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
            selectedScore !== null
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-secondary text-muted-foreground cursor-not-allowed',
          )}
        >
          <Send className="w-3 h-3" />
          {t('nps.submit')}
        </button>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
