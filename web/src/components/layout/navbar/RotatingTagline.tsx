import { useState, useEffect, useCallback, useMemo } from 'react'

const ROTATION_INTERVAL_MS = 30_000
const TRANSITION_DURATION_MS = 600

const TAGLINES: readonly string[] = [
  'multi-cluster first, saving time and tokens',
  'not a dashboard — THIS is AI Ops',
  'make this thing do anything',
  'deploy and manage the magical stuff, in your cluster, with what you already have',
  'your clusters, your rules, your AI',
  'one console to rule them all',
  'Kubernetes operations, supercharged',
  'AI-driven multi-cluster management',
] as const

type TransitionStyle = 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'blur-sm' | 'scaleDown'

const TRANSITIONS: readonly TransitionStyle[] = [
  'fade', 'slideUp', 'slideDown', 'slideLeft', 'blur-sm', 'scaleDown',
] as const

function randomIndex(length: number): number {
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

export function RotatingTagline({ aiTagline }: { aiTagline?: string }) {
  const allTaglines = useMemo(
    () => (aiTagline ? [...TAGLINES, aiTagline] : TAGLINES),
    [aiTagline],
  )

  const [index, setIndex] = useState(() => randomIndex(allTaglines.length))
  const [visible, setVisible] = useState(true)
  const [transition, setTransition] = useState<TransitionStyle>('fade')

  const advance = useCallback(() => {
    setTransition(pickTransition())
    setVisible(false)
    const tid = setTimeout(() => {
      setIndex(prev => (prev + 1) % allTaglines.length)
      setVisible(true)
    }, TRANSITION_DURATION_MS)
    return () => clearTimeout(tid)
  }, [allTaglines.length])

  useEffect(() => {
    const id = setInterval(advance, ROTATION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [advance])

  const safeIndex = index < allTaglines.length ? index : 0

  return (
    <span
      className="text-[10px] text-muted-foreground tracking-wide inline-block"
      style={getTransitionCSS(transition, visible)}
    >
      {allTaglines[safeIndex]}
    </span>
  )
}
