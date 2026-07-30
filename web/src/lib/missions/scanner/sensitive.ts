/**
 * Sensitive Data Scanner
 *
 * Scans MissionExport objects for sensitive data like IP addresses,
 * tokens, credentials, certificates, and secrets.
 */

import type { MissionExport } from '../types'

export type SensitiveSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface SensitiveFinding {
  type: string
  severity: SensitiveSeverity
  match: string
  location: string
  message: string
}

const EXCLUDED_IPV4 = new Set([
  '127.0.0.1',
  '0.0.0.0',
  '8.8.8.8',
  '8.8.4.4',
  '1.1.1.1',
  '1.0.0.1',
  '255.255.255.0',
  '255.255.255.255',
])

interface SensitivePattern {
  type: string
  severity: SensitiveSeverity
  regex: RegExp
  message: string
  exclude?: (match: string) => boolean
  captureGroup?: number
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  {
    type: 'ipv4',
    severity: 'medium',
    regex: /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g,
    message: 'IPv4 address detected',
    exclude: (m) => EXCLUDED_IPV4.has(m),
    captureGroup: 1,
  },
  {
    type: 'ipv6',
    severity: 'medium',
    regex: /\b([0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{0,4}){2,7})\b/g,
    message: 'IPv6 address detected',
    captureGroup: 1,
  },
  {
    type: 'hostname',
    severity: 'medium',
    regex:
      /\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:internal|local|corp|private|cluster\.local|compute\.internal))\b/gi,
    message: 'Internal hostname detected',
    captureGroup: 1,
  },
  {
    type: 'jwt',
    severity: 'critical',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    message: 'JWT token detected',
  },
  {
    type: 'bearer-token',
    severity: 'critical',
    regex: /Bearer\s+[A-Za-z0-9_-]{20,}/g,
    message: 'Bearer token detected',
  },
  {
    type: 'github-pat',
    severity: 'critical',
    regex: /\bghp_[A-Za-z0-9]{36,}\b/g,
    message: 'GitHub personal access token detected',
  },
  {
    type: 'aws-key',
    severity: 'critical',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    message: 'AWS access key detected',
  },
  {
    type: 'email',
    severity: 'low',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:internal|corp|local|private)\b/gi,
    message: 'Internal email address detected',
  },
  {
    type: 'pem-cert',
    severity: 'critical',
    regex: /-----BEGIN\s+(?:CERTIFICATE|PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY)-----/g,
    message: 'PEM certificate or key detected',
  },
  {
    type: 'ssh-key',
    severity: 'critical',
    regex: /ssh-(?:rsa|ed25519|ecdsa|dsa)\s+AAAA[A-Za-z0-9+/]+/g,
    message: 'SSH key detected',
  },
]

function* extractTextFields(mission: MissionExport): Generator<[string, string]> {
  if (mission.title) yield [mission.title, 'title']
  if (mission.description) yield [mission.description, 'description']

  if (mission.steps) {
    for (let i = 0; i < mission.steps.length; i++) {
      const step = mission.steps[i]
      if (step.title) yield [step.title, `steps[${i}].title`]
      if (step.description) yield [step.description, `steps[${i}].description`]
      if (step.command) yield [step.command, `steps[${i}].command`]
      if (step.yaml) yield [step.yaml, `steps[${i}].yaml`]
      if (step.validation) yield [step.validation, `steps[${i}].validation`]
    }
  }

  if (mission.resolution) {
    if (mission.resolution.summary)
      yield [mission.resolution.summary, 'resolution.summary']
    if (mission.resolution.yaml) yield [mission.resolution.yaml, 'resolution.yaml']
    if (mission.resolution.steps) {
      for (let i = 0; i < mission.resolution.steps.length; i++) {
        yield [mission.resolution.steps[i], `resolution.steps[${i}]`]
      }
    }
  }

  if (mission.prerequisites) {
    for (let i = 0; i < mission.prerequisites.length; i++) {
      yield [mission.prerequisites[i], `prerequisites[${i}]`]
    }
  }
}

export function scanForSensitiveData(mission: MissionExport): SensitiveFinding[] {
  const findings: SensitiveFinding[] = []

  for (const [text, location] of extractTextFields(mission)) {
    // Regex-based pattern checks
    for (const pattern of SENSITIVE_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
      let match: RegExpExecArray | null
      while ((match = regex.exec(text)) !== null) {
        const matchText =
          pattern.captureGroup !== undefined
            ? match[pattern.captureGroup] || match[0]
            : match[0]
        if (pattern.exclude && pattern.exclude(matchText)) continue
        findings.push({
          type: pattern.type,
          severity: pattern.severity,
          match: matchText,
          location,
          message: pattern.message,
        })
      }
    }

    // Special check for Kubernetes Secret manifests
    if (/kind:\s*Secret/.test(text) && /\bdata:/.test(text)) {
      findings.push({
        type: 'k8s-secret',
        severity: 'high',
        match: text.substring(0, Math.min(text.length, 100)),
        location,
        message: 'Kubernetes Secret manifest detected',
      })
    }
  }

  return findings
}

export function hasCriticalSensitiveFindings(
  findings: SensitiveFinding[]
): boolean {
  return findings.some((f) => f.severity === 'critical')
}
