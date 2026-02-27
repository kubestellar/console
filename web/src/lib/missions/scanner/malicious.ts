/**
 * Malicious Content Scanner
 *
 * Scans MissionExport objects for potentially malicious content including
 * XSS attacks, privilege escalation, command injection, and suspicious patterns.
 */

import type { MissionExport } from '../types'

export type MaliciousSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface MaliciousFinding {
  type: string
  severity: MaliciousSeverity
  match: string
  location: string
  message: string
}

interface MaliciousCheck {
  type: string
  severity: MaliciousSeverity
  message: string
  fields: 'all' | 'yaml-command' | 'text'
  check: (text: string) => string | null
}

const ALL_CHECKS: MaliciousCheck[] = [
  // XSS checks
  {
    type: 'xss-script',
    severity: 'critical',
    message: 'XSS: script tag detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/<script[\s>]/i)
      return m ? m[0] : null
    },
  },
  {
    type: 'xss-javascript-uri',
    severity: 'critical',
    message: 'XSS: javascript URI detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/javascript\s*:/i)
      return m ? m[0] : null
    },
  },
  {
    type: 'xss-event-handler',
    severity: 'critical',
    message: 'XSS: inline event handler detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/<[^>]+\bon\w+\s*=/i)
      return m ? m[0] : null
    },
  },
  {
    type: 'xss-data-uri',
    severity: 'high',
    message: 'XSS: data URI with HTML content detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/data:text\/html/i)
      return m ? m[0] : null
    },
  },
  {
    type: 'xss-svg',
    severity: 'critical',
    message: 'XSS: SVG with event handler detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/<svg[^>]*\bon\w+\s*=/i)
      return m ? m[0] : null
    },
  },
  // Kubernetes privilege checks
  {
    type: 'privileged-container',
    severity: 'critical',
    message: 'Privileged container detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/privileged:\s*true/i)
      return m ? m[0] : null
    },
  },
  {
    type: 'host-network',
    severity: 'high',
    message: 'Host network access detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/hostNetwork:\s*true/i)
      return m ? m[0] : null
    },
  },
  {
    type: 'dangerous-hostpath',
    severity: 'critical',
    message: 'Dangerous hostPath mount detected (root filesystem)',
    fields: 'all',
    check: (text) => {
      if (!/hostPath:/i.test(text)) return null
      const m = text.match(/hostPath:[\s\S]*?path:\s*\/\s*(?:[\n\r}\s]|$)/m)
      return m ? m[0].trim() : null
    },
  },
  {
    type: 'docker-socket',
    severity: 'critical',
    message: 'Docker socket mount detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/\/var\/run\/docker\.sock/)
      return m ? m[0] : null
    },
  },
  {
    type: 'rbac-wildcard',
    severity: 'critical',
    message: 'RBAC wildcard permissions detected',
    fields: 'all',
    check: (text) => {
      const hasWildcardResources = /resources:\s*\[?\s*["']?\*["']?\s*\]?/.test(text)
      const hasWildcardVerbs = /verbs:\s*\[?\s*["']?\*["']?\s*\]?/.test(text)
      if (hasWildcardResources && hasWildcardVerbs) {
        return 'resources: ["*"] verbs: ["*"]'
      }
      return null
    },
  },
  // Supply chain checks
  {
    type: 'crypto-miner',
    severity: 'critical',
    message: 'Potential cryptocurrency miner detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/\b(?:xmrig|minergate|coinhive|cryptonight)\b/i)
      return m ? m[0] : null
    },
  },
  {
    type: 'curl-pipe-bash',
    severity: 'critical',
    message: 'Curl piped to shell detected',
    fields: 'all',
    check: (text) => {
      const m = text.match(/curl\s+[^\n|]*\|\s*(?:bash|sh|zsh)/i)
      return m ? m[0] : null
    },
  },
  {
    type: 'url-shortener',
    severity: 'high',
    message: 'URL shortener detected in manifest',
    fields: 'yaml-command',
    check: (text) => {
      const m = text.match(
        /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|v\.gd)\/[^\s]*/i
      )
      return m ? m[0] : null
    },
  },
  // Command injection checks
  {
    type: 'command-injection',
    severity: 'high',
    message: 'Potential command injection detected',
    fields: 'yaml-command',
    check: (text) => {
      const m = text.match(/`[^`]+`|\$\([^)]+\)/)
      return m ? m[0] : null
    },
  },
  {
    type: 'base64-encoded-script',
    severity: 'high',
    message: 'Base64-encoded script content detected',
    fields: 'all',
    check: (text) => {
      const base64Regex = /[A-Za-z0-9+/]{20,}={0,2}/g
      let m: RegExpExecArray | null
      while ((m = base64Regex.exec(text)) !== null) {
        try {
          // Cross-environment base64 decode (globalThis.atob works in browsers and Node 16+)
          const decoded = globalThis.atob(m[0])
          if (/<script/i.test(decoded) || /javascript:/i.test(decoded)) {
            return m[0]
          }
        } catch {
          // Not valid base64, skip
        }
      }
      return null
    },
  },
]

type FieldType = 'yaml' | 'command' | 'text'

function getFieldType(location: string): FieldType {
  if (location.endsWith('.yaml')) return 'yaml'
  if (location.endsWith('.command')) return 'command'
  return 'text'
}

function shouldScanField(
  checkFields: 'all' | 'yaml-command' | 'text',
  fieldType: FieldType
): boolean {
  if (checkFields === 'all') return true
  if (checkFields === 'yaml-command')
    return fieldType === 'yaml' || fieldType === 'command'
  if (checkFields === 'text') return fieldType === 'text'
  return true
}

function* extractTextFields(
  mission: MissionExport
): Generator<[string, string]> {
  if (mission.title) yield [mission.title, 'title']
  if (mission.description) yield [mission.description, 'description']

  if (mission.steps) {
    for (let i = 0; i < mission.steps.length; i++) {
      const step = mission.steps[i]
      if (step.title) yield [step.title, `steps[${i}].title`]
      if (step.description)
        yield [step.description, `steps[${i}].description`]
      if (step.command) yield [step.command, `steps[${i}].command`]
      if (step.yaml) yield [step.yaml, `steps[${i}].yaml`]
      if (step.validation) yield [step.validation, `steps[${i}].validation`]
    }
  }

  if (mission.resolution) {
    if (mission.resolution.summary)
      yield [mission.resolution.summary, 'resolution.summary']
    if (mission.resolution.yaml)
      yield [mission.resolution.yaml, 'resolution.yaml']
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

export function scanForMaliciousContent(
  mission: MissionExport
): MaliciousFinding[] {
  const findings: MaliciousFinding[] = []

  for (const [text, location] of extractTextFields(mission)) {
    const fieldType = getFieldType(location)

    for (const check of ALL_CHECKS) {
      if (!shouldScanField(check.fields, fieldType)) continue

      const match = check.check(text)
      if (match) {
        findings.push({
          type: check.type,
          severity: check.severity,
          match,
          location,
          message: check.message,
        })
      }
    }
  }

  return findings
}

export function hasMaliciousFindings(findings: MaliciousFinding[]): boolean {
  return findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high'
  )
}
