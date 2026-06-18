export interface ServicePortDetail {
  name?: string
  port: number
  protocol?: string
  nodePort?: number
}

export interface Service {
  name: string
  namespace: string
  cluster?: string
  type: string
  clusterIP?: string
  externalIP?: string
  ports?: string[]
  portDetails?: ServicePortDetail[]
  endpoints?: number
  lbStatus?: string
  selector?: Record<string, string>
  age?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export interface Ingress {
  name: string
  namespace: string
  cluster?: string
  class?: string
  hosts: string[]
  address?: string
  age?: string
  labels?: Record<string, string>
}

export interface NetworkPolicy {
  name: string
  namespace: string
  cluster?: string
  policyTypes: string[]
  podSelector: string
  age?: string
  labels?: Record<string, string>
}
