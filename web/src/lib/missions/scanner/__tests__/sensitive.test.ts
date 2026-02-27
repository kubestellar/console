import { describe, it, expect } from 'vitest'
import {
  scanForSensitiveData,
  hasCriticalSensitiveFindings,
} from '../sensitive'
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

describe('scanForSensitiveData', () => {
  it('detects IPv4 addresses', () => {
    const mission = makeMission({
      steps: [makeStep('Connect to 192.168.1.100 for access')],
    })
    const findings = scanForSensitiveData(mission)
    const ipFindings = findings.filter((f) => f.type === 'ipv4')
    expect(ipFindings.length).toBeGreaterThanOrEqual(1)
    expect(ipFindings[0].match).toBe('192.168.1.100')
    expect(ipFindings[0].severity).toBe('medium')
  })

  it('excludes common safe IPv4 addresses', () => {
    const mission = makeMission({
      steps: [makeStep('Use 127.0.0.1 or 8.8.8.8 for DNS')],
    })
    const findings = scanForSensitiveData(mission)
    const ipFindings = findings.filter((f) => f.type === 'ipv4')
    expect(ipFindings).toHaveLength(0)
  })

  it('detects IPv6 addresses', () => {
    const mission = makeMission({
      steps: [makeStep('Address: 2001:0db8:85a3::8a2e:0370:7334')],
    })
    const findings = scanForSensitiveData(mission)
    const ipv6 = findings.filter((f) => f.type === 'ipv6')
    expect(ipv6.length).toBeGreaterThanOrEqual(1)
    expect(ipv6[0].match).toContain('2001')
  })

  it('detects internal hostnames', () => {
    const mission = makeMission({
      steps: [makeStep('SSH to node-1.us-east-1.compute.internal')],
    })
    const findings = scanForSensitiveData(mission)
    const hostFindings = findings.filter((f) => f.type === 'hostname')
    expect(hostFindings.length).toBeGreaterThanOrEqual(1)
    expect(hostFindings[0].match).toBe(
      'node-1.us-east-1.compute.internal'
    )
  })

  it('does not flag common public hostnames', () => {
    const mission = makeMission({
      steps: [makeStep('Visit github.com and kubernetes.io for docs')],
    })
    const findings = scanForSensitiveData(mission)
    const hostFindings = findings.filter((f) => f.type === 'hostname')
    expect(hostFindings).toHaveLength(0)
  })

  it('detects JWT tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    const mission = makeMission({
      steps: [makeStep(`Token: ${jwt}`)],
    })
    const findings = scanForSensitiveData(mission)
    const jwtFindings = findings.filter((f) => f.type === 'jwt')
    expect(jwtFindings.length).toBeGreaterThanOrEqual(1)
    expect(jwtFindings[0].severity).toBe('critical')
  })

  it('detects Bearer tokens', () => {
    const mission = makeMission({
      steps: [
        makeStep(
          'Auth: Bearer ghp_1234567890abcdef1234567890abcdef12345678'
        ),
      ],
    })
    const findings = scanForSensitiveData(mission)
    const bearerFindings = findings.filter((f) => f.type === 'bearer-token')
    expect(bearerFindings.length).toBeGreaterThanOrEqual(1)
  })

  it('detects GitHub PATs', () => {
    const pat = 'ghp_ABCDEFghijklmnop1234567890abcdefghijk'
    const mission = makeMission({
      steps: [makeStep(`Use token ${pat}`)],
    })
    const findings = scanForSensitiveData(mission)
    const patFindings = findings.filter((f) => f.type === 'github-pat')
    expect(patFindings.length).toBeGreaterThanOrEqual(1)
    expect(patFindings[0].severity).toBe('critical')
  })

  it('detects AWS access keys', () => {
    const mission = makeMission({
      steps: [makeStep('Key: AKIAIOSFODNN7EXAMPLE')],
    })
    const findings = scanForSensitiveData(mission)
    const awsFindings = findings.filter((f) => f.type === 'aws-key')
    expect(awsFindings.length).toBeGreaterThanOrEqual(1)
    expect(awsFindings[0].severity).toBe('critical')
    expect(awsFindings[0].match).toBe('AKIAIOSFODNN7EXAMPLE')
  })

  it('detects internal email addresses', () => {
    const mission = makeMission({
      steps: [makeStep('Contact user@company.internal for help')],
    })
    const findings = scanForSensitiveData(mission)
    const emailFindings = findings.filter((f) => f.type === 'email')
    expect(emailFindings.length).toBeGreaterThanOrEqual(1)
    expect(emailFindings[0].severity).toBe('low')
  })

  it('detects PEM certificates', () => {
    const mission = makeMission({
      steps: [
        makeStep('Cert:\n-----BEGIN CERTIFICATE-----\nMIIBxTCCAW...'),
      ],
    })
    const findings = scanForSensitiveData(mission)
    const pemFindings = findings.filter((f) => f.type === 'pem-cert')
    expect(pemFindings.length).toBeGreaterThanOrEqual(1)
    expect(pemFindings[0].severity).toBe('critical')
  })

  it('detects SSH keys', () => {
    const mission = makeMission({
      steps: [
        makeStep(
          'Key: ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEA0Z user@host'
        ),
      ],
    })
    const findings = scanForSensitiveData(mission)
    const sshFindings = findings.filter((f) => f.type === 'ssh-key')
    expect(sshFindings.length).toBeGreaterThanOrEqual(1)
    expect(sshFindings[0].severity).toBe('critical')
  })

  it('detects Kubernetes Secret manifests', () => {
    const yaml = `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
data:
  password: cGFzc3dvcmQ=`
    const mission = makeMission({
      steps: [makeStep('Apply this secret', { yaml })],
    })
    const findings = scanForSensitiveData(mission)
    const k8sFindings = findings.filter((f) => f.type === 'k8s-secret')
    expect(k8sFindings.length).toBeGreaterThanOrEqual(1)
  })

  it('reports correct location paths for step fields', () => {
    const mission = makeMission({
      steps: [
        makeStep('clean step'),
        makeStep('another clean step'),
        makeStep('IP here: 10.20.30.40'),
      ],
    })
    const findings = scanForSensitiveData(mission)
    const ipFindings = findings.filter(
      (f) => f.type === 'ipv4' && f.match === '10.20.30.40'
    )
    expect(ipFindings.length).toBeGreaterThanOrEqual(1)
    expect(ipFindings[0].location).toBe('steps[2].description')
  })

  it('returns no findings for an empty mission', () => {
    const mission = makeMission()
    const findings = scanForSensitiveData(mission)
    expect(findings).toHaveLength(0)
  })

  it('hasCriticalSensitiveFindings returns true for critical findings', () => {
    const mission = makeMission({
      steps: [makeStep('Key: AKIAIOSFODNN7EXAMPLE')],
    })
    const findings = scanForSensitiveData(mission)
    expect(hasCriticalSensitiveFindings(findings)).toBe(true)
  })

  it('hasCriticalSensitiveFindings returns false for only low/medium findings', () => {
    const mission = makeMission({
      steps: [makeStep('IP: 192.168.1.100')],
    })
    const findings = scanForSensitiveData(mission)
    expect(findings.length).toBeGreaterThan(0)
    expect(hasCriticalSensitiveFindings(findings)).toBe(false)
  })

  it('creates separate findings for same IP in multiple steps', () => {
    const mission = makeMission({
      steps: [
        makeStep('First: 10.0.0.5'),
        makeStep('Second: 10.0.0.5'),
      ],
    })
    const findings = scanForSensitiveData(mission)
    const ipFindings = findings.filter(
      (f) => f.type === 'ipv4' && f.match === '10.0.0.5'
    )
    expect(ipFindings).toHaveLength(2)
    expect(ipFindings[0].location).toBe('steps[0].description')
    expect(ipFindings[1].location).toBe('steps[1].description')
  })

  it('detects sensitive data in the description field', () => {
    const mission = makeMission({
      description: 'Server at 172.16.0.50 is down',
    })
    const findings = scanForSensitiveData(mission)
    const ipFindings = findings.filter(
      (f) => f.type === 'ipv4' && f.match === '172.16.0.50'
    )
    expect(ipFindings.length).toBeGreaterThanOrEqual(1)
    expect(ipFindings[0].location).toBe('description')
  })

  it('detects secrets in resolution.yaml field', () => {
    const mission = makeMission({
      resolution: {
        summary: 'Fixed the issue',
        steps: ['Applied fix'],
        yaml: 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: fix\ndata:\n  key: val',
      },
    })
    const findings = scanForSensitiveData(mission)
    const k8sFindings = findings.filter(
      (f) => f.type === 'k8s-secret' && f.location === 'resolution.yaml'
    )
    expect(k8sFindings.length).toBeGreaterThanOrEqual(1)
  })
})
