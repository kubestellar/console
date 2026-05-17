import WidgetExportModalContent from './widget-export-modal/WidgetExportModalContent'

type WidgetExportModalProps = Parameters<typeof WidgetExportModalContent>[0]

export function WidgetExportModal(props: WidgetExportModalProps) {
  return <WidgetExportModalContent {...props} />
}

export default WidgetExportModal
