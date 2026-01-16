import { useState, useEffect, useCallback } from 'react'

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
    title: 'Welcome to KubeStellar Console',
    content: 'This is your AI-powered multi-cluster Kubernetes dashboard. Let me show you around!',
    placement: 'bottom',
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    title: 'Navigation Sidebar',
    content: 'Access different views like Clusters, Applications, Security, and GitOps from here.',
    placement: 'right',
  },
  {
    id: 'dashboard',
    target: '[data-tour="dashboard"]',
    title: 'Your Dashboard',
    content: 'Cards show real-time data from your clusters. You can drag to reorder, configure, or replace them.',
    placement: 'top',
    highlight: true,
  },
  {
    id: 'recommendations',
    target: '[data-tour="recommendations"]',
    title: 'AI Recommendations',
    content: 'The AI analyzes your cluster activity and suggests relevant cards. Click to add, or snooze for later.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'card-menu',
    target: '[data-tour="card-menu"]',
    title: 'Card Actions',
    content: 'Each card has a menu to configure it, replace it, or remove it. Drag the handle to reorder.',
    placement: 'left',
  },
  {
    id: 'ai-mode',
    target: '[data-tour="ai-mode"]',
    title: 'AI Mode Control',
    content: 'Control how proactive the AI is. High mode suggests more, Low mode only shows critical items.',
    placement: 'bottom',
  },
  {
    id: 'drilldown',
    target: '[data-tour="drilldown"]',
    title: 'Drill Down Navigation',
    content: 'Click on any item in a card to drill down for more details. Navigate through clusters, namespaces, and resources.',
    placement: 'top',
  },
  {
    id: 'snoozed',
    target: '[data-tour="snoozed"]',
    title: 'Snoozed Items',
    content: 'Snoozed recommendations appear here with elapsed time. Apply them when ready.',
    placement: 'right',
  },
]

const TOUR_STORAGE_KEY = 'kubestellar-console-tour-completed'

export function useTour() {
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

  return {
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
  }
}
