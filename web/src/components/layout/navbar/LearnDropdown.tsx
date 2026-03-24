import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { BookOpen, Play, ExternalLink, GraduationCap, Video } from 'lucide-react'
import { useTour } from '../../../hooks/useTour'
import { LogoWithStar } from '../../ui/LogoWithStar'
import {
  LEARNING_VIDEOS,
  YOUTUBE_PLAYLIST_URL,
  getYouTubeThumbnailUrl,
  getYouTubeWatchUrl,
} from '../../../config/learningVideos'
import { cn } from '../../../lib/cn'

const RESOURCES = [
  { label: 'Documentation', href: 'https://console-docs.kubestellar.io', description: 'Console docs and guides' },
  { label: 'Getting Started', href: 'https://kubestellar.io/docs/console/overview/introduction', description: 'Quick start guide' },
  { label: 'Blog', href: 'https://kubestellar.io/blog', description: 'News and updates' },
  { label: 'YouTube Channel', href: YOUTUBE_PLAYLIST_URL, description: 'Video tutorials playlist' },
]

export function LearnDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { startTour, hasCompletedTour } = useTour()
  const location = useLocation()

  // Close on route change
  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleStartTour = () => {
    setIsOpen(false)
    startTour()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
          hasCompletedTour
            ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 animate-pulse'
        )}
        title="Learn"
      >
        <BookOpen className="w-5 h-5" />
        <span className="hidden xl:inline">Learn</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Tour */}
          <button
            onClick={handleStartTour}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
          >
            <LogoWithStar className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-foreground">Take the Tour</div>
              <div className="text-xs text-muted-foreground">Interactive walkthrough of the console</div>
            </div>
            {!hasCompletedTour && (
              <span className="ml-auto text-[10px] font-medium bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">New</span>
            )}
          </button>

          <div className="border-t border-border" />

          {/* Video Tutorials */}
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Video className="w-3 h-3" />
              Video Tutorials
            </div>
          </div>

          {LEARNING_VIDEOS.length > 0 ? (
            <div className="px-2 pb-2 max-h-48 overflow-y-auto">
              {LEARNING_VIDEOS.map(video => (
                <a
                  key={video.id}
                  href={getYouTubeWatchUrl(video.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-secondary/50 transition-colors group"
                >
                  <div className="relative w-16 h-9 rounded overflow-hidden bg-muted shrink-0">
                    <img
                      src={getYouTubeThumbnailUrl(video.id)}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">{video.title}</div>
                    {video.description && (
                      <div className="text-xs text-muted-foreground truncate">{video.description}</div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="px-4 py-4 flex flex-col items-center text-center">
              <GraduationCap className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <div className="text-xs text-muted-foreground">Coming soon</div>
              <a
                href={YOUTUBE_PLAYLIST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline mt-1"
              >
                Subscribe to playlist
              </a>
            </div>
          )}

          <div className="border-t border-border" />

          {/* Resources */}
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <BookOpen className="w-3 h-3" />
              Resources
            </div>
          </div>
          <div className="px-2 pb-2">
            {RESOURCES.map(resource => (
              <a
                key={resource.label}
                href={resource.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-2 py-2 rounded-md hover:bg-secondary/50 transition-colors group"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground">{resource.label}</div>
                  <div className="text-xs text-muted-foreground">{resource.description}</div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 ml-2" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
