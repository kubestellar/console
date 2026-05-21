import type { ComponentType, ReactNode } from 'react'
import { iconRegistry } from '../../../lib/icons'

export function renderIcon(iconName: string, className?: string): ReactNode {
  const IconComponent = iconRegistry[iconName] as ComponentType<{ className?: string }> | undefined
  return IconComponent ? <IconComponent className={className} /> : null
}
