import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useModalState } from '../../../lib/modals'
import { useLocation } from 'react-router-dom'
import { BookOpen, Play, ExternalLink, GraduationCap, Video, Loader2, Newspaper } from 'lucide-react'
import { useTour } from '../../../hooks/useTour'
import { LogoWithStar } from '../../ui/LogoWithStar'
import {
  getYouTubeThumbnailUrl,
  getYouTubeWatchUrl,
} from '../../../config/learningVideos'
import { usePlaylistVideos } from '../../../hooks/usePlaylistVideos'
import { useMediumBlog } from '../../../hooks/useMediumBlog'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'
import { emitBlogPostClicked } from '../../../lib/analytics'

/** Width of the dropdown panel in pixels */
const DROPDOWN_WIDTH_PX = 384 // sm:w-96 = 24rem = 384px
/** Vertical gap between the trigger button and the dropdown panel */
const DROPDOWN_GAP_PX = 8
/** Horizontal padding to keep the dropdown away from viewport edges */
const VIEWPORT_PADDING_PX = 8

/**
 * Calculate fixed-position coordinates for the dropdown panel so it
 * appears directly below the trigger button, right-aligned on desktop
 * and centered on mobile.
 */
function getDropdownPosition(triggerRect: DOMRect, isMobile: boolean) {
  const top = triggerRect.bottom + DROPDOWN_GAP_PX

  if (isMobile) {
    return { top, left: VIEWPORT_PADDING_PX, right: VIEWPORT_PADDING_PX }
  }

  // Right-align the dropdown with the trigger button, but clamp so it
  // doesn't overflow the left edge of the viewport.
  const right = window.innerWidth - triggerRect.right
  const leftEdge = window.innerWidth - right - DROPDOWN_WIDTH_PX
  if (leftEdge < VIEWPORT_PADDING_PX) {
    return { top, left: VIEWPORT_PADDING_PX, right: undefined }
  }
  return { top, left: undefined, right }
}

/** Tailwind `sm` breakpoint — below this we use mobile layout */
const SM_BREAKPOINT_PX = 640

interface LearnDropdownProps {
  /** Force label text to be visible (used in overflow menu) */
  showLabel?: boolean
}

export function LearnDropdown({ showLabel = false }: LearnDropdownProps) {
  const { isOpen, close, toggle } = useModalState()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { startTour, hasCompletedTour } = useTour()
  const location = useLocation()
  const { t } = useTranslation()
  const { videos, playlistUrl, loading } = usePlaylistVideos()
  const { posts: blogPosts, channelUrl: blogChannelUrl, loading: blogLoading } = useMediumBlog()

  // Track dropdown position for the portal
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 })

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const isMobile = window.innerWidth < SM_BREAKPOINT_PX
    setPos(getDropdownPosition(rect, isMobile))
  }, [])

  const RESOURCES = [
    { label: t('layout.navbar.learn.documentation'), href: 'https://console-docs.kubestellar.io', description: t('layout.navbar.learn.docsDescription') },
    { label: t('layout.navbar.learn.gettingStarted'), href: 'https://kubestellar.io/docs/console/overview/introduction', description: t('layout.navbar.learn.gettingStartedDescription') },
    { label: t('layout.navbar.learn.blog'), href: 'https://kubestellar.io/blog', description: t('layout.navbar.learn.blogDescription') },
    { label: t('layout.navbar.learn.youtubeChannel'), href: playlistUrl, description: t('layout.navbar.learn.youtubeDescription') },
  ]

  // Close on route change
  useEffect(() => {
    close()
  }, [location.pathname, close])

  // Reposition on open, and on resize/scroll while open
  useEffect(() => {
    if (!isOpen) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true })
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, { capture: true })
    }
  }, [isOpen, updatePosition])

  // Close on click outside — check both the trigger button and the portal dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const insideTrigger = triggerRef.current?.contains(target)
      const insideDropdown = dropdownRef.current?.contains(target)
      if (!insideTrigger && !insideDropdown) {
        close()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [close])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, close])

  const handleStartTour = () => {
    close()
    startTour()
  }

  // Build the style object for fixed positioning
  const dropdownStyle: React.CSSProperties = {
    position: 'fixed',
    top: pos.top,
    ...(pos.left != null ? { left: pos.left } : {}),
    ...(pos.right != null ? { right: pos.right } : {}),
    zIndex: 500, // z-toast
  }

  return (
    <>
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={toggle}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 h-9 rounded-lg text-sm transition-colors',
          hasCompletedTour
            ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 animate-pulse'
        )}
        title={t('layout.navbar.learn.title')}
      >
        <BookOpen className="w-4 h-4" />
        <span className={cn(showLabel ? 'inline' : 'hidden xl:inline')}>{t('layout.navbar.learn.title')}</span>
      </button>

      {/* Dropdown — portaled to document.body to escape navbar overflow clipping (#10319) */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="w-[calc(100vw-1rem)] sm:w-96 bg-card border border-border rounded-lg shadow-xl overflow-hidden max-h-[calc(100vh-4rem)] overflow-y-auto"
          style={dropdownStyle}
        >
          {/* Tour */}
          <button
            onClick={handleStartTour}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
          >
            <LogoWithStar className="w-5 h-5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-foreground">{t('layout.navbar.learn.takeTheTour')}</div>
              <div className="text-xs text-muted-foreground">{t('layout.navbar.learn.tourDescription')}</div>
            </div>
            {!hasCompletedTour && (
              <span className="ml-auto text-[10px] font-medium bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">{t('layout.navbar.learn.new')}</span>
            )}
          </button>

          <div className="border-t border-border" />

          {/* Video Tutorials */}
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Video className="w-3 h-3" />
              {t('layout.navbar.learn.videoTutorials')}
            </div>
          </div>

          {loading ? (
            <div className="px-4 py-4 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            </div>
          ) : videos.length > 0 ? (
            <div className="px-2 pb-2 max-h-64 overflow-y-auto">
              {videos.map(video => (
                <a
                  key={video.id}
                  href={getYouTubeWatchUrl(video.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-2 py-2 rounded-md hover:bg-secondary/50 transition-colors group"
                >
                  <div className="relative w-24 h-14 rounded overflow-hidden bg-muted shrink-0">
                    <img
                      src={getYouTubeThumbnailUrl(video.id)}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                      <Play className="w-5 h-5 text-white/70 fill-white/70 group-hover:text-white group-hover:fill-white transition-colors" />
                    </div>
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <div className="text-sm text-foreground leading-snug">{video.title}</div>
                    {video.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{video.description}</div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="px-4 py-4 flex flex-col items-center text-center">
              <GraduationCap className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <div className="text-xs text-muted-foreground">{t('layout.navbar.learn.comingSoon')}</div>
              <a
                href={playlistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline mt-1"
              >
                {t('layout.navbar.learn.subscribeToPlaylist')}
              </a>
            </div>
          )}

          {/* Blog Posts */}
          {(blogLoading || blogPosts.length > 0) && (
            <>
              <div className="border-t border-border" />
              <div className="px-4 pt-3 pb-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Newspaper className="w-3 h-3" />
                    {t('layout.navbar.learn.latestBlogPosts')}
                  </div>
                  <a
                    href={blogChannelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary hover:underline"
                  >
                    {t('layout.navbar.learn.viewAll')}
                  </a>
                </div>
              </div>
              {blogLoading ? (
                <div className="px-4 py-3 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                </div>
              ) : (
                <div className="px-2 pb-2">
                  {blogPosts.map(post => (
                    <a
                      key={post.link}
                      href={post.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => emitBlogPostClicked(post.title)}
                      className="block px-2 py-2 rounded-md hover:bg-secondary/50 transition-colors group"
                      title={post.preview}
                    >
                      <div className="text-sm text-foreground group-hover:text-primary transition-colors leading-snug">
                        {post.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {post.preview}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="border-t border-border" />

          {/* Resources */}
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <BookOpen className="w-3 h-3" />
              {t('layout.navbar.learn.resources')}
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
        </div>,
        document.body
      )}
    </>
  )
}
