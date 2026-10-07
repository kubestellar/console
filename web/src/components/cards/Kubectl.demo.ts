// Demo-mode sample manifests and command history for the Kubectl card.
// Extracted from Kubectl.tsx (issue #24058) — data unchanged.
import type { CommandHistoryItem, YAMLManifest } from './Kubectl.types'

const DEMO_YAML_CONTENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-cache-warmer
  namespace: llm-d
spec:
  replicas: 2
  selector:
    matchLabels:
      app: llm-cache-warmer
  template:
    metadata:
      labels:
        app: llm-cache-warmer
    spec:
      containers:
      - name: warmer
        image: ghcr.io/kubestellar/demo-cache-warmer:v1.4.2
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "1"
            memory: "1Gi"`

const DEMO_MANIFEST_TIMESTAMP = new Date('2026-05-26T09:30:00Z')

export const DEMO_YAML_MANIFESTS: YAMLManifest[] = [
  {
    id: 'demo-manifest-cache-warmer',
    name: 'llm-cache-warmer',
    content: DEMO_YAML_CONTENT,
    timestamp: DEMO_MANIFEST_TIMESTAMP,
  },
]

export const DEMO_COMMAND_HISTORY: CommandHistoryItem[] = [
  {
    id: 'demo-history-get-pods',
    command: 'get pods -n llm-d',
    context: 'demo-cluster',
    output: 'NAME READY STATUS RESTARTS AGE\nllm-cache-warmer-7dd68 1/1 Running 0 18m',
    success: true,
    timestamp: new Date('2026-05-26T09:22:00Z'),
  },
]
