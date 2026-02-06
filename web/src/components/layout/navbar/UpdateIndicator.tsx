import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useVersionCheck } from '../../../hooks/useVersionCheck'
import { ROUTES } from '../../../config/routes'

export function UpdateIndicator() {
  const navigate = useNavigate()
  const { hasUpdate, latestRelease, skipVersion, checkForUpdates } = useVersionCheck()
  const [showUpdateDropdown, setShowUpdateDropdown] = useState(false)
  const updateRef = useRef<HTMLDivElement>(null)

  // Check for updates on mount (respects rate limiting)
  useEffect(() => {
    checkForUpdates()
  }, [checkForUpdates])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (updateRef.current && !updateRef.current.contains(event.target as Node)) {
        setShowUpdateDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!hasUpdate || !latestRelease) {
    return null
  }

  return (
    <div className="relative" ref={updateRef}>
      <button
        onClick={() => setShowUpdateDropdown(!showUpdateDropdown)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
        title={`Update available: ${latestRelease.tag}`}
      >
        <Download className="w-4 h-4" />
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
      </button>

      {showUpdateDropdown && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl z-50">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Download className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-foreground">Update Available</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {latestRelease.tag}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigate(ROUTES.SETTINGS)
                  setShowUpdateDropdown(false)
                }}
                className="flex-1 px-3 py-1.5 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
              >
                View Details
              </button>
              <button
                onClick={() => {
                  skipVersion(latestRelease.tag)
                  setShowUpdateDropdown(false)
                }}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
