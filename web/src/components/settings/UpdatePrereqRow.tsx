import type { ReactNode } from 'react'
import { Check, X, Loader2 } from 'lucide-react'

interface UpdatePrereqRowProps {
  ok: boolean
  loading?: boolean
  label: string
  okText: string
  failText: string
  fixText?: string
  onFix?: () => void
  icon: ReactNode
}

export function UpdatePrereqRow({
  ok,
  loading,
  label,
  okText,
  failText,
  fixText,
  onFix,
  icon,
}: UpdatePrereqRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin-min" />
        ) : ok ? (
          <>
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-400">{okText}</span>
          </>
        ) : (
          <>
            <X className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs text-red-400">{failText}</span>
            {fixText && onFix && (
              <button
                onClick={onFix}
                className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 ml-1"
              >
                {fixText}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
