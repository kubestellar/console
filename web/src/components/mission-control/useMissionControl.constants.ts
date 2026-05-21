import { MS_PER_DAY } from '../../lib/constants/time'

export const STORAGE_KEY = 'kc_mission_control_state'
export const HISTORY_STORAGE_KEY = 'kc_mission_control_history'
export const WIZARD_STATE_TTL_MS = 7 * MS_PER_DAY
export const MAX_HISTORY_ENTRIES = 20
export const PERSISTED_SCHEMA_VERSION = 1
export const QUOTA_BANNER_KEY = 'kc_mission_control_quota_error'

export const PROJECT_NAME_MAX_LENGTH = 64
export const PROJECT_NAME_ALLOWED_REGEX = /^[A-Za-z0-9 _\-.()]+$/

export const STREAM_JSON_DEBOUNCE_MS = 250
export const MAX_BALANCED_BLOCKS_INPUT = 200_000
export const PERSIST_STATE_DEBOUNCE_MS = 300
export const PERSIST_KEYSTROKE_DEBOUNCE_MS = PERSIST_STATE_DEBOUNCE_MS
export const MAX_FENCE_BODY = 50_000
export const AI_SUGGEST_TIMEOUT_MS = 30_000

export const INITIAL_BALANCED_BLOCK_SCAN_INDEX = 0
export const INSUFFICIENT_CAPACITY_PENALTY = 40

export const CATEGORY_GROUPS: Record<string, string> = {
  Security: 'security',
  'Runtime Security': 'security',
  'Secrets Management': 'security',
  'Policy Engine': 'security',
  Observability: 'observability',
  Monitoring: 'observability',
  Logging: 'observability',
  Tracing: 'observability',
  Networking: 'networking',
  'Service Mesh': 'networking',
  Ingress: 'networking',
  Storage: 'storage',
  'Backup & Recovery': 'storage',
}

export const NS_ALIASES: Record<string, string[]> = {
  monitoring: ['prometheus', 'grafana', 'alertmanager', 'thanos'],
  observability: ['prometheus', 'grafana', 'alertmanager', 'jaeger', 'tempo'],
  logging: ['fluent-bit', 'fluentd', 'loki', 'fluentbit'],
  security: ['falco', 'kyverno', 'opa', 'trivy'],
  ingress: ['nginx', 'traefik', 'haproxy', 'ingress-nginx'],
  'gatekeeper-system': ['opa', 'open-policy-agent', 'opa-gatekeeper'],
}

export const BUNDLE_RELEASES: Record<string, string[]> = {
  'kube-prometheus-stack': ['prometheus', 'grafana', 'alertmanager', 'thanos', 'node-exporter'],
  'prometheus-operator': ['prometheus', 'grafana', 'alertmanager'],
  'loki-stack': ['loki', 'promtail', 'grafana'],
  'elastic-stack': ['elasticsearch', 'kibana', 'logstash', 'filebeat'],
  'opentelemetry-collector': ['opentelemetry-collector'],
  'opentelemetry-operator': ['opentelemetry-collector', 'opentelemetry-operator'],
  'istio-addons': ['prometheus', 'grafana', 'jaeger', 'kiali'],
}
