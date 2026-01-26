import { useState, useRef, useEffect } from 'react'
import { User, Mail, MessageSquare, Shield, Settings, LogOut, ChevronDown, Coins, Lightbulb, Linkedin } from 'lucide-react'
import { useRewards, REWARD_ACTIONS } from '../../hooks/useRewards'

interface UserProfileDropdownProps {
  user: {
    github_login?: string
    email?: string
    avatar_url?: string
    role?: string
    slackId?: string
  } | null
  onLogout: () => void
  onPreferences?: () => void
  onFeedback?: () => void
}

export function UserProfileDropdown({ user, onLogout, onPreferences, onFeedback }: UserProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { totalCoins, awardCoins } = useRewards()

  const handleLinkedInShare = () => {
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://kubestellar.io')}`
    window.open(linkedInUrl, '_blank', 'width=600,height=600')
    awardCoins('linkedin_share')
    setIsOpen(false)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!user) return null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 pl-3 border-l border-border hover:bg-secondary/50 rounded-lg p-2 transition-colors"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.github_login}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
            <User className="w-4 h-4 text-purple-400" />
          </div>
        )}
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium text-foreground">{user.github_login}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header with avatar and name */}
          <div className="p-4 bg-secondary/30 border-b border-border">
            <div className="flex items-center gap-3">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.github_login}
                  className="w-12 h-12 rounded-full"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <User className="w-6 h-6 text-purple-400" />
                </div>
              )}
              <div>
                <p className="font-medium text-foreground">{user.github_login}</p>
                <p className="text-sm text-muted-foreground">{user.email || 'No email set'}</p>
              </div>
            </div>
          </div>

          {/* User details section */}
          <div className="p-3 space-y-2 border-b border-border">
            <div className="flex items-center gap-3 px-2 py-1.5 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Email:</span>
              <span className="text-foreground truncate">{user.email || 'Not set'}</span>
            </div>
            <div className="flex items-center gap-3 px-2 py-1.5 text-sm">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Slack:</span>
              <span className="text-foreground">{user.slackId || 'Not connected'}</span>
            </div>
            <div className="flex items-center gap-3 px-2 py-1.5 text-sm">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Role:</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                user.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-secondary text-foreground'
              }`}>
                {user.role || 'User'}
              </span>
            </div>
            <div className="flex items-center gap-3 px-2 py-1.5 text-sm">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-muted-foreground">Coins:</span>
              <span className="text-yellow-400 font-medium">{totalCoins.toLocaleString()}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="p-2">
            <button
              onClick={() => {
                setIsOpen(false)
                onFeedback?.()
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              <span>Feedback</span>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">+Coins</span>
            </button>
            <button
              onClick={handleLinkedInShare}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <Linkedin className="w-4 h-4 text-[#0A66C2]" />
              <span>Share on LinkedIn</span>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">+{REWARD_ACTIONS.linkedin_share.coins}</span>
            </button>
            <button
              onClick={() => {
                setIsOpen(false)
                onPreferences?.()
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              Settings
            </button>
            <button
              onClick={() => {
                setIsOpen(false)
                onLogout()
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
