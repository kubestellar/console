import type { CSSProperties, ReactNode } from 'react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { safeLazy } from '../../lib/safeLazy'
import { Navbar } from './navbar/index'
import { Sidebar } from './Sidebar'
import { PageErrorBoundary } from '../PageErrorBoundary'
import { UpdateProgressBanner } from '../updates/UpdateProgressBanner'
import { TourOverlay, TourPrompt } from '../onboarding/Tour'
import { cn } from '../../lib/cn'
import {
  NAVBAR_HEIGHT_PX,
  BANNER_HEIGHT_PX,
  NAVBAR_FILTER_PANEL_OFFSET_CSS_VAR,
  SIDEBAR_CONTROLS_OFFSET_PX,
} from '../../lib/constants/ui'
import type { UpdateProgress } from '../../types/updates'
import { CLOSE_ANIMATION_MS } from '../../lib/constants/network'
import { StarsBackground } from './StarsBackground'
import { StellarToastBridge } from '../stellar/StellarToastBridge'
import { StellarMissionBridge } from '../stellar/StellarMissionBridge'

const MissionSidebar = safeLazy(() => import('./mission-sidebar'), 'MissionSidebar')
const MissionSidebarToggle = safeLazy(() => import('./mission-sidebar'), 'MissionSidebarToggle')
const StellarSidebar = safeLazy(() => import('../stellar'), 'StellarSidebar')

export interface LayoutBanner {
  id: string
  className: string
  style?: CSSProperties
  content: ReactNode
}

interface NavigationShellProps {
  children?: ReactNode
  dismissUpdateProgress: () => void
  isMobile: boolean
  pathname: string
  shouldReserveNavbarFilterPanelOffset: boolean
  sidebarWidthPx: number
  totalBannerHeight: number
  updateProgress: UpdateProgress | null
  visibleBanners: LayoutBanner[]
}

function NavigationProgress({ pathname }: { pathname: string }) {
  const [isNavigating, setIsNavigating] = useState(false)
  const prevPath = useRef(pathname)

  useEffect(() => {
    if (pathname !== prevPath.current) {
      setIsNavigating(true)
      prevPath.current = pathname
      const timer = setTimeout(() => setIsNavigating(false), CLOSE_ANIMATION_MS)
      return () => clearTimeout(timer)
    }
  }, [pathname])

  if (!isNavigating) return null
  return <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-50" />
}

export function NavigationShell({
  children,
  dismissUpdateProgress,
  isMobile,
  pathname,
  shouldReserveNavbarFilterPanelOffset,
  sidebarWidthPx,
  totalBannerHeight,
  updateProgress,
  visibleBanners,
}: NavigationShellProps) {
  const { t } = useTranslation()

  return (
    <div className="h-screen bg-background overflow-hidden flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-purple-500 focus:text-white focus:rounded-lg"
      >
        {t('actions.skipToContent')}
      </a>

      <TourOverlay />
      <TourPrompt />
      <StarsBackground />
      <Navbar />

      <UpdateProgressBanner
        progress={updateProgress}
        onDismiss={dismissUpdateProgress}
      />

      {visibleBanners.map((banner, index) => (
        <div
          key={banner.id}
          style={{
            top: NAVBAR_HEIGHT_PX + (index * BANNER_HEIGHT_PX),
            minHeight: BANNER_HEIGHT_PX,
            left: sidebarWidthPx,
            ...banner.style,
          }}
          className={cn('fixed transition-[left,right] duration-300', banner.className)}
        >
          {banner.content}
        </div>
      ))}

      <div
        className="flex flex-1 overflow-hidden transition-[padding-top] duration-300"
        style={{ paddingTop: NAVBAR_HEIGHT_PX + totalBannerHeight }}
      >
        <PageErrorBoundary>
          <Sidebar />
        </PageErrorBoundary>
        <main
          id="main-content"
          style={{
            marginLeft: isMobile ? 0 : sidebarWidthPx + SIDEBAR_CONTROLS_OFFSET_PX,
            marginRight: isMobile ? 0 : 'var(--mission-sidebar-width, 0px)',
          }}
          className="relative flex-1 p-4 pb-8 pb-[calc(2rem+env(safe-area-inset-bottom))] md:p-6 md:pb-8 md:pb-[calc(2rem+env(safe-area-inset-bottom))] overflow-y-auto overflow-x-hidden scroll-enhanced min-w-0"
          data-transition-margin="true"
        >
          {shouldReserveNavbarFilterPanelOffset && (
            <div
              aria-hidden
              style={{ height: `var(${NAVBAR_FILTER_PANEL_OFFSET_CSS_VAR}, 0px)` }}
            />
          )}
          <NavigationProgress pathname={pathname} />
          <div key={pathname} className="contents">
            <Outlet />
          </div>
        </main>
        <Suspense fallback={null}>
          <StellarSidebar />
        </Suspense>
        <StellarToastBridge />
        <StellarMissionBridge />
      </div>

      <Suspense fallback={null}>
        <MissionSidebar />
        <MissionSidebarToggle />
      </Suspense>

      {children}
    </div>
  )
}
