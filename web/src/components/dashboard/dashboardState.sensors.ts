/**
 * Dashboard dnd-kit sensor configuration.
 *
 * Extracted from DashboardState.ts as part of the module split (tracked by
 * #21727). Encapsulates the PointerSensor and KeyboardSensor setup so
 * DashboardState.ts only deals with state wiring.
 */
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { POINTER_SENSOR_ACTIVATION_DISTANCE } from './layout'

export function useDashboardSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: POINTER_SENSOR_ACTIVATION_DISTANCE,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
}
