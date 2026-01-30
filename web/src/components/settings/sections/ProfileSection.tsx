import { useState } from 'react'
import { Save, User } from 'lucide-react'

interface ProfileSectionProps {
  initialEmail: string
  initialSlackId: string
  refreshUser: () => Promise<void>
}

export function ProfileSection({ initialEmail, initialSlackId, refreshUser }: ProfileSectionProps) {
  const [email, setEmail] = useState(initialEmail)
  const [slackId, setSlackId] = useState(initialSlackId)
  const [profileSaved, setProfileSaved] = useState(false)

  const handleSaveProfile = async () => {
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
      await refreshUser()
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save profile:', error)
    }
  }

  return (
    <div className="glass rounded-xl p-6">
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
        <button
          onClick={handleSaveProfile}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
        >
          <Save className="w-4 h-4" />
          {profileSaved ? 'Saved!' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}
