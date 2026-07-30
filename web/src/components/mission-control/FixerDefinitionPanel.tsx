import { FixerDefinitionPanel as FixerDefinitionPanelContent } from './fixer-definition-panel/FixerDefinitionPanelContent'

type FixerDefinitionPanelProps = Parameters<typeof FixerDefinitionPanelContent>[0]

export function FixerDefinitionPanel(props: FixerDefinitionPanelProps) {
  return <FixerDefinitionPanelContent {...props} />
}
