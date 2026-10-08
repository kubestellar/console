import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { compileCardCode, createCardComponent } from '../../lib/dynamic-cards/compiler'
import { useReportCardDataState } from './CardDataContext'
import type { DynamicCardDefinition } from '../../lib/dynamic-cards/types'
import type { CardComponent } from './cardRegistry'
import { useTranslation } from 'react-i18next'

// ============================================================================
// Tier 2: Custom Code Runtime
// ============================================================================

export interface Tier2Props {
  definition: DynamicCardDefinition
  config?: Record<string, unknown>
}

export function Tier2CardRuntime({ definition, config }: Tier2Props) {
  const { t } = useTranslation('cards')
  // Guard against undefined config (#4910)
  const safeConfig = config ?? {}
  const [CardComponent, setCardComponent] = useState<CardComponent | null>(null)
  const [compiling, setCompiling] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | undefined>(undefined)

  // Report internal loading/error state to CardWrapper so header stays in sync (#5208)
  useReportCardDataState({
    isFailed: !!error,
    consecutiveFailures: error ? 1 : 0,
    errorMessage: error ?? undefined,
    isLoading: compiling,
    isRefreshing: false,
    hasData: !!CardComponent,
    isDemoData: false,
  })

  useEffect(() => {
    let cancelled = false

    async function compile() {
      setCompiling(true)
      setError(null)

      try {
        const source = definition.sourceCode
        if (!source) {
          setError('No source code provided.')
          setCompiling(false)
          return
        }

        // Check for cached compiled code
        let code = definition.compiledCode
        if (!code) {
          const result = await compileCardCode(source)
          if (cancelled) return
          if (result.error) {
            setError(result.error)
            setCompiling(false)
            return
          }
          code = result.code!
        }

        // Create component from compiled code
        const componentResult = await createCardComponent(code)
        if (cancelled) return

        if (componentResult.error) {
          setError(componentResult.error)
          setCompiling(false)
          return
        }

        cleanupRef.current = componentResult.cleanup
        setCardComponent(() => componentResult.component)
        setCompiling(false)
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        // Message is already surfaced to the user via setError below (#8816)
        setError(`Unexpected error: ${message}`)
        setCompiling(false)
      }
    }

    compile()
    return () => {
      cancelled = true
      // Clean up any timers the card created
      cleanupRef.current?.()
    }
  }, [definition.sourceCode, definition.compiledCode])

  if (compiling) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
        <span className="ml-2 text-sm text-muted-foreground">{t('dynamicCard.compiling')}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mb-2" />
        <p className="text-sm text-red-400 font-medium">{t('dynamicCard.compilationError')}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm font-mono wrap-break-word">
          {error}
        </p>
      </div>
    )
  }

  if (!CardComponent) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('dynamicCard.noComponent')}</p>
      </div>
    )
  }

  return <CardComponent config={safeConfig} />
}
