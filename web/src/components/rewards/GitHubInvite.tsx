/**
 * GitHub Invite component for inviting users and earning coins
 */

import { useState } from 'react'
import { Send, Coins, CheckCircle2, ExternalLink } from 'lucide-react'
import { Github } from '@/lib/icons'
import { StatusBadge } from '../ui/StatusBadge'
import { BaseModal } from '../../lib/modals/BaseModal'
import { useRewards } from '../../hooks/useRewards'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'

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
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    // Validate parsed data is actually an array (#7601)
    return Array.isArray(parsed) ? parsed as Invite[] : []
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

export function GitHubInviteModal({ isOpen, onClose }: GitHubInviteProps) {
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [invitedUsername, setInvitedUsername] = useState('')
  const [error, setError] = useState('')
  const { awardCoins, hasEarnedAction } = useRewards()

  const alreadyInvited = hasEarnedAction('github_invite')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return

    setIsSubmitting(true)
    setError('')

    try {
      // Trim first, then validate (#7600)
      const trimmedUsername = username.trim()

      // Validate GitHub username format
      if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(trimmedUsername)) {
        throw new Error('Invalid GitHub username format')
      }

      // Save the invite
      saveInvite(trimmedUsername)

      // Award coins (one-time only)
      const awarded = awardCoins('github_invite', { invitedUser: trimmedUsername })

      setInvitedUsername(trimmedUsername)
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
    setInvitedUsername('')
    onClose()
  }

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} size="sm" enableBackspace={false}>
      <BaseModal.Header title="Invite via GitHub" description="Invite a friend to contribute" icon={Github} onClose={handleClose} />

      <BaseModal.Content>
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
              href={`https://github.com/${encodeURIComponent(invitedUsername)}`}
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
              <Coins className="w-5 h-5 text-yellow-500 shrink-0" />
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
                    className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
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
      </BaseModal.Content>
    </BaseModal>
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
