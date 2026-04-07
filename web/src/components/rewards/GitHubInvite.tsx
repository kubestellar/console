/**
 * GitHub Invite component for inviting users and earning coins
 */

import { useState, useRef } from 'react'
import { Send, Coins, CheckCircle2, X, ExternalLink } from 'lucide-react'
import { Github } from '@/lib/icons'
import { StatusBadge } from '../ui/StatusBadge'
import { useRewards } from '../../hooks/useRewards'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { useModalNavigation, useModalFocusTrap } from '../../lib/modals/useModalNavigation'

interface GitHubInviteProps {
  isOpen: boolean
  onClose: () => void
}

const INVITES_STORAGE_KEY = 'kubestellar-github-invites'

interface Invite {
  username: string
  timestamp: string
  status: 'pending' | 'accepted'
}

function loadInvites(): Invite[] {
  try {
    const stored = safeGetItem(INVITES_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveInvite(username: string): void {
  const invites = loadInvites()
  invites.push({
    username,
    timestamp: new Date().toISOString(),
    status: 'pending' })
  safeSetItem(INVITES_STORAGE_KEY, JSON.stringify(invites))
}

const GITHUB_INVITE_MODAL_TITLE_ID = 'github-invite-modal-title'

export function GitHubInviteModal({ isOpen, onClose }: GitHubInviteProps) {
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const { awardCoins, hasEarnedAction } = useRewards()
  const modalRef = useRef<HTMLDivElement>(null)

  const alreadyInvited = hasEarnedAction('github_invite')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return

    setIsSubmitting(true)
    setError('')

    try {
      // Validate GitHub username format
      if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(username)) {
        throw new Error('Invalid GitHub username format')
      }

      // Save the invite
      saveInvite(username.trim())

      // Award coins (one-time only)
      const awarded = awardCoins('github_invite', { invitedUser: username.trim() })

      if (awarded) {
        setSuccess(true)
      } else {
        // Invite saved but no coins (already earned)
        setSuccess(true)
      }

      setUsername('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setSuccess(false)
    setError('')
    setUsername('')
    onClose()
  }

  // Keyboard navigation (ESC to close) and scroll lock
  useModalNavigation({ isOpen, onClose: handleClose, enableBackspace: false })
  // Focus trap within modal
  useModalFocusTrap(modalRef as React.RefObject<HTMLElement | null>, isOpen)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xl">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={GITHUB_INVITE_MODAL_TITLE_ID}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Github className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 id={GITHUB_INVITE_MODAL_TITLE_ID} className="font-semibold text-foreground">Invite via GitHub</h2>
              <p className="text-xs text-muted-foreground">Invite a friend to contribute</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
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
              <h3 className="text-lg font-medium text-foreground mb-2">Invite Sent!</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your invitation has been recorded.
                {!alreadyInvited && (
                  <span className="block mt-2 text-yellow-400">
                    +500 coins awarded!
                  </span>
                )}
              </p>
              <a
                href={`https://github.com/${username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-sm transition-colors"
              >
                View Profile
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <>
              {/* Reward info */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
                <Coins className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-400">
                    {alreadyInvited ? 'Invite more friends!' : 'Earn +500 coins'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {alreadyInvited
                      ? 'You\'ve already earned the bonus, but keep inviting!'
                      : 'First invite earns you 500 coins'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <label className="block text-sm font-medium text-foreground mb-2">
                  GitHub Username
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting || !username.trim()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 disabled:cursor-not-allowed text-white font-medium transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    Invite
                  </button>
                </div>
                {error && (
                  <p className="mt-2 text-sm text-red-400">{error}</p>
                )}
              </form>

              <p className="mt-4 text-xs text-muted-foreground">
                Enter a GitHub username to invite them to contribute to KubeStellar.
                They&apos;ll receive an invitation to collaborate.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Button to trigger the modal
export function GitHubInviteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 text-purple-400 text-sm transition-colors"
    >
      <Github className="w-4 h-4" />
      Invite Friend
      <StatusBadge color="yellow">+500</StatusBadge>
    </button>
  )
}
