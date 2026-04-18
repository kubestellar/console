import { useState } from 'react'
import { Check, Loader2, Edit3 } from 'lucide-react'
import { BaseModal } from '../../../lib/modals'

interface RenameModalProps {
  isOpen?: boolean
  clusterName: string
  currentDisplayName: string
  onClose: () => void
  onRename: (oldName: string, newName: string) => Promise<void>
}

// Phases for the rename action button. The 'success' phase is sticky: once we
// enter it after a successful rename we stay there until the modal unmounts.
// This prevents the button from flashing back to "Rename" during the close
// animation (see #8927).
type RenamePhase = 'idle' | 'renaming' | 'success'

export function RenameModal({ isOpen = true, clusterName, currentDisplayName, onClose, onRename }: RenameModalProps) {
  const [newName, setNewName] = useState(currentDisplayName)
  const [phase, setPhase] = useState<RenamePhase>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleRename = async () => {
    if (!newName.trim()) {
      setError('Name cannot be empty')
      return
    }
    if (newName.includes(' ')) {
      setError('Name cannot contain spaces')
      return
    }
    if (newName.trim() === currentDisplayName) {
      setError('Name is unchanged')
      return
    }

    setPhase('renaming')
    setError(null)

    try {
      await onRename(clusterName, newName.trim())
      // Lock the button into the 'success' phase before triggering close so
      // the label does not flip back to "Rename" while the modal fades out.
      setPhase('success')
      onClose()
    } catch (err) {
      setPhase('idle')
      setError(err instanceof Error ? err.message : 'Failed to rename context')
    }
  }

  const isBusy = phase === 'renaming' || phase === 'success'

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="sm" closeOnBackdrop={false}>
      <BaseModal.Header
        title="Rename Context"
        icon={Edit3}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
        <p className="text-sm text-muted-foreground mb-4">
          Current: <span className="text-foreground font-mono text-xs break-all">{currentDisplayName}</span>
        </p>

        <div className="mb-4">
          <label htmlFor="new-context-name" className="block text-sm text-muted-foreground mb-1">New name</label>
          <input
            id="new-context-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm font-mono"
            autoFocus
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <p className="text-xs text-muted-foreground">This updates your kubeconfig via the local agent.</p>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints>
        <div className="flex-1" />
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50">
            Cancel
          </button>
          <button
            onClick={handleRename}
            disabled={isBusy || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            {phase === 'renaming' ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Renaming...</>
            ) : phase === 'success' ? (
              <><Check className="w-4 h-4" />Renamed</>
            ) : (
              <><Check className="w-4 h-4" />Rename</>
            )}
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
