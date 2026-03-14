/**
 * Subtle progress ring — shows scan progress as a circular indicator.
 * Used across compliance cards to show cluster-checking progress.
 */

/** Full circle circumference for a unit circle (r=1), scaled at render time */
const TWO_PI = 2 * Math.PI

interface ProgressRingProps {
  /** Progress value from 0 to 1 */
  progress: number
  /** Ring diameter in pixels */
  size?: number
  /** Ring stroke width in pixels */
  strokeWidth?: number
  className?: string
}

export function ProgressRing({
  progress,
  size = 16,
  strokeWidth = 2,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = TWO_PI * radius
  const clamped = Math.max(0, Math.min(1, progress))
  const strokeDashoffset = circumference * (1 - clamped)

  return (
    <svg
      width={size}
      height={size}
      className={className}
      aria-label={`${Math.round(clamped * 100)}% complete`}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-secondary"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        className="text-blue-400/60 transition-all duration-300"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
