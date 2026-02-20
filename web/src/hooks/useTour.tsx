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

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="navbar"]',
    title: 'Welcome to KubeStellar Console',
    content: 'This is your AI-powered multi-cluster Kubernetes dashboard. Claude AI helps you monitor, troubleshoot, and manage your clusters. Let me show you around!',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    title: 'Navigation Sidebar',
    content: 'The left sidebar lists all your dashboards and views — Dashboard, Clusters, Deploy, Security, GitOps, and more. Each entry opens a customizable dashboard. Scroll down in the sidebar to find snoozed AI suggestions and a shortcut to add cards.',
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
    title: 'AI-Powered Recommendations & Actions',
    content: 'Claude analyzes your cluster activity and surfaces two rows above the cards: "AI" recommendations suggest useful cards to add, and "Actions" are ready-to-run fixes for detected issues like security alerts or unhealthy deployments.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'snoozed',
    target: '[data-tour="snoozed"]',
    title: 'Snoozed Suggestions',
    content: 'Not ready for a suggestion? Snooze it! Snoozed items appear here with elapsed time. Click to apply when you\'re ready.',
    placement: 'right',
    highlight: true,
  },
  {
    id: 'drilldown',
    target: '[data-tour="drilldown"]',
    title: 'Drill-Down',
    content: 'Click any resource (pod, deployment, node) to open a detailed view. Use the AI Analysis tab to get Claude\'s insights, or the Shell tab to run kubectl commands.',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'search',
    target: '[data-tour="search"]',
    title: 'Search',
    content: 'Press ⌘K to search across all clusters. Ask natural language questions like "Which pods are using the most memory?" or "Show deployments in staging".',
    placement: 'bottom',
    highlight: true,
  },
  {
    id: 'ai-missions',
    target: '[data-tour="ai-missions"]',
    title: 'AI Missions',
    content: 'Launch complex AI-powered operations like cluster upgrades, troubleshooting, or analysis. Claude handles multi-step tasks autonomously while keeping you informed.',
    placement: 'left',
    highlight: true,
  },
  {
    id: 'add-card',
    target: '[data-tour="add-card"]',
    title: 'Add Dashboard Cards',
    content: 'Every view in the sidebar — Dashboard, Clusters, Security, and others — is a fully customizable dashboard. Click "+" to browse the card catalog and add monitoring views for clusters, workloads, security, GitOps, and more to the current view.',
    placement: 'top',
    highlight: true,
  },
  {
    id: 'templates',
    target: '[data-tour="templates"]',
    title: 'Dashboard Templates',
    content: 'Quickly populate the current dashboard with a pre-configured set of cards for common workflows like SRE monitoring, security auditing, or GPU management. Applying a template replaces the current layout — give it a try!',
    placement: 'top',
    highlight: true,
  },
  {
    id: 'feedback',
    target: '[data-tour="feedback"]',
    title: 'Bug Reports & Feature Requests',
    content: 'Found a bug or have an idea? Click here to report issues or request new features. We track your feedback and notify you when updates are available.',
    placement: 'left',
    highlight: true,
  },
  {
    id: 'alerts',
    target: '[data-tour="alerts"]',
    title: 'Alert Notifications',
    content: 'Monitor active alerts across all clusters. Click to see alert details, acknowledge them, or let Claude diagnose issues with AI-powered analysis.',
    placement: 'left',
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
