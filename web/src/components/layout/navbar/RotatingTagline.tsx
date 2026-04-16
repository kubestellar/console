import { useState, useEffect, useCallback } from 'react'

/** Interval between tagline rotations (ms). Long enough that users absorb it
 *  subconsciously — the tagline is ambient branding, not a ticker. */
const ROTATION_INTERVAL_MS = 180_000
/** Duration of the fade transition (ms). */
const FADE_DURATION_MS = 600

/**
 * Static taglines that rotate in the sidebar header. A random one is
 * picked on every page load so returning visitors see variety instead
 * of the same line every time.
 */
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

/** Pick a random index in [0, length). Used once at mount time so
 *  each page load starts on a different tagline. */
function randomStart(length: number): number {
  return Math.floor(Math.random() * length)
}

/**
 * RotatingTagline cycles through a set of static taglines with a smooth
 * fade transition. Starts on a random tagline on every page load. When
 * a live AI agent is connected, an AI-generated tagline (contextual to
 * user behavior) can be injected into the rotation.
 */
export function RotatingTagline({ aiTagline }: { aiTagline?: string }) {
  // Build the full list: static taglines + optional AI-generated one
  const allTaglines = aiTagline
    ? [...TAGLINES, aiTagline]
    : TAGLINES

  const [index, setIndex] = useState(() => randomStart(allTaglines.length))
  const [visible, setVisible] = useState(true)

  const advance = useCallback(() => {
    // Fade out, swap text, fade in
    setVisible(false)
    const tid = setTimeout(() => {
      setIndex(prev => (prev + 1) % allTaglines.length)
      setVisible(true)
    }, FADE_DURATION_MS)
    return () => clearTimeout(tid)
  }, [allTaglines.length])

  useEffect(() => {
    const id = setInterval(advance, ROTATION_INTERVAL_MS)
    return () => clearInterval(id)
  }, [advance])

  // Clamp index if tagline list shrinks (AI tagline removed)
  const safeIndex = index < allTaglines.length ? index : 0

  return (
    <span
      className="text-[10px] text-muted-foreground tracking-wide transition-opacity"
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: `${FADE_DURATION_MS}ms`,
      }}
    >
      {allTaglines[safeIndex]}
    </span>
  )
}
