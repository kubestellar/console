// Persisted user preferences for the version checker (update channel, last
// check time, skipped versions, auto-update toggle).
// Extracted from useVersionCheckCore.tsx (issue #24058) — logic unchanged.
import type { UpdateChannel } from '../../types/updates'
import { UPDATE_STORAGE_KEYS } from '../../types/updates'
import { loadAutoUpdateEnabled, loadChannel, loadSkippedVersions } from '../versionUtils'
import { usePersistedState } from './usePersistedState'
import {
  deserializeChannel,
  deserializeLastChecked,
  deserializeSkippedVersions,
} from './versionCheckSerializers'

export function useVersionCheckPreferences() {
  const [channel, setChannelState] = usePersistedState<UpdateChannel>(
    UPDATE_STORAGE_KEYS.CHANNEL,
    loadChannel,
    {
      deserialize: deserializeChannel,
      serialize: (value) => value,
    },
  )
  const [lastChecked, setLastChecked] = usePersistedState<number | null>(
    UPDATE_STORAGE_KEYS.LAST_CHECK,
    null,
    {
      deserialize: deserializeLastChecked,
      serialize: (value) => String(value),
      removeWhen: (value) => value == null,
    },
  )
  const [skippedVersions, setSkippedVersions] = usePersistedState<string[]>(
    UPDATE_STORAGE_KEYS.SKIPPED_VERSIONS,
    loadSkippedVersions,
    {
      deserialize: deserializeSkippedVersions,
      serialize: (value) => JSON.stringify(value),
      removeWhen: (value) => value.length === 0,
    },
  )
  const [autoUpdateEnabled, setAutoUpdateEnabledState] = usePersistedState<boolean>(
    UPDATE_STORAGE_KEYS.AUTO_UPDATE_ENABLED,
    loadAutoUpdateEnabled,
    {
      deserialize: (raw) => raw === 'true',
      serialize: (value) => String(value),
    },
  )

  return {
    channel, setChannelState,
    lastChecked, setLastChecked,
    skippedVersions, setSkippedVersions,
    autoUpdateEnabled, setAutoUpdateEnabledState,
  }
}
