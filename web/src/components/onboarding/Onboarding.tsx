import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronLeft, Check, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ROUTES } from '../../config/routes'
import { STORAGE_KEY_TOKEN, DEMO_TOKEN_VALUE, STORAGE_KEY_ONBOARDING_RESPONSES, STORAGE_KEY_ONBOARDED } from '../../lib/constants'
import { safeGetItem, safeSetItem, safeSetJSON } from '../../lib/utils/localStorage'
import { Button } from '../ui/Button'

interface Question {
  key: string
  question: string
  description?: string
  options: string[]
  rankedChoice?: boolean
}

// English option strings below are the stable IDs stored in `answers` and
// posted to /api/onboarding/responses — they must NOT change. Display labels
// are looked up in cards.json via slugOption() so translations can override
// them without touching the stored value (#8017).
function slugOption(option: string): string {
  return option.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
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
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const { t } = useTranslation('cards')
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentQuestion = questions[currentStep]
  const progress = ((currentStep + 1) / questions.length) * 100

  // Translate a question option using slug-based keys with English fallback.
  const tOption = (questionKey: string, option: string) =>
    t(`onboarding.questions.${questionKey}.options.${slugOption(option)}`, { defaultValue: option })
  const tQuestion = (q: Question) =>
    t(`onboarding.questions.${q.key}.question`, { defaultValue: q.question })
  const tDescription = (q: Question) =>
    q.description
      ? t(`onboarding.questions.${q.key}.description`, { defaultValue: q.description })
      : undefined

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

  const [errorMessage, setErrorMessage] = useState('')

  const handleComplete = async () => {
    setIsSubmitting(true)
    setErrorMessage('')
    try {
      // Save responses - convert arrays to comma-separated strings
      const responses = Object.entries(answers).map(([question_key, answer]) => ({
        question_key,
        answer: Array.isArray(answer) ? answer.join(',') : answer,
      }))

      // Check if demo mode (no backend available)
      const token = safeGetItem(STORAGE_KEY_TOKEN)
      const isDemoMode = token === DEMO_TOKEN_VALUE

      if (isDemoMode) {
        // Demo mode: save onboarding responses to localStorage
        safeSetJSON(STORAGE_KEY_ONBOARDING_RESPONSES, responses)
        safeSetItem(STORAGE_KEY_ONBOARDED, 'true')
      } else {
        // Real user: save to backend
        await api.post('/api/onboarding/responses', responses)
        await api.post('/api/onboarding/complete', {})
      }

      // Refresh user to get updated onboarded status
      await refreshUser()

      navigate(ROUTES.HOME)
    } catch (err: unknown) {
      // For demo mode, still allow navigation even if there's an error
      const token = safeGetItem(STORAGE_KEY_TOKEN)
      if (token === DEMO_TOKEN_VALUE) {
        safeSetItem(STORAGE_KEY_ONBOARDED, 'true')
        await refreshUser()
        navigate(ROUTES.HOME)
      } else {
        // Real user: show error message so they are not stranded
        const message = err instanceof Error ? err.message : t('onboarding.errorFallback')
        setErrorMessage(message)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLastStep = currentStep === questions.length - 1
  const canProceed = currentQuestion.rankedChoice || answers[currentQuestion.key]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
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
              {t('onboarding.stepProgress', { current: currentStep + 1, total: questions.length })}
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
          <h2 className="text-2xl font-bold text-foreground mb-2">{tQuestion(currentQuestion)}</h2>
          {currentQuestion.description && (
            <div className="text-muted-foreground mb-6">{tDescription(currentQuestion)}</div>
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
                  <span className="flex-1 text-foreground">{tOption(currentQuestion.key, option)}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRankMove(index, 'up')}
                      disabled={index === 0}
                      icon={<ArrowUp className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
                      aria-label={t('onboarding.moveUp', { option: tOption(currentQuestion.key, option) })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRankMove(index, 'down')}
                      disabled={index === getRankedOrder().length - 1}
                      icon={<ArrowDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
                      aria-label={t('onboarding.moveDown', { option: tOption(currentQuestion.key, option) })}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              {currentQuestion.options.map((option) => {
                const label = tOption(currentQuestion.key, option)
                return (
                  <button
                    key={option}
                    onClick={() => handleSelect(option)}
                    className={`w-full p-4 rounded-xl text-left transition-all duration-200 ${
                      answers[currentQuestion.key] === option
                        ? 'bg-purple-500/20 border-2 border-purple-500 text-foreground'
                        : 'bg-secondary/50 border-2 border-transparent hover:bg-secondary hover:border-purple-500/30 text-muted-foreground'
                    }`}
                    aria-label={t('onboarding.selectOption', { option: label })}
                    aria-pressed={answers[currentQuestion.key] === option}
                  >
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      {answers[currentQuestion.key] === option && (
                        <Check className="w-5 h-5 text-purple-400" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {errorMessage}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="ghost"
              size="lg"
              onClick={handleBack}
              disabled={currentStep === 0}
              icon={<ChevronLeft className="w-4 h-4" />}
            >
              {t('onboarding.back')}
            </Button>

            {isLastStep ? (
              <Button
                variant="primary"
                size="lg"
                onClick={handleComplete}
                disabled={!canProceed || isSubmitting}
                loading={isSubmitting}
                iconRight={!isSubmitting ? <Check className="w-4 h-4" /> : undefined}
              >
                {isSubmitting ? t('onboarding.creating') : t('onboarding.complete')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={handleNext}
                disabled={!canProceed}
                iconRight={<ChevronRight className="w-4 h-4" />}
              >
                {t('onboarding.continue')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
