import { GPUReservation } from '../../../hooks/useGPUReservations'

interface ReservationTableProps {
  reservations: GPUReservation[]
  expandedId: string | null
  onSelectReservation: (id: string) => void
}

export function ReservationTable({
  reservations,
  expandedId,
  onSelectReservation,
}: ReservationTableProps) {
  return (
    <div className="space-y-2">
      {reservations.map(r => (
        <div key={r.id} className="p-3 rounded-lg bg-card/50 border border-border/50 cursor-pointer hover:bg-card/70"
          onClick={() => onSelectReservation(r.id)}>
          <div className="flex justify-between items-center">
            <div className="font-medium text-foreground">{r.title}</div>
            <div className="text-xs text-muted-foreground">{r.gpu_count} GPUs</div>
          </div>
        </div>
      ))}
    </div>
  )
}
