import type { CSSProperties } from 'react'

export const MOBILE_BROWSER_IFRAME_STYLE: CSSProperties = {
  transform: 'scale(1)',
  transformOrigin: 'top left' }

export interface Tab {
  id: string
  url: string
  title: string
  favicon?: string
}

export interface SavedBookmark {
  url: string
  title: string
  icon?: string
}

export const STORAGE_KEY = 'mobile_browser_state'
export const BOOKMARKS_KEY = 'mobile_browser_bookmarks'

// Device dimensions - iPhone for normal view, iPad horizontal for expanded/fullscreen
export const IPHONE_WIDTH = 375
export const IPHONE_HEIGHT = 667
export const IPAD_WIDTH = 1024
export const IPAD_HEIGHT = 768

// Popular mobile-friendly sites
export const QUICK_LINKS = [
  { title: 'KubeStellar', url: 'https://kubestellar.io', icon: '⭐' },
  { title: 'Google', url: 'https://www.google.com', icon: '🔍' },
  { title: 'GitHub', url: 'https://github.com', icon: '🐙' },
  { title: 'Wikipedia', url: 'https://en.m.wikipedia.org', icon: '📚' },
  { title: 'YouTube', url: 'https://m.youtube.com', icon: '▶️' },
  { title: 'News', url: 'https://news.ycombinator.com', icon: '📰' },
  { title: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '💻' },
]
