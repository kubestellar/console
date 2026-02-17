import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, Check, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ROUTES } from '../../config/routes'
import { STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE, STORAGE_KEY_ONBOARDING_RESPONSES, STORAGE_KEY_ONBOARDED } from '../../lib/constants'
import { useTranslation } from 'react-i18next'

interface Question {
  key: string
  question: string
  description?: string
  options: string[]
  rankedChoice?: boolean
}

const questions: Question[] = [
  {
    key: 'role',
    question: "What's your primary role?",
    description: 'This helps us customize your dashboard',
    options: ['SRE', 'DevOps', 'Platform Engineer', 'Developer', 'DBA', 'Network Engineer'],
  },
  {
    key: 'focus_layer',
    question: 'Which layer do you focus on most?',
    description: "We'll prioritize relevant information",
    options: ['Infrastructure (nodes, storage)', 'Platform (K8s, operators)', 'Application', 'Database', 'Network'],
  },
  {
    key: 'cluster_count',
    question: 'How many clusters do you typically manage?',
    options: ['1-3', '4-10', '10-50', '50+'],
  },
  {
    key: 'daily_challenges',
    question: 'Rank your daily challenges by priority',
    description: 'Drag to reorder - most important at top',
    options: ['Troubleshooting issues', 'Deployments', 'Capacity planning', 'Security/compliance', 'Upgrades'],
    rankedChoice: true,
  },
  {
    key: 'gitops',
    question: 'Do you use GitOps?',
    options: ['Yes, heavily', 'Sometimes', 'No'],
  },
  {
    key: 'monitoring_priorities',
    question: 'Rank what monitoring matters most',
    description: 'Drag to reorder - most important at top',
    options: ['Availability', 'Performance', 'Cost', 'Security'],
    rankedChoice: true,
  },
  {
    key: 'gpu_workloads',
    question: 'Do you manage GPU workloads?',
    options: ['Yes', 'No'],
  },
]

export function Onboarding() {
  const { t: _t } = useTranslation()
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentQuestion = questions[currentStep]
  const progress = ((currentStep + 1) / questions.length) * 100

  // Initialize ranked choice answers with default order
  const getRankedOrder = (): string[] => {
    if (answers[currentQuestion.key] && Array.isArray(answers[currentQuestion.key])) {
      return answers[currentQuestion.key] as string[]
    }
    return [...currentQuestion.options]
  }

  const handleSelect = (answer: string) => {
    setAnswers((prev) => ({ ...prev, [currentQuestion.key]: answer }))
  }

  const handleRankMove = (index: number, direction: 'up' | 'down') => {
    const currentOrder = getRankedOrder()
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= currentOrder.length) return

    const newOrder = [...currentOrder]
    const [item] = newOrder.splice(index, 1)
    newOrder.splice(newIndex, 0, item)
    setAnswers((prev) => ({ ...prev, [currentQuestion.key]: newOrder }))
  }

  const handleNext = () => {
    // For ranked choice, save the current order if not already set
    if (currentQuestion.rankedChoice && !answers[currentQuestion.key]) {
      setAnswers((prev) => ({ ...prev, [currentQuestion.key]: [...currentQuestion.options] }))
    }
    if (currentStep < questions.length - 1) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const handleComplete = async () => {
    setIsSubmitting(true)
    try {
      // Save responses - convert arrays to comma-separated strings
      const responses = Object.entries(answers).map(([question_key, answer]) => ({
        question_key,
        answer: Array.isArray(answer) ? answer.join(',') : answer,
      }))

      // Check if demo mode (no backend available)
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      const isDemoMode = token === DEMO_TOKEN_VALUE

      if (isDemoMode) {
        // Demo mode: save onboarding responses to localStorage
        localStorage.setItem(STORAGE_KEY_ONBOARDING_RESPONSES, JSON.stringify(responses))
        localStorage.setItem(STORAGE_KEY_ONBOARDED, 'true')
      } else {
        // Real user: save to backend
        await api.post('/api/onboarding/responses', responses)
        await api.post('/api/onboarding/complete', {})
      }

      // Refresh user to get updated onboarded status
      await refreshUser()

      navigate(ROUTES.HOME)
    } catch (error) {
      console.error('Failed to complete onboarding:', error)
      // For demo mode, still allow navigation even if there's an error
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      if (token === DEMO_TOKEN_VALUE) {
        localStorage.setItem(STORAGE_KEY_ONBOARDED, 'true')
        await refreshUser()
        navigate(ROUTES.HOME)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLastStep = currentStep === questions.length - 1
  const canProceed = currentQuestion.rankedChoice || answers[currentQuestion.key]

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      {/* Star field */}
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

      {/* Gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {questions.length}
            </span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-ks transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question card */}
        <div className="glass rounded-2xl p-8 animate-fade-in-up">
          <h2 className="text-2xl font-bold text-foreground mb-2">{currentQuestion.question}</h2>
          {currentQuestion.description && (
            <p className="text-muted-foreground mb-6">{currentQuestion.description}</p>
          )}

          {/* Options - Single select or Ranked Choice */}
          {currentQuestion.rankedChoice ? (
            <div className="space-y-2">
              {getRankedOrder().map((option, index) => (
                <div
                  key={option}
                  className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border-2 border-transparent hover:border-purple-500/30 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <GripVertical className="w-4 h-4" />
                    <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-sm font-medium text-purple-400">
                      {index + 1}
                    </span>
                  </div>
                  <span className="flex-1 text-foreground">{option}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleRankMove(index, 'up')}
                      disabled={index === 0}
                      className="p-1.5 rounded hover:bg-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowUp className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleRankMove(index, 'down')}
                      disabled={index === getRankedOrder().length - 1}
                      className="p-1.5 rounded hover:bg-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowDown className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              {currentQuestion.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`w-full p-4 rounded-xl text-left transition-all duration-200 ${
                    answers[currentQuestion.key] === option
                      ? 'bg-purple-500/20 border-2 border-purple-500 text-foreground'
                      : 'bg-secondary/50 border-2 border-transparent hover:bg-secondary hover:border-purple-500/30 text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{option}</span>
                    {answers[currentQuestion.key] === option && (
                      <Check className="w-5 h-5 text-purple-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            {isLastStep ? (
              <button
                onClick={handleComplete}
                disabled={!canProceed || isSubmitting}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="spinner w-4 h-4" />
                    Creating dashboard...
                  </>
                ) : (
                  <>
                    Complete Setup
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canProceed}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
