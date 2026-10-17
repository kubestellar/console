import { ChevronDown, ChevronUp, Copy, Check, Eye, EyeOff, Lock } from 'lucide-react'

// ─── Data Tab ─────────────────────────────────────────────────────────────────

interface SecretDataTabProps {
  dataEntries: [string, string][]
  displayedData: [string, string][]
  revealedKeys: Set<string>
  copiedField: string | null
  showAllData: boolean
  onToggleReveal: (key: string) => void
  onCopy: (field: string, value: string) => void
  onToggleShowAll: () => void
}

/** Data tab: key/value rows with per-key reveal and copy controls. */
export function SecretDataTab({
  dataEntries,
  displayedData,
  revealedKeys,
  copiedField,
  showAllData,
  onToggleReveal,
  onCopy,
  onToggleShowAll,
}: SecretDataTabProps) {
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400 flex items-center gap-2">
        <Lock className="w-4 h-4" />
        Secret values are hidden by default. Click the eye icon to reveal.
      </div>
      {dataEntries.length > 0 ? (
        <>
          {displayedData.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-card/50 border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-red-500/10 border-b border-border">
                <span className="font-mono text-sm text-red-400">{key}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onToggleReveal(key)}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                  >
                    {revealedKeys.has(key) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => onCopy(`data-${key}`, value)}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                  >
                    {copiedField === `data-${key}` ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <pre className="p-3 text-xs font-mono text-foreground whitespace-pre-wrap max-h-48 overflow-auto">
                {revealedKeys.has(key) ? value : '••••••••••••••••'}
              </pre>
            </div>
          ))}
          {dataEntries.length > 5 && (
            <button
              onClick={onToggleShowAll}
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
            >
              {showAllData ? (
                <>Show less <ChevronUp className="w-3 h-3" /></>
              ) : (
                <>Show all {dataEntries.length} keys <ChevronDown className="w-3 h-3" /></>
              )}
            </button>
          )}
        </>
      ) : (
        <div className="p-4 rounded-lg bg-card/50 border border-border text-center text-muted-foreground">
          No data in this Secret
        </div>
      )}
    </div>
  )
}
