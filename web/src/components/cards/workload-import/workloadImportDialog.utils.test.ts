import { describe, it, expect } from 'vitest'
import { parseYamlDocuments, isValidYaml, resourceToWorkload } from './workloadImportDialog.utils'
import { DEFAULT_REPLICA_COUNT } from './workloadImportDialog.constants'

describe('parseYamlDocuments', () => {
  it('returns an error for empty input', () => {
    const { resources, errors } = parseYamlDocuments('   ')
    expect(resources).toEqual([])
    expect(errors).toEqual(['YAML input is empty'])
  })

  it('parses a single Deployment document', () => {
    const yaml = `
kind: Deployment
metadata:
  name: web
  namespace: prod
spec:
  template:
    spec:
      containers:
        - image: nginx:1.25
`
    const { resources, errors } = parseYamlDocuments(yaml)
    expect(errors).toEqual([])
    expect(resources).toEqual([
      { kind: 'Deployment', name: 'web', namespace: 'prod', image: 'nginx:1.25' },
    ])
  })

  it('parses multiple documents separated by ---', () => {
    const yaml = `
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      containers:
        - image: nginx
---
kind: Job
metadata:
  name: migrate
spec:
  template:
    spec:
      containers:
        - image: migrate:latest
`
    const { resources, errors } = parseYamlDocuments(yaml)
    expect(errors).toEqual([])
    expect(resources.map((r) => r.kind)).toEqual(['Deployment', 'Job'])
  })

  it('reads the CronJob container image through jobTemplate.spec.template.spec', () => {
    const yaml = `
kind: CronJob
metadata:
  name: nightly
spec:
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - image: cron:1
`
    const { resources, errors } = parseYamlDocuments(yaml)
    expect(errors).toEqual([])
    expect(resources).toEqual([
      { kind: 'CronJob', name: 'nightly', namespace: 'default', image: 'cron:1' },
    ])
  })

  it('defaults name/namespace/image when metadata or containers are missing', () => {
    const yaml = `
kind: Deployment
spec: {}
`
    const { resources, errors } = parseYamlDocuments(yaml)
    expect(errors).toEqual([])
    expect(resources).toEqual([
      { kind: 'Deployment', name: 'unnamed', namespace: 'default', image: 'unknown' },
    ])
  })

  it('collects an error for a document missing "kind"', () => {
    const yaml = `
metadata:
  name: web
`
    const { resources, errors } = parseYamlDocuments(yaml)
    expect(resources).toEqual([])
    expect(errors).toEqual(['Document missing "kind" field'])
  })

  it('collects an error for an unsupported kind', () => {
    const yaml = `
kind: Pod
metadata:
  name: standalone
`
    const { resources, errors } = parseYamlDocuments(yaml)
    expect(resources).toEqual([])
    expect(errors[0]).toContain('Unsupported kind "Pod"')
  })

  it('skips non-object documents without throwing', () => {
    const yaml = `
---
null
---
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      containers:
        - image: nginx
`
    const { resources, errors } = parseYamlDocuments(yaml)
    expect(errors).toEqual([])
    expect(resources).toHaveLength(1)
  })

  it('collects a parse error for malformed YAML', () => {
    const { resources, errors } = parseYamlDocuments('kind: [unterminated')
    expect(resources).toEqual([])
    expect(errors[0]).toContain('YAML parse error')
  })
})

describe('isValidYaml', () => {
  it('returns true for well-formed YAML', () => {
    expect(isValidYaml('key: value')).toBe(true)
  })

  it('returns false for malformed YAML', () => {
    expect(isValidYaml('key: [unterminated')).toBe(false)
  })
})

describe('resourceToWorkload', () => {
  it('builds a Workload with sensible defaults from a ParsedResource', () => {
    const workload = resourceToWorkload({
      kind: 'Deployment',
      name: 'web',
      namespace: 'prod',
      image: 'nginx:1.25',
    })

    expect(workload.name).toBe('web')
    expect(workload.namespace).toBe('prod')
    expect(workload.type).toBe('Deployment')
    expect(workload.status).toBe('Pending')
    expect(workload.replicas).toBe(DEFAULT_REPLICA_COUNT)
    expect(workload.readyReplicas).toBe(0)
    expect(workload.image).toBe('nginx:1.25')
    expect(workload.labels).toEqual({ 'app.kubernetes.io/name': 'web' })
    expect(workload.targetClusters).toEqual([])
    expect(workload.deployments).toEqual([])
    expect(typeof workload.createdAt).toBe('string')
    expect(() => new Date(workload.createdAt).toISOString()).not.toThrow()
  })
})
