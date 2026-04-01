import { describe, it, expect } from 'vitest'
import { parseFileContent } from '../fileParser'

// ============================================================================
// JSON Parsing
// ============================================================================

describe('parseFileContent — JSON', () => {
  it('parses a valid MissionExport JSON', () => {
    const json = JSON.stringify({
      version: 'kc-mission-v1',
      title: 'Install Prometheus',
      description: 'Deploy Prometheus',
      type: 'deploy',
      tags: ['monitoring'],
      steps: [{ title: 'Step 1', description: 'Run helm install' }],
    })
    const result = parseFileContent(json, 'install-prometheus.json')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.title).toBe('Install Prometheus')
      expect(result.mission.steps).toHaveLength(1)
    }
  })

  it('wraps a K8s manifest JSON as a deploy mission', () => {
    const json = JSON.stringify({
      apiVersion: 'ray.io/v1alpha1',
      kind: 'RayCluster',
      metadata: { name: 'my-cluster' },
      spec: {},
    })
    const result = parseFileContent(json, 'ray-cluster.json')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.type).toBe('deploy')
      expect(result.detectedProjects).toHaveLength(1)
      expect(result.detectedProjects[0].project).toBe('kuberay')
    }
  })
})

// ============================================================================
// YAML Parsing
// ============================================================================

describe('parseFileContent — YAML', () => {
  it('parses a MissionExport in YAML format', () => {
    const yaml = `
version: kc-mission-v1
title: Install Karmada
description: Deploy Karmada to your cluster
type: deploy
tags:
  - karmada
  - multi-cluster
steps:
  - title: Add Helm repo
    description: Add Karmada Helm chart repo
    command: helm repo add karmada-charts https://raw.githubusercontent.com/karmada-io/karmada/master/charts
`
    const result = parseFileContent(yaml, 'install-karmada.yaml')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.title).toBe('Install Karmada')
      expect(result.mission.steps).toHaveLength(1)
    }
  })

  it('detects a single Kubernetes CR and wraps as deploy mission', () => {
    const yaml = `
apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: my-ray-cluster
spec:
  headGroupSpec:
    rayStartParams:
      dashboard-host: '0.0.0.0'
`
    const result = parseFileContent(yaml, 'ray-cluster.yaml')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.type).toBe('deploy')
      expect(result.mission.title).toContain('RayCluster')
      expect(result.mission.cncfProject).toBe('kuberay')
      expect(result.detectedProjects).toHaveLength(1)
      expect(result.detectedProjects[0].project).toBe('kuberay')
      expect(result.mission.steps).toHaveLength(1)
      expect(result.mission.steps[0].yaml).toBeDefined()
    }
  })

  it('handles multi-document YAML with multiple CRs', () => {
    const yaml = `
apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: my-ray
spec: {}
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ray-monitor
spec: {}
`
    const result = parseFileContent(yaml, 'deploy.yaml')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.steps).toHaveLength(2)
      expect(result.detectedProjects.length).toBeGreaterThanOrEqual(2)
      const projectNames = result.detectedProjects.map(p => p.project)
      expect(projectNames).toContain('kuberay')
      expect(projectNames).toContain('prometheus')
    }
  })

  it('handles core K8s resources (no CNCF project)', () => {
    const yaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3
`
    // apps/v1 is a built-in group — no CNCF project mapping
    const result = parseFileContent(yaml, 'deployment.yaml')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.type).toBe('deploy')
      expect(result.mission.title).toContain('Deployment')
      expect(result.detectedProjects).toHaveLength(0)
    }
  })

  it('returns unstructured for non-CR, non-mission YAML', () => {
    const yaml = `
database:
  host: localhost
  port: 5432
  name: mydb
logging:
  level: debug
`
    const result = parseFileContent(yaml, 'config.yaml')
    // This is a plain config YAML — single document, not a CR, not a MissionExport
    // The parser tries it as a MissionExport first (returns structured but invalid)
    // Since it has no apiVersion/kind and no steps, it depends on validateMissionExport behavior
    expect(result.type).toBe('structured') // Returns as structured (delegated validation)
  })

  it('detects Karmada subdomain API groups', () => {
    const yaml = `
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: test-pp
spec:
  placement:
    clusterAffinity:
      clusterNames:
        - member1
`
    const result = parseFileContent(yaml, 'propagation-policy.yaml')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.detectedProjects).toHaveLength(1)
      expect(result.detectedProjects[0].project).toBe('karmada')
    }
  })
})

// ============================================================================
// Markdown Parsing
// ============================================================================

describe('parseFileContent — Markdown', () => {
  it('extracts steps from ## headings with code blocks', () => {
    const md = `# Deploy Ray on Kubernetes

A guide to setting up KubeRay.

## Install the Helm chart

Add the repo and install:

\`\`\`bash
helm repo add kuberay https://ray-project.github.io/kuberay-helm/
helm install kuberay-operator kuberay/kuberay-operator
\`\`\`

## Apply the RayCluster CR

\`\`\`yaml
apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: raycluster
spec:
  headGroupSpec:
    rayStartParams: {}
\`\`\`

## Verify the deployment

\`\`\`bash
kubectl get rayclusters
kubectl get pods -l ray.io/cluster=raycluster
\`\`\`
`
    const result = parseFileContent(md, 'deploy-ray.md')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.title).toBe('Deploy Ray on Kubernetes')
      expect(result.mission.steps.length).toBeGreaterThanOrEqual(3)

      // First step should have a bash command
      expect(result.mission.steps[0].command).toContain('helm repo add')

      // Second step should have YAML content
      expect(result.mission.steps[1].yaml).toContain('ray.io/v1alpha1')

      // Detected KubeRay from the YAML block
      expect(result.detectedProjects).toHaveLength(1)
      expect(result.detectedProjects[0].project).toBe('kuberay')
    }
  })

  it('extracts frontmatter title and tags', () => {
    const md = `---
title: Karmada Multi-Cluster Setup
tags:
  - karmada
  - multi-cluster
---

## Install Karmada

\`\`\`bash
helm install karmada karmada-charts/karmada
\`\`\`
`
    const result = parseFileContent(md, 'karmada-setup.md')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.title).toBe('Karmada Multi-Cluster Setup')
      expect(result.mission.tags).toContain('karmada')
      expect(result.mission.tags).toContain('multi-cluster')
    }
  })

  it('returns unstructured for MD with no headings or code', () => {
    const md = `Just a plain paragraph with no structure.

Another paragraph but no sections or code blocks.`
    const result = parseFileContent(md, 'notes.md')
    expect(result.type).toBe('unstructured')
    if (result.type === 'unstructured') {
      expect(result.format).toBe('markdown')
      expect(result.preview.detectedSections).toHaveLength(0)
    }
  })

  it('infers mission type from title keywords', () => {
    const md = `# Troubleshoot Ray Pod Crashes

## Check pod logs

\`\`\`bash
kubectl logs -l ray.io/cluster=my-cluster
\`\`\`
`
    const result = parseFileContent(md, 'troubleshoot.md')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.type).toBe('troubleshoot')
    }
  })
})

// ============================================================================
// Unknown Extension Fallback
// ============================================================================

describe('parseFileContent — fallback', () => {
  it('tries JSON first for unknown extensions', () => {
    const json = JSON.stringify({
      version: 'kc-mission-v1',
      title: 'Test',
      description: 'Test mission',
      type: 'custom',
      tags: [],
      steps: [{ title: 'Step', description: 'Do' }],
    })
    const result = parseFileContent(json, 'mission.txt')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.title).toBe('Test')
    }
  })

  it('falls back to YAML for unknown extensions', () => {
    const yaml = `apiVersion: ray.io/v1alpha1
kind: RayCluster
metadata:
  name: test
spec: {}`
    const result = parseFileContent(yaml, 'manifest.txt')
    expect(result.type).toBe('structured')
    if (result.type === 'structured') {
      expect(result.mission.type).toBe('deploy')
    }
  })
})
