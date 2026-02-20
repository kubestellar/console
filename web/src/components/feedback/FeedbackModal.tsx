/**
 * Feedback Modal - allows users to submit bugs or feature requests
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { X, Bug, Lightbulb, Send, CheckCircle2, ExternalLink, Linkedin } from 'lucide-react'
import { useRewards, REWARD_ACTIONS } from '../../hooks/useRewards'
import { useToast } from '../ui/Toast'
import { emitFeedbackSubmitted } from '../../lib/analytics'

type FeedbackType = 'bug' | 'feature'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  initialType?: FeedbackType
}

const GITHUB_ISSUES_URL = 'https://github.com/kubestellar/kubestellar/issues/new'

export function FeedbackModal({ isOpen, onClose, initialType = 'feature' }: FeedbackModalProps) {
  const { showToast } = useToast()
  const [type, setType] = useState<FeedbackType>(initialType)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const { awardCoins } = useRewards()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return

    setIsSubmitting(true)

    try {
      // Build GitHub issue URL with pre-filled content
      const issueType = type === 'bug' ? 'Bug Report' : 'Feature Request'
      const body = `## ${issueType}\n\n${description}\n\n---\n*Submitted via KubeStellar Console*`

      const githubUrl = `${GITHUB_ISSUES_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=${type === 'bug' ? 'bug' : 'enhancement'}`

      // Open GitHub in new tab
      window.open(githubUrl, '_blank')
      emitFeedbackSubmitted(type)

      // Award coins based on type
      const action = type === 'bug' ? 'bug_report' : 'feature_suggestion'
      awardCoins(action as 'bug_report' | 'feature_suggestion', { title, type })

      setSuccess(true)
    } catch (err) {
      console.error('Failed to submit feedback:', err)
      showToast('Failed to submit feedback', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setSuccess(false)
    setTitle('')
    setDescription('')
    onClose()
  }

  // Keyboard navigation - ESC to close, Space to close when not typing
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC always closes
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
        return
      }

      // Space closes only if not typing in an input
      if (e.key === ' ') {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target instanceof HTMLElement && e.target.isContentEditable)
        ) {
          return
        }
        e.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  if (!isOpen) return null

  const coins = type === 'bug' ? REWARD_ACTIONS.bug_report.coins : REWARD_ACTIONS.feature_suggestion.coins

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              type === 'bug' ? 'bg-red-500/20' : 'bg-green-500/20'
            }`}>
              {type === 'bug' ? (
                <Bug className="w-5 h-5 text-red-400" />
              ) : (
                <Lightbulb className="w-5 h-5 text-green-400" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Submit Feedback</h2>
              <p className="text-xs text-muted-foreground">
                Earn <span className="text-yellow-400">{REWARD_ACTIONS.bug_report.coins}</span> coins for bugs, <span className="text-yellow-400">{REWARD_ACTIONS.feature_suggestion.coins}</span> for features
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Thank you!</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Your {type === 'bug' ? 'bug report' : 'feature suggestion'} has been submitted.
              </p>
              <p className="text-sm text-yellow-400 mb-4">
                +{coins} coins earned!
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Complete your submission on GitHub to create the issue.
              </p>

              {/* LinkedIn share suggestion */}
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-3">
                  Love KubeStellar? Share it with your network!
                </p>
                <LinkedInShareButton onShare={() => awardCoins('linkedin_share')} />
              </div>
            </div>
          ) : (
            <>
              {/* Type selector */}
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setType('bug')}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                    type === 'bug'
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Bug className="w-4 h-4" />
                  <span className="text-sm font-medium">Bug Report</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                    +{REWARD_ACTIONS.bug_report.coins}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('feature')}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${
                    type === 'feature'
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Lightbulb className="w-4 h-4" />
                  <span className="text-sm font-medium">Feature Request</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                    +{REWARD_ACTIONS.feature_suggestion.coins}
                  </span>
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={type === 'bug' ? 'Brief description of the bug' : 'Brief description of the feature'}
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={type === 'bug'
                        ? 'Steps to reproduce, expected behavior, actual behavior...'
                        : 'Describe the feature, use case, and how it would help...'
                      }
                      rows={4}
                      className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                    <ExternalLink className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="text-muted-foreground">
                      This will open GitHub to create an issue. You can add more details there.
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !title.trim() || !description.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 disabled:cursor-not-allowed text-white font-medium transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    Submit & Earn {coins} Coins
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
        {/* Keyboard hints */}
        <div className="flex items-center justify-end gap-3 px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground/50">
          <span><kbd className="px-1 py-0.5 rounded bg-secondary/50 text-[9px]">Esc</kbd> close</span>
          <span><kbd className="px-1 py-0.5 rounded bg-secondary/50 text-[9px]">Space</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Floating feedback button - positioned above the AI missions toggle
export function FeedbackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 flex items-center gap-2 px-4 py-2.5 rounded-full bg-purple-500 hover:bg-purple-600 text-white shadow-lg transition-all hover:scale-105 z-40"
      title="Submit feedback"
    >
      <Lightbulb className="w-4 h-4" />
      <span className="text-sm font-medium">Feedback</span>
    </button>
  )
}

// LinkedIn share button with coin reward
export function LinkedInShareButton({ onShare, compact = false }: { onShare?: () => void; compact?: boolean }) {
  const { t } = useTranslation()
  const handleShare = () => {
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://kubestellar.io')}`
    window.open(linkedInUrl, '_blank', 'width=600,height=600')
    onShare?.()
  }

  if (compact) {
    return (
      <button
        onClick={handleShare}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-[#0A66C2]/20 hover:bg-[#0A66C2]/30 text-[#0A66C2] transition-colors"
        title="Share on LinkedIn"
      >
        <Linkedin className="w-4 h-4" />
        <span>{t('feedback.share')}</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
          +{REWARD_ACTIONS.linkedin_share.coins}
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0A66C2] hover:bg-[#004182] text-white font-medium transition-colors"
    >
      <Linkedin className="w-4 h-4" />
      <span>{t('feedback.shareOnLinkedIn')}</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-white/20 text-white">
        +{REWARD_ACTIONS.linkedin_share.coins}
      </span>
    </button>
  )
}
