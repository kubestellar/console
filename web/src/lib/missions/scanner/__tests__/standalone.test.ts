import { describe, it, expect } from 'vitest'
import { scanMissionFile, formatScanResultAsMarkdown } from '../standalone'

describe('scanMissionFile', () => {
  it('returns parse error for invalid JSON', () => {
    const result = scanMissionFile('not json {{{')
    expect(result.valid).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].code).toBe('PARSE_ERROR')
    expect(result.findings[0].severity).toBe('error')
    expect(result.metadata).toBeNull()
  })

  it('returns schema error for non-object', () => {
    const result = scanMissionFile('"just a string"')
    expect(result.valid).toBe(false)
    expect(result.findings.length).toBeGreaterThan(0)
  })

  it('returns schema error for array', () => {
    const result = scanMissionFile('[1, 2, 3]')
    expect(result.valid).toBe(false)
  })

  it('scans valid mission file successfully', () => {
    const mission = {
      version: '1.0',
      title: 'Deploy Prometheus',
      description: 'Install Prometheus monitoring stack on the cluster',
      type: 'deploy',
      tags: ['monitoring', 'prometheus'],
      steps: [
        { title: 'Add Helm repo', description: 'Add the Prometheus community Helm chart repository', command: 'helm repo add prometheus-community https://prometheus-community.github.io/helm-charts' },
        { title: 'Install chart', description: 'Install the kube-prometheus-stack Helm chart', command: 'helm install prometheus prometheus-community/kube-prometheus-stack' },
      ],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    expect(result.valid).toBe(true)
    expect(result.metadata).not.toBeNull()
    expect(result.metadata?.title).toBe('Deploy Prometheus')
    expect(result.metadata?.type).toBe('deploy')
    expect(result.metadata?.stepCount).toBe(2)
  })

  it('detects short title warning', () => {
    const mission = {
      version: '1.0',
      title: 'Hi',
      description: 'A thorough description of this mission',
      type: 'deploy',
      tags: ['test'],
      steps: [{ title: 'Step 1', description: 'Do something' }],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const shortTitle = result.findings.find(f => f.code === 'SHORT_TITLE')
    expect(shortTitle).toBeDefined()
    expect(shortTitle?.severity).toBe('warning')
  })

  it('detects short description warning', () => {
    const mission = {
      version: '1.0',
      title: 'Deploy Prometheus',
      description: 'Short desc',
      type: 'deploy',
      tags: ['test'],
      steps: [{ title: 'Step 1', description: 'Do something' }],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const shortDesc = result.findings.find(f => f.code === 'SHORT_DESCRIPTION')
    expect(shortDesc).toBeDefined()
  })

  it('detects empty tags warning', () => {
    const mission = {
      version: '1.0',
      title: 'Deploy Prometheus Monitoring',
      description: 'A thorough description of this mission to deploy monitoring',
      type: 'deploy',
      tags: [],
      steps: [{ title: 'Step 1', description: 'Do something' }],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const noTags = result.findings.find(f => f.code === 'NO_TAGS')
    expect(noTags).toBeDefined()
  })

  it('detects destructive command without validation', () => {
    const mission = {
      version: '1.0',
      title: 'Clean up resources from the cluster',
      description: 'Remove deprecated resources from the cluster safely',
      type: 'troubleshoot',
      tags: ['cleanup'],
      steps: [
        { title: 'Delete namespace', description: 'Remove the old namespace', command: 'kubectl delete namespace old-ns' },
      ],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const destructive = result.findings.find(f => f.code === 'DESTRUCTIVE_NO_VALIDATION')
    expect(destructive).toBeDefined()
  })

  it('does not warn about destructive command with validation', () => {
    const mission = {
      version: '1.0',
      title: 'Clean up resources from the cluster',
      description: 'Remove deprecated resources from the cluster safely',
      type: 'troubleshoot',
      tags: ['cleanup'],
      steps: [
        { title: 'Delete namespace', description: 'Remove the old namespace', command: 'kubectl delete namespace old-ns', validation: 'kubectl get ns old-ns' },
      ],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const destructive = result.findings.find(f => f.code === 'DESTRUCTIVE_NO_VALIDATION')
    expect(destructive).toBeUndefined()
  })

  it('detects empty YAML block', () => {
    const mission = {
      version: '1.0',
      title: 'Apply YAML configuration to cluster',
      description: 'Apply the configuration manifest to the target cluster',
      type: 'deploy',
      tags: ['yaml'],
      steps: [
        { title: 'Apply config', description: 'Apply the config', yaml: '  ' },
      ],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const emptyYaml = result.findings.find(f => f.code === 'EMPTY_YAML')
    expect(emptyYaml).toBeDefined()
  })

  it('detects tabs in YAML', () => {
    const mission = {
      version: '1.0',
      title: 'Apply YAML configuration to cluster',
      description: 'Apply the configuration manifest to the target cluster',
      type: 'deploy',
      tags: ['yaml'],
      steps: [
        { title: 'Apply config', description: 'Apply the config', yaml: 'apiVersion: v1\n\tkind: Pod' },
      ],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const tabs = result.findings.find(f => f.code === 'YAML_TABS')
    expect(tabs).toBeDefined()
  })

  it('detects missing resolution summary', () => {
    const mission = {
      version: '1.0',
      title: 'Fix deployment issues in production',
      description: 'Troubleshoot and fix the failing deployment on the production cluster',
      type: 'troubleshoot',
      tags: ['fix'],
      steps: [{ title: 'Step 1', description: 'Do something' }],
      resolution: { steps: ['Restarted the pod'] },
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const noSummary = result.findings.find(f => f.code === 'NO_RESOLUTION_SUMMARY')
    expect(noSummary).toBeDefined()
  })

  it('detects empty resolution steps', () => {
    const mission = {
      version: '1.0',
      title: 'Fix deployment issues in production',
      description: 'Troubleshoot and fix the failing deployment on the production cluster',
      type: 'troubleshoot',
      tags: ['fix'],
      steps: [{ title: 'Step 1', description: 'Do something' }],
      resolution: { summary: 'Fixed it', steps: [] },
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const noSteps = result.findings.find(f => f.code === 'NO_RESOLUTION_STEPS')
    expect(noSteps).toBeDefined()
  })

  it('detects empty prerequisites', () => {
    const mission = {
      version: '1.0',
      title: 'Deploy application to Kubernetes cluster',
      description: 'Deploy the application using Helm charts to the target cluster',
      type: 'deploy',
      tags: ['deploy'],
      prerequisites: ['kubectl installed', '', 'helm installed'],
      steps: [{ title: 'Step 1', description: 'Do something' }],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const emptyPrereq = result.findings.find(f => f.code === 'EMPTY_PREREQUISITE')
    expect(emptyPrereq).toBeDefined()
  })

  it('detects SQL injection patterns as destructive', () => {
    const mission = {
      version: '1.0',
      title: 'Database cleanup and maintenance task',
      description: 'Clean up old data from the database tables that are no longer needed',
      type: 'custom',
      tags: ['db'],
      steps: [
        { title: 'Drop table', description: 'Remove old table', command: 'psql -c "DROP TABLE old_data"' },
      ],
    }
    const result = scanMissionFile(JSON.stringify(mission))
    const destructive = result.findings.find(f => f.code === 'DESTRUCTIVE_NO_VALIDATION')
    expect(destructive).toBeDefined()
  })
})

describe('formatScanResultAsMarkdown', () => {
  it('formats passing scan result', () => {
    const md = formatScanResultAsMarkdown('mission.json', {
      valid: true,
      findings: [],
      metadata: { title: 'Test', type: 'deploy', version: '1.0', stepCount: 2, tagCount: 3 },
    })
    expect(md).toContain('Mission Scan: mission.json')
    expect(md).toContain('Passed')
    expect(md).toContain('No issues found')
    expect(md).toContain('**Title:** Test')
    expect(md).toContain('**Type:** deploy')
    expect(md).toContain('**Version:** 1.0')
  })

  it('formats failing scan result with table', () => {
    const md = formatScanResultAsMarkdown('bad.json', {
      valid: false,
      findings: [
        { severity: 'error', code: 'PARSE_ERROR', message: 'Invalid JSON', path: '' },
        { severity: 'warning', code: 'SHORT_TITLE', message: 'Title too short', path: '.title' },
        { severity: 'info', code: 'NO_TAGS', message: 'No tags', path: '.tags' },
      ],
      metadata: null,
    })
    expect(md).toContain('Failed')
    expect(md).toContain('| Severity | Code | Message | Path |')
    expect(md).toContain('PARSE_ERROR')
    expect(md).toContain('SHORT_TITLE')
    expect(md).toContain('1 error(s)')
    expect(md).toContain('1 warning(s)')
    expect(md).toContain('1 info')
  })

  it('handles null metadata', () => {
    const md = formatScanResultAsMarkdown('test.json', {
      valid: true,
      findings: [],
      metadata: null,
    })
    expect(md).not.toContain('**Title:**')
  })

  it('handles partial metadata', () => {
    const md = formatScanResultAsMarkdown('test.json', {
      valid: true,
      findings: [],
      metadata: { title: 'Partial', type: null, version: null, stepCount: 0, tagCount: 0 },
    })
    expect(md).toContain('**Title:** Partial')
    expect(md).not.toContain('**Type:**')
  })

  it('escapes pipe characters in messages', () => {
    const md = formatScanResultAsMarkdown('test.json', {
      valid: false,
      findings: [
        { severity: 'error', code: 'TEST', message: 'has | pipe', path: 'also | pipe' },
      ],
      metadata: null,
    })
    expect(md).toContain('has \\| pipe')
    expect(md).toContain('also \\| pipe')
  })
})
