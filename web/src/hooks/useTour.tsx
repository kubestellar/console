import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useMobile } from './useMobile'
import { SETTINGS_CHANGED_EVENT, SETTINGS_RESTORED_EVENT } from '../lib/settingsSync'
import { emitTourStarted, emitTourCompleted, emitTourSkipped } from '../lib/analytics'

export interface TourStep {
  id: string
  target: string // CSS selector for the target element
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  highlight?: boolean
}

/**
 * Onboarding tour steps — kept short (4 steps) for high completion rates.
 *
 * The original 13-step tour had very low completion; most users skipped
 * after step 2-3. These 4 steps cover the essential "aha moments":
 *   1. Welcome — what this product is
 *   2. Sidebar — how to navigate
 *   3. Dashboard cards — the core interaction model
 *   4. AI features — the key differentiator (search + recommendations)
 */
const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="navbar"]',
    title: 'Welcome to KubeStellar Console',
    content: 'Your AI-powered multi-cluster Kubernetes dashboard. Claude AI helps you monitor, troubleshoot, and manage clusters — let\'s take a quick look around.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    title: 'Navigation',
    content: 'Switch between dashboards (Clusters, Deploy, Security, GitOps) in the top section. Each view is fully customizable — add or remove cards to fit your workflow. The bottom section has Settings, Marketplace, and snoozed AI suggestions.',
    placement: 'right',
    highlight: true,
  },
  {
    id: 'dashboard-cards',
    target: '[data-tour="card-header"]',
    title: 'Dashboard Cards',
    content: 'Cards show real-time cluster data. Drag to reorder, click the menu (⋮) to configure with natural language, or click "+" at the bottom to add more cards from the catalog.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'ai-features',
    target: '[data-tour="search"]',
    title: 'AI-Powered Features',
    content: 'Press ⌘K to search across all clusters with natural language. Above the cards, AI recommendations suggest useful cards and Actions offer one-click fixes for detected issues. Try the AI Missions panel for complex multi-step operations.',
    placement: 'bottom',
    highlight: true,
  },
]

const TOUR_STORAGE_KEY = 'kubestellar-console-tour-completed'

interface TourContextValue {
  isActive: boolean
  currentStep: TourStep | null
  currentStepIndex: number
  totalSteps: number
  hasCompletedTour: boolean
  startTour: () => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => void
  resetTour: () => void
  goToStep: (stepId: string) => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [hasCompletedTour, setHasCompletedTour] = useState(true) // Default to true until we check
  const { isMobile } = useMobile()

  // Check localStorage on mount and when settings are restored from file
  useEffect(() => {
    const readFromStorage = () => {
      const completed = localStorage.getItem(TOUR_STORAGE_KEY)
      setHasCompletedTour(completed === 'true')
    }
    readFromStorage()
    window.addEventListener(SETTINGS_RESTORED_EVENT, readFromStorage)
    return () => window.removeEventListener(SETTINGS_RESTORED_EVENT, readFromStorage)
  }, [])

  // Auto-skip tour on mobile - tour is desktop-only
  useEffect(() => {
    if (isMobile && isActive) {
      setIsActive(false)
    }
  }, [isMobile, isActive])

  const currentStep = isActive ? TOUR_STEPS[currentStepIndex] : null

  const startTour = useCallback(() => {
    // Don't start tour on mobile devices
    if (isMobile) return
    setCurrentStepIndex(0)
    setIsActive(true)
    emitTourStarted()
  }, [isMobile])

  const nextStep = useCallback(() => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1)
    } else {
      // Tour complete
      setIsActive(false)
      setHasCompletedTour(true)
      localStorage.setItem(TOUR_STORAGE_KEY, 'true')
      window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
      emitTourCompleted(TOUR_STEPS.length)
    }
  }, [currentStepIndex])

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }, [currentStepIndex])

  const skipTour = useCallback(() => {
    emitTourSkipped(currentStepIndex)
    setIsActive(false)
    setHasCompletedTour(true)
    localStorage.setItem(TOUR_STORAGE_KEY, 'true')
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
  }, [currentStepIndex])

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY)
    setHasCompletedTour(false)
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
  }, [])

  const goToStep = useCallback((stepId: string) => {
    const index = TOUR_STEPS.findIndex(s => s.id === stepId)
    if (index >= 0) {
      setCurrentStepIndex(index)
    }
  }, [])

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStep,
        currentStepIndex,
        totalSteps: TOUR_STEPS.length,
        hasCompletedTour,
        startTour,
        nextStep,
        prevStep,
        skipTour,
        resetTour,
        goToStep,
      }}
    >
      {children}
    </TourContext.Provider>
  )
}

export function useTour() {
  const context = useContext(TourContext)
  if (!context) {
    throw new Error('useTour must be used within a TourProvider')
  }
  return context
}
