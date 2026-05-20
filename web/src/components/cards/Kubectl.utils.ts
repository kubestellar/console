export const YAML_PREVIEW_LINES = 5

/**
 * Validate YAML content for basic structural correctness.
 * Returns { valid: boolean, error: string | null }
 */
export function validateYAML(content: string): { valid: boolean; error: string | null } {
  if (!content.trim()) {
    return { valid: true, error: null }
  }

  try {
    // Basic YAML validation (check for common issues)
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Check for tabs (YAML doesn't allow tabs)
      if (line.includes('\t')) {
        return { valid: false, error: `Line ${i + 1}: YAML doesn't allow tabs, use spaces` }
      }
    }

    // Check for basic YAML structure
    if (content.includes('apiVersion:') && content.includes('kind:')) {
      return { valid: true, error: null }
    } else if (content.trim()) {
      return { valid: false, error: 'YAML should contain apiVersion and kind fields' }
    }

    return { valid: true, error: null }
  } catch (err: unknown) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid YAML' }
  }
}

/**
 * Generate kubectl command from AI prompt
 */
export function generateCommandFromPrompt(prompt: string): string | null {
  const lowerPrompt = prompt.toLowerCase()

  if (lowerPrompt.includes('deployment') && lowerPrompt.includes('nginx')) {
    const replicas = prompt.match(/(\d+)\s+replica/)?.[1] || '3'
    return `create deployment nginx --image=nginx --replicas=${replicas}`
  } else if (lowerPrompt.includes('pod') && lowerPrompt.includes('list')) {
    return 'get pods --all-namespaces'
  } else if (lowerPrompt.includes('scale') && lowerPrompt.match(/deployment|deploy/)) {
    const name = lowerPrompt.match(/deployment\s+(\S+)/)?.[1] || 'my-deployment'
    const replicas = lowerPrompt.match(/(\d+)\s+replica/)?.[1] || '5'
    return `scale deployment ${name} --replicas=${replicas}`
  } else if (lowerPrompt.includes('delete') && lowerPrompt.match(/pod|pods/)) {
    return 'delete pod <pod-name>'
  } else if (lowerPrompt.includes('logs')) {
    return 'logs <pod-name>'
  } else if (lowerPrompt.includes('describe')) {
    const resource = lowerPrompt.match(/describe\s+(\S+)/)?.[1] || 'pod'
    return `describe ${resource} <name>`
  }

  return null
}

/**
 * Generate YAML from AI prompt
 */
export function generateYAMLFromPrompt(prompt: string): string | null {
  const lowerPrompt = prompt.toLowerCase()

  if (lowerPrompt.includes('deployment') && lowerPrompt.includes('nginx')) {
    const replicas = prompt.match(/(\d+)\s+replica/)?.[1] || '3'
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "64Mi"
            cpu: "250m"
          limits:
            memory: "128Mi"
            cpu: "500m"`
  } else if (lowerPrompt.includes('service')) {
    return `apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: my-app
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: ClusterIP`
  } else if (lowerPrompt.includes('configmap')) {
    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  config.json: |
    {
      "key": "value"
    }`
  }

  return null
}

/**
 * Parse kubectl command and add format/dry-run flags as needed
 */
export function parseCommandArgs(
  cmd: string,
  outputFormat: 'table' | 'yaml' | 'json' | 'wide',
  dryRun: boolean
): string[] {
  const args = cmd.trim().split(/\s+/)

  // Add output format if not specified
  if (!args.includes('-o') && !args.includes('--output') && outputFormat !== 'table') {
    args.push('-o', outputFormat)
  }

  // Add dry-run flag if enabled
  if (dryRun && (args[0] === 'apply' || args[0] === 'create' || args[0] === 'delete')) {
    if (!args.includes('--dry-run')) {
      args.push('--dry-run=client')
    }
  }

  return args
}
