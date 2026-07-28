interface BatchProgressBarProps {
  progressPercent: number
  progressLabel: string
  isCompletedWithoutFailures: boolean
  hasFailures: boolean
}

export function BatchProgressBar({
  progressPercent,
  progressLabel,
  isCompletedWithoutFailures,
  hasFailures,
}: BatchProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={progressPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={progressLabel}
      className="mb-3"
      style={{
        width: '100%', height: 8,
        background: 'var(--s-surface-2)',
        borderRadius: 4, overflow: 'hidden',
      }}
    >
      <div style={{
        width: `${progressPercent}%`, height: '100%',
        background: isCompletedWithoutFailures
          ? 'var(--s-success)'
          : hasFailures ? 'var(--s-warning)' : 'var(--s-info)',
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}
