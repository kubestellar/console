import { useEffect, useState } from 'react'
import { Loader2, Check, AlertTriangle, X } from 'lucide-react'
import type { UpdateProgress } from '../../types/updates'

interface UpdateProgressBannerProps {
  progress: UpdateProgress | null
  onDismiss: () => void
}

export function UpdateProgressBanner({ progress, onDismiss }: UpdateProgressBannerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (progress && progress.status !== 'idle') {
      setVisible(true)
    }

    // Auto-dismiss after success
    if (progress?.status === 'done') {
      const timer = setTimeout(() => setVisible(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [progress])

  if (!visible || !progress || progress.status === 'idle') return null

  const isActive = !['done', 'failed', 'idle'].includes(progress.status)
  const isDone = progress.status === 'done'
  const isFailed = progress.status === 'failed'

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
        isDone
          ? 'bg-green-500/10 text-green-400 border-b border-green-500/20'
          : isFailed
            ? 'bg-red-500/10 text-red-400 border-b border-red-500/20'
            : 'bg-blue-500/10 text-blue-400 border-b border-blue-500/20'
      }`}
    >
      {isActive && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {isDone && <Check className="w-4 h-4 shrink-0" />}
      {isFailed && <AlertTriangle className="w-4 h-4 shrink-0" />}

      <span className="flex-1 truncate">{progress.message}</span>

      {isActive && (
        <div className="w-24 bg-secondary rounded-full h-1.5 shrink-0">
          <div
            className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      )}

      <button
        onClick={() => {
          setVisible(false)
          onDismiss()
        }}
        className="p-1 hover:bg-secondary/50 rounded shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
