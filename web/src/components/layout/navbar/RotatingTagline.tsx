import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

const ROTATION_INTERVAL_MS = 30_000
const TRANSITION_DURATION_MS = 600

type TransitionStyle = 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'blur-sm' | 'scaleDown'

const TRANSITIONS: readonly TransitionStyle[] = [
  'fade', 'slideUp', 'slideDown', 'slideLeft', 'blur-sm', 'scaleDown',
] as const

function randomIndex(length: number): number {
  if (length <= 0) {
    return 0
  }

  return Math.floor(Math.random() * length)
}

function pickTransition(): TransitionStyle {
  return TRANSITIONS[randomIndex(TRANSITIONS.length)]
}

function getTransitionCSS(transition: TransitionStyle, visible: boolean): React.CSSProperties {
  const duration = `${TRANSITION_DURATION_MS}ms`
  const easing = 'cubic-bezier(0.4, 0, 0.2, 1)'

  switch (transition) {
    case 'fade':
      return {
        opacity: visible ? 1 : 0,
        transition: `opacity ${duration} ${easing}`,
      }
    case 'slideUp':
      return {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        transition: `opacity ${duration} ${easing}, transform ${duration} ${easing}`,
      }
    case 'slideDown':
      return {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity ${duration} ${easing}, transform ${duration} ${easing}`,
      }
    case 'slideLeft':
      return {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(-12px)',
        transition: `opacity ${duration} ${easing}, transform ${duration} ${easing}`,
      }
    case 'blur-sm':
      return {
        opacity: visible ? 1 : 0,
        filter: visible ? 'blur(0)' : 'blur(4px)',
        transition: `opacity ${duration} ${easing}, filter ${duration} ${easing}`,
      }
    case 'scaleDown':
      return {
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.92)',
        transition: `opacity ${duration} ${easing}, transform ${duration} ${easing}`,
      }
  }
}

/** Max width for the tagline container — prevents long quotes from causing navbar layout shift */
const TAGLINE_MAX_WIDTH_REM = '16rem'

export function RotatingTagline({ aiTagline }: { aiTagline?: string }) {
  const { t } = useTranslation()
  const localizedTaglines = useMemo(() => {
    const translatedTaglines = t('navbar.taglines', { returnObjects: true })

    return Array.isArray(translatedTaglines)
      ? translatedTaglines.filter((tagline): tagline is string => typeof tagline === 'string')
      : []
  }, [t])
  const allTaglines = useMemo(
    () => (aiTagline ? [...localizedTaglines, aiTagline] : localizedTaglines),
    [aiTagline, localizedTaglines],
  )
  const taglineCount = allTaglines.length

  const [index, setIndex] = useState(() => randomIndex(taglineCount))
  const [visible, setVisible] = useState(true)
  const [transition, setTransition] = useState<TransitionStyle>('fade')

  const advance = useCallback(() => {
    if (taglineCount === 0) {
      return undefined
    }

    setTransition(pickTransition())
    setVisible(false)
    const tid = setTimeout(() => {
      setIndex(prev => (prev + 1) % taglineCount)
      setVisible(true)
    }, TRANSITION_DURATION_MS)
    return () => clearTimeout(tid)
  }, [taglineCount])

  useEffect(() => {
    if (taglineCount <= 1) {
      return undefined
    }

    const id = setInterval(advance, ROTATION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [advance, taglineCount])

  const safeIndex = taglineCount > 0 && index < taglineCount ? index : 0
  const currentTagline = allTaglines[safeIndex] ?? ''

  if (!currentTagline) {
    return null
  }

  return (
    <span
      className="text-[10px] text-muted-foreground tracking-wide inline-block overflow-hidden text-ellipsis whitespace-nowrap"
      style={{ ...getTransitionCSS(transition, visible), maxWidth: TAGLINE_MAX_WIDTH_REM }}
      title={currentTagline}
    >
      {currentTagline}
    </span>
  )
}
