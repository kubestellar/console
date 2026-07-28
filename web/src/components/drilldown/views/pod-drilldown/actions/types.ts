import type { RelatedResource } from '../types'

export interface WsMessage {
  id?: string
  type?: string
  payload?: {
    exitCode?: number
    error?: string
    output?: string
  }
}

export interface UsePodActionsProps {
  cluster: string
  namespace: string
  podName: string
  status: string
  restarts: number
  issues: string[]
  agentConnected: boolean
  backendActionUnavailable: boolean
  backendUnavailableMessage: string
  labels: Record<string, string> | null
  annotations: Record<string, string> | null
  ownerChain: RelatedResource[]
  openTrackedWs: () => Promise<WebSocket>
  parseWsMessage: (event: MessageEvent, context: string) => WsMessage | null
}

export interface PodMetadataActionProps {
  cluster: string
  namespace: string
  podName: string
  agentConnected: boolean
  labels: Record<string, string> | null
  annotations: Record<string, string> | null
  openTrackedWs: () => Promise<WebSocket>
  parseWsMessage: (event: MessageEvent, context: string) => WsMessage | null
}

export interface PodDeleteRepairActionProps {
  cluster: string
  namespace: string
  podName: string
  status: string
  restarts: number
  issues: string[]
  agentConnected: boolean
  backendActionUnavailable: boolean
  backendUnavailableMessage: string
  ownerChain: RelatedResource[]
  openTrackedWs: () => Promise<WebSocket>
  parseWsMessage: (event: MessageEvent, context: string) => WsMessage | null
}

export interface PodRelatedResourcesActionProps {
  cluster: string
  namespace: string
  podName: string
  agentConnected: boolean
  openTrackedWs: () => Promise<WebSocket>
  parseWsMessage: (event: MessageEvent, context: string) => WsMessage | null
}
