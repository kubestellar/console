/**
 * Constants shared across MissionControlDialog and its sub-components.
 */

import { Rocket, Target, Map } from 'lucide-react'
import type { WizardPhase } from './types'

export const PHASE_STEPS: {
  key: WizardPhase
  label: string
  icon: React.ReactNode
  description: string
}[] = [
  {
    key: 'define',
    label: 'Define Mission',
    icon: <Target className="w-4 h-4" />,
    description: 'Describe your fix and select projects',
  },
  {
    key: 'assign',
    label: 'Chart Course',
    icon: <Map className="w-4 h-4" />,
    description: 'Assign projects to clusters',
  },
  {
    key: 'blueprint',
    label: 'Flight Plan',
    icon: <Rocket className="w-4 h-4" />,
    description: 'Review blueprint and deploy',
  },
]

/** Fallback a11y label when the user hasn't entered a mission title yet (issue 6745) */
export const DEFAULT_DIALOG_ARIA_LABEL = 'Mission control dialog'

/** Inset from left/right/bottom so the backdrop peeks through. */
export const MODAL_SIDE_INSET_PX = 16
/** Top inset must clear the fixed navbar (64px) + a small gap. */
export const MODAL_TOP_INSET_PX = 80
