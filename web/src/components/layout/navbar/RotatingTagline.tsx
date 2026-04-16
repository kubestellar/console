import { useState, useEffect, useCallback } from 'react'

/** Interval between tagline rotations (ms). Long enough that users absorb it
 *  subconsciously — the tagline is ambient branding, not a ticker. */
const ROTATION_INTERVAL_MS = 180_000
/** Duration of the fade transition (ms). */
const FADE_DURATION_MS = 600

/**
 * Static taglines that rotate on every page load. The first entry is also
 * the branding default so it appears immediately while the component mounts.
 */
const TAGLINES: readonly string[] = [
  'multi-cluster first, saving time and tokens',
  'not a dashboard, THIS is AI Ops',
  'make this thing do anything!',
  'deploys and manages the magical stuff — in your cluster, with what you already have',
] as const

/**
 * RotatingTagline cycles through a set of static taglines with a smooth
 * fade transition. When a live AI agent is connected, an AI-generated
 * tagline (contextual to user behavior) can be injected into the rotation.
 */
export function RotatingTagline({ aiTagline }: { aiTagline?: string }) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  // Build the full list: static taglines + optional AI-generated one
  const allTaglines = aiTagline
    ? [...TAGLINES, aiTagline]
    : TAGLINES

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
