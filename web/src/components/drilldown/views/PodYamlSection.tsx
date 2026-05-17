/**
 * YAML tab section for PodDrillDown — wraps PodOutputTab with kubectl get -o yaml configuration.
 */
import { Code } from 'lucide-react'
import { PodOutputTab, type PodOutputTabProps } from './pod-drilldown/PodOutputTab'

export type PodYamlSectionProps = Omit<
  PodOutputTabProps,
  'copyField' | 'kubectlComment' | 'refreshIcon' | 'refreshLabel'
> & {
  podName: string
  namespace: string
}

export function PodYamlSection({
  podName,
  namespace,
  ...outputTabProps
}: PodYamlSectionProps) {
  return (
    <PodOutputTab
      {...outputTabProps}
      copyField="yaml"
      kubectlComment={`# kubectl get pod ${podName} -n ${namespace} -o yaml`}
      refreshIcon={Code}
      refreshLabel="Refresh"
    />
  )
}
