import { ReactNode } from 'react'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useNavigationHistory } from '../../hooks/useNavigationHistory'
import { cn } from '../../lib/cn'
import { TourOverlay, TourPrompt } from '../onboarding/Tour'
import { TourProvider } from '../../hooks/useTour'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { config } = useSidebarConfig()

  // Track navigation for behavior analysis
  useNavigationHistory()

  return (
    <TourProvider>
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Tour overlay and prompt */}
      <TourOverlay />
      <TourPrompt />

      {/* Star field background */}
      <div className="star-field">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="star"
            style={{
              width: Math.random() * 2 + 1 + 'px',
              height: Math.random() * 2 + 1 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animationDelay: Math.random() * 3 + 's',
            }}
          />
        ))}
      </div>

      <Navbar />
      <div className="flex">
        <Sidebar />
        <main className={cn(
          'flex-1 p-6 transition-all duration-300',
          config.collapsed ? 'ml-20' : 'ml-64'
        )}>
          {children}
        </main>
      </div>
    </div>
    </TourProvider>
  )
}
