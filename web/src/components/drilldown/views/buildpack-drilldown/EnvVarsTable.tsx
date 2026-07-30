import { Check, Copy, Loader2 } from 'lucide-react'

interface EnvVarsTableProps {
  title: string
  value: string | null
  loading: boolean
  copiedField: string | null
  copyFieldKey: string
  onCopy: (field: string, value: string) => void
  className: string
}

export function EnvVarsTable({
  title,
  value,
  loading,
  copiedField,
  copyFieldKey,
  onCopy,
  className,
}: EnvVarsTableProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        {value && (
          <button
            onClick={() => onCopy(copyFieldKey, value)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copiedField === copyFieldKey ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            Copy
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <pre className={className}>{value}</pre>
      )}
    </div>
  )
}
