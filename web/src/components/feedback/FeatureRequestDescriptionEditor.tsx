import { SubmitForm } from './SubmitTab'
import type { SubmitFormProps } from './submitTab.types'

interface FeatureRequestDescriptionEditorProps {
  submitFormProps: SubmitFormProps
}

export function FeatureRequestDescriptionEditor({ submitFormProps }: FeatureRequestDescriptionEditorProps) {
  return <SubmitForm {...submitFormProps} />
}
