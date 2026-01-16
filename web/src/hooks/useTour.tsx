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
    content: 'This is your AI-powered multi-cluster Kubernetes dashboard. Claude AI helps you monitor, troubleshoot, and manage your clusters. Let me show you around!',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    title: 'Navigation Sidebar',
    content: 'Access different views: Clusters, Applications, Events, Security, and GitOps. The AI learns from your navigation patterns to personalize your experience.',
    placement: 'right',
    highlight: true,
  },
  {
    id: 'dashboard-cards',
    target: '[data-tour="card"]',
    title: 'Dashboard Cards',
    content: 'Each card shows real-time data from your clusters. Hover over a card to see the action menu, or drag the grip handle to reorder cards.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'card-ai-chat',
    target: '[data-tour="card-chat"]',
    title: 'AI Card Chat',
    content: 'Click the chat icon on any card to ask Claude questions about that data. For example: "Why are these pods failing?" or "Show me the last hour of CPU usage".',
    placement: 'left',
    highlight: true,
  },
  {
    id: 'card-configure',
    target: '[data-tour="card-menu"]',
    title: 'Configure with AI',
    content: 'Click the menu (⋮) and select "Configure" to customize a card using natural language. Try: "Show only critical alerts" or "Filter to production namespace".',
    placement: 'left',
    highlight: true,
  },
  {
    id: 'ai-recommendations',
    target: '[data-tour="recommendations"]',
    title: 'AI-Powered Recommendations',
    content: 'Claude analyzes your cluster activity and suggests relevant cards. It notices patterns like "You often check pod issues after deployments" and offers helpful cards.',
    placement: 'left',
    highlight: true,
  },
  {
    id: 'snoozed',
    target: '[data-tour="snoozed"]',
    title: 'Snoozed Suggestions',
    content: 'Not ready for a suggestion? Snooze it! Snoozed items appear here with elapsed time. Click to apply when you\'re ready.',
    placement: 'left',
    highlight: true,
  },
  {
    id: 'drilldown',
    target: '[data-tour="drilldown"]',
    title: 'AI Drill-Down',
    content: 'Click any resource (pod, deployment, node) to open a detailed view. Use the AI Analysis tab to get Claude\'s insights, or the Shell tab to run kubectl commands.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'search',
    target: '[data-tour="search"]',
    title: 'AI-Powered Search',
    content: 'Press ⌘K to search across all clusters. Ask natural language questions like "Which pods are using the most memory?" or "Show deployments in staging".',
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
