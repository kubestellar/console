// Mock security data - in production would come from check_security_issues API
export interface SecurityIssue {
  type: 'privileged' | 'root' | 'hostNetwork' | 'hostPID' | 'noSecurityContext'
  severity: 'high' | 'medium' | 'low'
  resource: string
  namespace: string
  cluster: string
  message: string
}

// Mock RBAC data
export interface RBACBinding {
  name: string
  kind: 'Role' | 'ClusterRole'
  subjects: { kind: string; name: string }[]
  cluster: string
  namespace?: string
  permissions: string[]
  riskLevel: 'high' | 'medium' | 'low'
}

// Mock compliance checks
export interface ComplianceCheck {
  id: string
  name: string
  category: string
  status: 'pass' | 'fail' | 'warn'
  description: string
  cluster: string
}

export function getMockSecurityData(): SecurityIssue[] {
  return [
    {
      type: 'privileged',
      severity: 'high',
      resource: 'vllm-engine',
      namespace: 'default',
      cluster: 'vllm-d',
      message: 'Container runs in privileged mode',
    },
    {
      type: 'root',
      severity: 'medium',
      resource: 'metrics-collector',
      namespace: 'monitoring',
      cluster: 'ops',
      message: 'Container runs as root user',
    },
    {
      type: 'noSecurityContext',
      severity: 'low',
      resource: 'web-frontend',
      namespace: 'e5',
      cluster: 'vllm-d',
      message: 'No security context defined',
    },
    {
      type: 'hostNetwork',
      severity: 'high',
      resource: 'network-agent',
      namespace: 'kube-system',
      cluster: 'ops',
      message: 'Container uses host network',
    },
    {
      type: 'hostPID',
      severity: 'high',
      resource: 'process-monitor',
      namespace: 'monitoring',
      cluster: 'vllm-d',
      message: 'Container uses host PID namespace',
    },
    {
      type: 'root',
      severity: 'medium',
      resource: 'backup-agent',
      namespace: 'default',
      cluster: 'kind',
      message: 'Container runs as root user',
    },
  ]
}

export function getMockRBACData(): RBACBinding[] {
  return [
    {
      name: 'cluster-admin-binding',
      kind: 'ClusterRole',
      subjects: [{ kind: 'User', name: 'admin@company.com' }],
      cluster: 'ops',
      permissions: ['*'],
      riskLevel: 'high',
    },
    {
      name: 'developer-role',
      kind: 'Role',
      subjects: [{ kind: 'Group', name: 'developers' }],
      cluster: 'vllm-d',
      namespace: 'default',
      permissions: ['get', 'list', 'watch', 'create', 'update', 'delete pods'],
      riskLevel: 'medium',
    },
    {
      name: 'viewer-role',
      kind: 'ClusterRole',
      subjects: [{ kind: 'ServiceAccount', name: 'monitoring-sa' }],
      cluster: 'ops',
      permissions: ['get', 'list', 'watch'],
      riskLevel: 'low',
    },
    {
      name: 'secret-admin',
      kind: 'Role',
      subjects: [{ kind: 'User', name: 'vault-admin@company.com' }],
      cluster: 'ops',
      namespace: 'vault',
      permissions: ['*secrets*'],
      riskLevel: 'high',
    },
  ]
}

export function getMockComplianceData(): ComplianceCheck[] {
  return [
    { id: 'pss-001', name: 'Pod Security Standards', category: 'Pod Security', status: 'pass', description: 'Restricted PSS enforced in production namespaces', cluster: 'ops' },
    { id: 'pss-002', name: 'Pod Security Standards', category: 'Pod Security', status: 'warn', description: 'Baseline PSS only in development namespaces', cluster: 'vllm-d' },
    { id: 'net-001', name: 'Network Policies', category: 'Network', status: 'pass', description: 'Default deny network policy applied', cluster: 'ops' },
    { id: 'net-002', name: 'Network Policies', category: 'Network', status: 'fail', description: 'No network policies in default namespace', cluster: 'vllm-d' },
    { id: 'rbac-001', name: 'RBAC Least Privilege', category: 'RBAC', status: 'warn', description: '3 cluster-admin bindings detected', cluster: 'ops' },
    { id: 'rbac-002', name: 'RBAC Least Privilege', category: 'RBAC', status: 'pass', description: 'Service accounts use minimal permissions', cluster: 'kind' },
    { id: 'sec-001', name: 'Secrets Encryption', category: 'Secrets', status: 'pass', description: 'etcd encryption at rest enabled', cluster: 'ops' },
    { id: 'sec-002', name: 'Secrets Encryption', category: 'Secrets', status: 'fail', description: 'Secrets not encrypted at rest', cluster: 'kind' },
    { id: 'img-001', name: 'Image Scanning', category: 'Images', status: 'pass', description: 'All images scanned with no critical CVEs', cluster: 'ops' },
    { id: 'img-002', name: 'Image Signing', category: 'Images', status: 'warn', description: 'Image signature verification not enforced', cluster: 'vllm-d' },
  ]
}
