import { Loader2, Copy, Check, Eye, EyeOff, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { maskKubernetesYamlData } from '../../../lib/yamlMask'

}

// ─── Describe Tab ─────────────────────────────────────────────────────────────

interface SecretDescribeTabProps {
  describeLoading: boolean
  describeOutput: string | null
  copiedField: string | null
  onCopy: (field: string, value: string) => void
}

/** Describe tab: raw kubectl describe output with copy button. */
export function SecretDescribeTab({
  describeLoading,
  describeOutput,
  copiedField,
  onCopy,
}: SecretDescribeTabProps) {
  const { t } = useTranslation()
  return (
    <div>
      {describeLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">{t('drilldown.status.runningDescribe')}</span>
        </div>
      ) : describeOutput ? (
        <div className="relative">
          <button
            onClick={() => onCopy('describe', describeOutput)}
            className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {copiedField === 'describe' ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
          <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
            {describeOutput}
          </pre>
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
        </div>
      )}
    </div>
  )
}

// ─── YAML Tab ─────────────────────────────────────────────────────────────────

interface SecretYamlTabProps {
  yamlLoading: boolean
  yamlOutput: string | null
  yamlRevealed: boolean
  copiedField: string | null
  onToggleReveal: () => void
  onCopy: (field: string, value: string) => void
}

/** YAML tab: masked-by-default YAML output with reveal toggle and copy. */
export function SecretYamlTab({
  yamlLoading,
  yamlOutput,
  yamlRevealed,
  copiedField,
  onToggleReveal,
  onCopy,
}: SecretYamlTabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      {/* #6209: same warning the Data tab uses, so the YAML tab is no
          longer the easy bypass for the per-key reveal model. */}
      <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400 flex items-center gap-2">
        <Lock className="w-4 h-4" />
        {yamlRevealed
          ? 'Secret values are visible. Click the eye icon to mask.'
          : 'Secret values are hidden by default. Click the eye icon to reveal.'}
      </div>
      {yamlLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">{t('drilldown.status.fetchingYaml')}</span>
        </div>
      ) : yamlOutput ? (
        <div className="relative">
          {(() => {
            // Compute once per render so the Copy button puts the
            // SAME bytes onto the clipboard that the user is looking
            // at — masked when masked, raw when revealed (#6209).
            const displayedYaml = yamlRevealed ? yamlOutput : maskKubernetesYamlData(yamlOutput)
            return (
              <>
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button
                    onClick={onToggleReveal}
                    className="p-1 rounded bg-secondary/50 text-muted-foreground hover:text-foreground"
                    aria-label={yamlRevealed ? 'Mask secret values' : 'Reveal secret values'}
                    title={yamlRevealed ? 'Mask secret values' : 'Reveal secret values'}
                  >
                    {yamlRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => onCopy('yaml', displayedYaml)}
                    className="px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {copiedField === 'yaml' ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                </div>
                <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                  {displayedYaml}
                </pre>
              </>
            )
          })()}
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
        </div>
      )}
    </div>
  )
}
