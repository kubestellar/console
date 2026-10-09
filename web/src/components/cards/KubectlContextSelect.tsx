// Cluster context selector for the kubectl card.
// Extracted from Kubectl.tsx (issue #24058) — markup unchanged.
import { useTranslation } from 'react-i18next'

interface KubectlContextSelectProps {
  clusters: { name: string }[]
  selectedContext: string
  onContextChange: (context: string) => void
}

export function KubectlContextSelect({ clusters, selectedContext, onContextChange }: KubectlContextSelectProps) {
  const { t } = useTranslation(['common', 'cards'])
  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      {clusters.length > 0 && (
        // eslint-disable-next-line no-restricted-syntax -- moved verbatim from Kubectl.tsx (pre-existing baselined violation)
        <select
          value={selectedContext}
          onChange={(e) => onContextChange(e.target.value)}
          className="text-xs bg-secondary border border-border/50 rounded px-2 py-1 text-foreground max-w-[150px] truncate"
          title={t('selectors.selectCluster')}
        >
          <option value="">{t('selectors.selectCluster')}</option>
          {clusters.map(cluster => (
            <option key={cluster.name} value={cluster.name}>
              {cluster.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
