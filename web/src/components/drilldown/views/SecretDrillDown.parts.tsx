import { Lock, Tag, Loader2, Copy, Check, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { maskKubernetesYamlData } from '../../../lib/yamlMask'

interface OverviewTabProps {
  dataLoading: boolean
  dataError: string | null
  secretName: string
  secretType: string | null
  dataEntries: [string, string][]
  labels: Record<string, string> | null
}

export function OverviewTab({
  dataLoading,
  dataError,
  secretName,
  secretType,
  dataEntries,
  labels,
}: OverviewTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      {dataLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</span>
        </div>
      )}
      {dataError && !dataLoading && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">{dataError}</p>
        </div>
      )}
      {/* Basic Info */}
      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
        <div className="flex items-center gap-3">
          <Lock className="w-8 h-8 text-red-400" />
          <div>
            <div className="text-lg font-semibold text-foreground">{secretName}</div>
            <div className="text-sm text-muted-foreground">
              Type: {secretType} • {dataEntries.length} key{dataEntries.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Labels */}
      {labels && Object.keys(labels).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Tag className="w-4 h-4 text-blue-400" />
            Labels
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(labels).slice(0, 5).map(([key, value]) => (
              <span key={key} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono">
                {key}={value}
              </span>
            ))}
            {Object.keys(labels).length > 5 && (
              <span className="text-xs text-muted-foreground">+{Object.keys(labels).length - 5} more</span>
            )}
          </div>
        </div>
      )}

      {/* Data Keys */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4 text-red-400" />
          Secret Keys
        </h3>
        {dataEntries.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {dataEntries.map(([key]) => (
              <span key={key} className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 font-mono">
                {key}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No data in this Secret</p>
        )}
      </div>
    </div>
  )
}

interface DataTabProps {
  dataEntries: [string, string][]
  revealedKeys: Set<string>
  toggleReveal: (key: string) => void
  handleCopy: (field: string, value: string) => void
  copiedField: string | null
  showAllData: boolean
  setShowAllData: (show: boolean) => void
}

export function DataTab({
  dataEntries,
  revealedKeys,
  toggleReveal,
  handleCopy,
  copiedField,
  showAllData,
  setShowAllData,
}: DataTabProps) {
  const displayedData = showAllData ? dataEntries : dataEntries.slice(0, 5)

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
                    onClick={() => toggleReveal(key)}
                    className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground"
                  >
                    {revealedKeys.has(key) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleCopy(`data-${key}`, value)}
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
              onClick={() => setShowAllData(!showAllData)}
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

interface DescribeTabProps {
  describeLoading: boolean
  describeOutput: string | null
  handleCopy: (field: string, value: string) => void
  copiedField: string | null
}

export function DescribeTab({ describeLoading, describeOutput, handleCopy, copiedField }: DescribeTabProps) {
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
            onClick={() => handleCopy('describe', describeOutput)}
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

interface YamlTabProps {
  yamlLoading: boolean
  yamlOutput: string | null
  yamlRevealed: boolean
  setYamlRevealed: (value: boolean | ((prev: boolean) => boolean)) => void
  handleCopy: (field: string, value: string) => void
  copiedField: string | null
}

export function YamlTab({ yamlLoading, yamlOutput, yamlRevealed, setYamlRevealed, handleCopy, copiedField }: YamlTabProps) {
  const { t } = useTranslation()
  const maskSecretYaml = maskKubernetesYamlData

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
            const displayedYaml = yamlRevealed ? yamlOutput : maskSecretYaml(yamlOutput)
            return (
              <>
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button
                    onClick={() => setYamlRevealed(v => !v)}
                    className="p-1 rounded bg-secondary/50 text-muted-foreground hover:text-foreground"
                    aria-label={yamlRevealed ? 'Mask secret values' : 'Reveal secret values'}
                    title={yamlRevealed ? 'Mask secret values' : 'Reveal secret values'}
                  >
                    {yamlRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleCopy('yaml', displayedYaml)}
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
