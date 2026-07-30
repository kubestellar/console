/**
 * Logs tab section for PodDrillDown — wraps PodOutputTab with kubectl logs configuration.
 */
import { Terminal } from 'lucide-react'
import { PodOutputTab, type PodOutputTabProps } from './pod-drilldown/PodOutputTab'

export type PodLogsSectionProps = Omit<
  PodOutputTabProps,
  'copyField' | 'kubectlComment' | 'refreshIcon' | 'refreshLabel'
> & {
  podName: string
  namespace: string
}

export function PodLogsSection({
  podName,
  namespace,
  ...outputTabProps
}: PodLogsSectionProps) {
  return (
    <PodOutputTab
      {...outputTabProps}
      copyField="logs"
      kubectlComment={`# kubectl logs ${podName} -n ${namespace} --tail=500`}
      refreshIcon={Terminal}
      refreshLabel="Refresh"
    />
  )
}
