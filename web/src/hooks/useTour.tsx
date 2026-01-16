import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export interface TourStep {
  id: string
  target: string // CSS selector for the target element
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  highlight?: boolean
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="navbar"]',
    title: 'Welcome to KubeStellar Klaude Console',
    content: 'This is your AI-powered multi-cluster Kubernetes dashboard. Let me show you around!',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    title: 'Navigation Sidebar',
    content: 'Access different views like Clusters, Applications, Events, Security, and GitOps. The sidebar adapts based on your usage patterns.',
    placement: 'right',
    highlight: true,
  },
  {
    id: 'dashboard',
    target: '[data-tour="dashboard"]',
    title: 'Your Dashboard',
    content: 'Cards show real-time data from your clusters. Drag to reorder them, or drag to another dashboard using the panel that appears on the right.',
    placement: 'top',
    highlight: true,
  },
  {
    id: 'recommendations',
    target: '[data-tour="recommendations"]',
    title: 'AI Recommendations',
    content: 'The AI analyzes your cluster activity and suggests relevant cards. Click to add them to your dashboard, or snooze for later.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'card-menu',
    target: '[data-tour="card-menu"]',
    title: 'Card Actions',
    content: 'Each card has a menu to configure it with natural language, replace it with a different card, or remove it. Drag the grip handle to reorder.',
    placement: 'left',
    highlight: true,
  },
  {
    id: 'snoozed',
    target: '[data-tour="snoozed"]',
    title: 'Snoozed Recommendations',
    content: 'Snoozed recommendations appear here with elapsed time. Click to apply them when you\'re ready.',
    placement: 'right',
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

  // Check localStorage on mount
  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY)
    setHasCompletedTour(completed === 'true')
  }, [])

  const currentStep = isActive ? TOUR_STEPS[currentStepIndex] : null

  const startTour = useCallback(() => {
    setCurrentStepIndex(0)
    setIsActive(true)
  }, [])

  const nextStep = useCallback(() => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1)
    } else {
      // Tour complete
      setIsActive(false)
      setHasCompletedTour(true)
      localStorage.setItem(TOUR_STORAGE_KEY, 'true')
    }
  }, [currentStepIndex])

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1)
    }
  }, [currentStepIndex])

  const skipTour = useCallback(() => {
    setIsActive(false)
    setHasCompletedTour(true)
    localStorage.setItem(TOUR_STORAGE_KEY, 'true')
  }, [])

  const resetTour = useCallback(() => {
    localStorage.removeItem(TOUR_STORAGE_KEY)
    setHasCompletedTour(false)
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
