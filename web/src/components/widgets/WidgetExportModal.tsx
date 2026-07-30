import WidgetExportModalContent from './widget-export-modal/WidgetExportModalContent'

type WidgetExportModalProps = Parameters<typeof WidgetExportModalContent>[0]

export function WidgetExportModal({ isOpen, onClose, ...rest }: WidgetExportModalProps) {
  if (!isOpen) {
    return null
  }
  return <WidgetExportModalContent isOpen={isOpen} onClose={onClose} {...rest} />
}

export default WidgetExportModal
