/**
 * Events tab section for PodDrillDown — wraps PodOutputTab with kubectl events configuration.
 */
import { Zap } from 'lucide-react'
import { PodOutputTab, type PodOutputTabProps } from './pod-drilldown/PodOutputTab'

export type PodEventsSectionProps = Omit<
  PodOutputTabProps,
  'copyField' | 'kubectlComment' | 'refreshIcon' | 'refreshLabel'
> & {
  namespace: string
  podName: string
}

export function PodEventsSection({
  namespace,
  podName,
  ...outputTabProps
}: PodEventsSectionProps) {
  return (
    <PodOutputTab
      {...outputTabProps}
      copyField="events"
      kubectlComment={`# kubectl get events -n ${namespace} --field-selector involvedObject.name=${podName}`}
      refreshIcon={Zap}
      refreshLabel="Refresh"
    />
  )
}
