import { useState, useEffect, useRef } from 'react'
import { Save, User, Loader2, AlertCircle, RefreshCw } from 'lucide-react'

interface ProfileSectionProps {
  initialEmail: string
  initialSlackId: string
  refreshUser: () => Promise<void>
}

export function ProfileSection({ initialEmail, initialSlackId, refreshUser }: ProfileSectionProps) {
  const [email, setEmail] = useState(initialEmail)
  const [slackId, setSlackId] = useState(initialSlackId)
  const [profileSaved, setProfileSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<number>()

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleSaveProfile = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email, slackId }),
      })
      if (!response.ok) {
        throw new Error('Failed to save profile')
      }
      // Refresh user data to update the dropdown
      setIsRefreshing(true)
      await refreshUser()
      setIsRefreshing(false)
      setProfileSaved(true)
      timeoutRef.current = setTimeout(() => setProfileSaved(false), 2000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save profile'
      setError(message)
      console.error('Failed to save profile:', error)
      setIsRefreshing(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div id="profile-settings" className="glass rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-indigo-500/20">
          <User className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">Profile</h2>
          <p className="text-sm text-muted-foreground">Update your contact information</p>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <label htmlFor="profile-email" className="block text-sm text-muted-foreground mb-1">Email</label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
          />
        </div>
        <div>
          <label htmlFor="profile-slack" className="block text-sm text-muted-foreground mb-1">Slack ID</label>
          <input
            id="profile-slack"
            type="text"
            value={slackId}
            onChange={(e) => setSlackId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm"
          />
        </div>
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              Retry Save
            </button>
          </div>
        )}
        <button
          onClick={handleSaveProfile}
          disabled={isSaving || isRefreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving || isRefreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isRefreshing ? 'Refreshing...' : isSaving ? 'Saving...' : profileSaved ? 'Saved!' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}
