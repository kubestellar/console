import { memo } from 'react'
import { Box, Eye, Layers, Server } from 'lucide-react'
import { BaseModal } from '../../lib/modals/BaseModal'
import type { ModalResource } from './NamespaceMonitor.types'
import { ResourceIcons } from './NamespaceMonitor.utils'

// useCardLoadingState is handled by the parent NamespaceMonitor card.

interface NamespaceMonitorModalProps {
  modalResource: ModalResource | null
  onClose: () => void
  onViewDetails: (resource: ModalResource) => void
}

function NamespaceMonitorModalComponent({
  modalResource,
  onClose,
  onViewDetails,
}: NamespaceMonitorModalProps) {
  if (!modalResource) {
    return null
  }

  const ResourceIcon = ResourceIcons[modalResource.type]

  return (
    <BaseModal isOpen={!!modalResource} onClose={onClose} size="sm">
      <BaseModal.Header title={modalResource.name} icon={ResourceIcon} onClose={onClose} />

      <BaseModal.Content>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Server className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Cluster:</span>
            <span className="text-foreground">{modalResource.cluster}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Namespace:</span>
            <span className="text-foreground">{modalResource.namespace}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Box className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Type:</span>
            <span className="text-foreground capitalize">{modalResource.type}</span>
          </div>
        </div>
      </BaseModal.Content>

      <BaseModal.Footer showKeyboardHints={false}>
        <button
          onClick={() => onViewDetails(modalResource)}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 rounded text-sm text-white transition-colors ml-auto"
        >
          <Eye className="w-4 h-4" />
          View Details
        </button>
      </BaseModal.Footer>
    </BaseModal>
  )
}

const MemoizedNamespaceMonitorModal = memo(NamespaceMonitorModalComponent)

export function NamespaceMonitorModal(props: NamespaceMonitorModalProps) {
  return <MemoizedNamespaceMonitorModal {...props} />
}
