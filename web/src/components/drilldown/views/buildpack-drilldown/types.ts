import type { BuildpackStatus } from '../../../cards/buildpacks-status/BuildpacksStatus'
import type { ComponentType, SVGProps } from 'react'

export interface Props {
  data: Record<string, unknown>
}

export type TabType = 'overview' | 'yaml' | 'builds' | 'logs' | 'ai'

export type KpackConditionStatus = 'True' | 'False' | 'Unknown'

export interface KpackCondition {
  type: string
  status: KpackConditionStatus
  reason?: string
  message?: string
  lastTransitionTime?: string
}

export interface KpackImageStatus {
  metadata?: {
    name?: string
    namespace?: string
    creationTimestamp?: string
  }
  spec?: {
    builder?: {
      image?: string
    }
  }
  status?: {
    latestImage?: string
    conditions?: KpackCondition[]
  }
}

export interface KpackBuild {
  metadata: {
    name: string
    creationTimestamp: string
  }
  status?: {
    conditions?: KpackCondition[]
  }
}

export interface StatusStyle {
  bg: string
  text: string
  border: string
}

export interface BuildpackTabItem {
  id: TabType
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export type { BuildpackStatus }
