import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
export const POINTER_SENSOR_ACTIVATION_DISTANCE = 10
export function useDashboardSensors() {
  return useSensors(useSensor(PointerSensor, {distance: POINTER_SENSOR_ACTIVATION_DISTANCE}), useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}))
}
