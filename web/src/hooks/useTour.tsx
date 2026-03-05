import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useMobile } from './useMobile'
import { SETTINGS_CHANGED_EVENT, SETTINGS_RESTORED_EVENT } from '../lib/settingsSync'
import { emitTourStarted, emitTourCompleted, emitTourSkipped } from '../lib/analytics'
import { STORAGE_KEY_TOUR_COMPLETED } from '../lib/constants/storage'

export interface TourStep {
  id: string
  target: string // CSS selector for the target element
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  highlight?: boolean
}

/**
 * Onboarding tour steps — kept short (5 steps) for high completion rates.
 *
 * The original 13-step tour had very low completion; most users skipped
 * after step 2-3. These 5 steps cover the essential "aha moments":
 *   1. Welcome — what this product is
 *   2. Sidebar — how to navigate 30+ dashboards
 *   3. Dashboard cards — the core interaction model
 *   4. Search — command palette (Cmd+K)
 *   5. AI Missions — guided multi-step operations
 *
 * All text must be accurate on both console.kubestellar.io (demo mode)
 * and localhost with a live backend.
 */
const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="navbar"]',
    title: 'Welcome to KubeStellar Console',
    content: 'Your multi-cluster Kubernetes dashboard. Monitor, troubleshoot, and manage clusters across any infrastructure \u2014 let\u2019s take a quick look around.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    title: 'Navigation',
    content: 'Browse 30+ dashboards organized by topic \u2014 Clusters, Deploy, AI/ML, Security, GitOps, Cost, and more. Drag items to reorder or hide ones you don\u2019t need. Settings and Marketplace are at the bottom.',
    placement: 'right',
    highlight: true,
  },
  {
    id: 'dashboard-cards',
    target: '[data-tour="card-header"]',
    title: 'Dashboard Cards',
    content: 'Cards show cluster data at a glance. Drag to reorder, click the \u22ee menu to configure or resize, and expand any card for detailed drill-downs. Use the floating + button (bottom-right) or the sidebar to add cards from the catalog.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'search',
    target: '[data-tour="search"]',
    title: 'Search & Commands',
    content: 'Press \u2318K (or Ctrl+K) to open the command palette. Search across dashboards, cards, clusters, and missions \u2014 or type a question to get AI-powered answers.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'ai-missions',
    target: '[data-tour="ai-missions-toggle"]',
    title: 'AI Missions',
    content: 'Open the Missions panel to launch guided multi-step operations \u2014 install platforms, troubleshoot issues, and more. Choose your preferred AI provider in the navbar. In demo mode, missions run with sample data.',
    placement: 'left',
    highlight: true,
  },
]

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
      const completed = localStorage.getItem(STORAGE_KEY_TOUR_COMPLETED)
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
      localStorage.setItem(STORAGE_KEY_TOUR_COMPLETED, 'true')
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
    localStorage.setItem(STORAGE_KEY_TOUR_COMPLETED, 'true')
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
  }, [currentStepIndex])

  const resetTour = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_TOUR_COMPLETED)
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
