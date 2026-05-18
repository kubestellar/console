import { UpdateSettingsForm } from './UpdateSettingsForm'
import { useUpdateSettingsState } from './useUpdateSettingsState'

export function UpdateSettings() {
  const state = useUpdateSettingsState()

  return <UpdateSettingsForm state={state} />
}
