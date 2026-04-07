import { useRef, useEffect } from 'react'
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

export function LearnDropdown() {
  const { isOpen, close, toggle } = useModalState()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { startTour, hasCompletedTour } = useTour()
  const location = useLocation()
  const { t } = useTranslation()
  const { videos, playlistUrl, loading } = usePlaylistVideos()
  const { posts: blogPosts, channelUrl: blogChannelUrl, loading: blogLoading } = useMediumBlog()

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

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger */}
      <button
        onClick={toggle}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
          hasCompletedTour
            ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 animate-pulse'
        )}
        title={t('layout.navbar.learn.title')}
      >
        <BookOpen className="w-5 h-5" />
        <span className="hidden xl:inline">{t('layout.navbar.learn.title')}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
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
        </div>
      )}
    </div>
  )
}
