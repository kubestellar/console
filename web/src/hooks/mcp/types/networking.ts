/** Structured view of a ServicePort that preserves the port name
 * (issue #6163). Matches pkg/k8s.ServicePortDetail. */
export interface ServicePortDetail {
  /** Optional name from the k8s ServicePort (e.g. "http", "metrics"). */
  name?: string
  /** Service-level port number. */
  port: number
  /** TCP / UDP / SCTP. */
  protocol?: string
  /** Externally exposed port for NodePort / LoadBalancer services. */
  nodePort?: number
}

export interface Service {
  name: string
  namespace: string
  cluster?: string
  type: string // ClusterIP, NodePort, LoadBalancer, ExternalName
  clusterIP?: string
  externalIP?: string
  /** Legacy flat representation ("80/TCP" or "80:30080/TCP"). */
  ports?: string[]
  /** Structured ports with optional names (issue #6163). Same order as `ports`. */
  portDetails?: ServicePortDetail[]
  // Number of ready backend addresses (pods) currently associated with this
  // service via its core/v1 Endpoints object. Issue #6150: the Endpoints
  // dashboard stat sums this across services rather than counting services.
  endpoints?: number
  // LoadBalancer provisioning state. Empty string for non-LoadBalancer
  // services. 'Provisioning' when a LoadBalancer service has no ingress
  // IP/hostname yet, 'Ready' when it does. Issue #6153.
  lbStatus?: string
  /** Label selector for backing pods. Used to detect orphaned services
   * (issue #6164) and invalid empty selectors on non-ExternalName services
   * (issue #6166). */
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
