import { CompactErrorBoundary } from '../CompactErrorBoundary'
import { GPUReservationsTab, type GPUReservationsTabProps } from './GPUReservationsTab'

export function ReservationTable(props: GPUReservationsTabProps) {
  return (
    <CompactErrorBoundary context="GPUReservationsTab">
      <GPUReservationsTab {...props} />
    </CompactErrorBoundary>
  )
}
