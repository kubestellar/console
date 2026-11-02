import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkloadImport } from './useWorkloadImport'

function setup() {
  const onImport = vi.fn()
  const onClose = vi.fn()
  const { result } = renderHook(() => useWorkloadImport({ onImport, onClose }))
  return { result, onImport, onClose }
}

describe('useWorkloadImport', () => {
  it('starts on the yaml tab with empty state', () => {
    const { result } = setup()
    expect(result.current.activeTab).toBe('yaml')
    expect(result.current.importSuccess).toBe(false)
    expect(result.current.yaml.text).toBe('')
    expect(result.current.helm.repoUrl).toBe('')
    expect(result.current.github.url).toBe('')
    expect(result.current.kustomize.url).toBe('')
  })

  it('handleTabChange switches tabs and clears importSuccess', () => {
    const { result } = setup()
    act(() => result.current.yaml.onChange('kind: Deployment\nmetadata:\n  name: a'))
    act(() => result.current.yaml.onImport())
    expect(result.current.importSuccess).toBe(true)

    act(() => result.current.handleTabChange('helm'))
    expect(result.current.activeTab).toBe('helm')
    expect(result.current.importSuccess).toBe(false)
  })

  it('dismissImportSuccess clears the success flag', () => {
    const { result } = setup()
    act(() => result.current.yaml.onChange('kind: Deployment\nmetadata:\n  name: a'))
    act(() => result.current.yaml.onImport())
    expect(result.current.importSuccess).toBe(true)
    act(() => result.current.dismissImportSuccess())
    expect(result.current.importSuccess).toBe(false)
  })

  describe('yaml tab', () => {
    it('onChange resets preview/errors/importSuccess', () => {
      const { result } = setup()
      act(() => result.current.yaml.onChange('bad: ['))
      act(() => result.current.yaml.onPreview())
      expect(result.current.yaml.errors.length).toBeGreaterThan(0)

      act(() => result.current.yaml.onChange('kind: Deployment'))
      expect(result.current.yaml.text).toBe('kind: Deployment')
      expect(result.current.yaml.preview).toEqual([])
      expect(result.current.yaml.errors).toEqual([])
    })

    it('onPreview parses valid YAML into a resource preview', () => {
      const { result } = setup()
      act(() => result.current.yaml.onChange('kind: Deployment\nmetadata:\n  name: web\n  namespace: ns'))
      act(() => result.current.yaml.onPreview())
      expect(result.current.yaml.preview).toHaveLength(1)
      expect(result.current.yaml.preview[0].name).toBe('web')
      expect(result.current.yaml.errors).toEqual([])
    })

    it('onImport sets errors and does not import when parsing fails entirely', () => {
      const { result, onImport } = setup()
      act(() => result.current.yaml.onChange('not: valid: yaml: {{{'))
      act(() => result.current.yaml.onImport())
      expect(onImport).not.toHaveBeenCalled()
      expect(result.current.yaml.errors.length).toBeGreaterThan(0)
      expect(result.current.importSuccess).toBe(false)
    })

    it('onImport converts parsed resources to workloads and calls onImport', () => {
      const { result, onImport } = setup()
      act(() => result.current.yaml.onChange('kind: Deployment\nmetadata:\n  name: web'))
      act(() => result.current.yaml.onImport())
      expect(onImport).toHaveBeenCalledTimes(1)
      const workloads = onImport.mock.calls[0][0]
      expect(workloads).toHaveLength(1)
      expect(workloads[0].name).toBe('web')
      expect(result.current.importSuccess).toBe(true)
    })

    it('onFileUpload reads the selected file and routes its text through onChange', async () => {
      const { result } = setup()
      const file = new File(['kind: Job'], 'job.yaml', { type: 'text/yaml' })
      const event = { target: { files: [file], value: 'job.yaml' } } as unknown as React.ChangeEvent<HTMLInputElement>

      act(() => result.current.yaml.onFileUpload(event))

      await waitFor(() => expect(result.current.yaml.text).toBe('kind: Job'))
      expect(event.target.value).toBe('')
    })

    it('onFileUpload is a no-op when no file is selected', () => {
      const { result } = setup()
      const event = { target: { files: [] } } as unknown as React.ChangeEvent<HTMLInputElement>
      act(() => result.current.yaml.onFileUpload(event))
      expect(result.current.yaml.text).toBe('')
    })
  })

  describe('helm tab', () => {
    it('onFieldChange clears preview/errors/importSuccess', () => {
      const { result } = setup()
      act(() => result.current.helm.setRepoUrl('https://charts.example.com'))
      act(() => result.current.helm.onFieldChange())
      expect(result.current.helm.preview).toBeNull()
      expect(result.current.helm.errors).toEqual([])
    })

    it('onPreview collects a required-field error per missing field', () => {
      const { result } = setup()
      act(() => result.current.helm.onPreview())
      expect(result.current.helm.errors).toEqual([
        'workloadImport.helmRepoRequired',
        'workloadImport.helmChartRequired',
        'workloadImport.helmReleaseRequired',
      ])
      expect(result.current.helm.preview).toBeNull()
    })

    it('onPreview flags invalid values YAML without clobbering other errors', () => {
      const { result } = setup()
      act(() => {
        result.current.helm.setRepoUrl('https://charts.example.com')
        result.current.helm.setChartName('chart')
        result.current.helm.setReleaseName('release')
        result.current.helm.setValues('not: valid: yaml: {{{')
      })
      act(() => result.current.helm.onPreview())
      expect(result.current.helm.errors).toEqual(['workloadImport.helmValuesInvalid'])
      expect(result.current.helm.preview).toBeNull()
    })

    it('onPreview builds a preview once all required fields are present', () => {
      const { result } = setup()
      act(() => {
        result.current.helm.setRepoUrl('https://charts.example.com')
        result.current.helm.setChartName('my-chart')
        result.current.helm.setReleaseName('my-release')
      })
      act(() => result.current.helm.onPreview())
      expect(result.current.helm.errors).toEqual([])
      expect(result.current.helm.preview).toEqual({
        kind: 'Deployment',
        name: 'my-release',
        namespace: 'default',
        image: 'my-chart:latest',
      })
    })

    it('onImport previews first when there is no preview yet, then imports on the next call', () => {
      const { result, onImport } = setup()
      act(() => {
        result.current.helm.setRepoUrl('https://charts.example.com')
        result.current.helm.setChartName('my-chart')
        result.current.helm.setReleaseName('my-release')
      })

      act(() => result.current.helm.onImport())
      expect(onImport).not.toHaveBeenCalled()
      expect(result.current.helm.preview).not.toBeNull()

      act(() => result.current.helm.onImport())
      expect(onImport).toHaveBeenCalledTimes(1)
      const workload = onImport.mock.calls[0][0][0]
      expect(workload.labels['helm.sh/chart']).toBe('my-chart')
      expect(workload.labels['helm.sh/repo']).toBe('https://charts.example.com')
      expect(result.current.importSuccess).toBe(true)
    })
  })

  describe('github tab', () => {
    it('onPreview requires a URL', () => {
      const { result } = setup()
      act(() => result.current.github.onPreview())
      expect(result.current.github.errors).toEqual(['workloadImport.githubUrlRequired'])
      expect(result.current.github.preview).toBeNull()
    })

    it('onPreview derives the repo name from the URL and appends the path suffix', () => {
      const { result } = setup()
      act(() => {
        result.current.github.setUrl('https://github.com/org/my-repo/')
        result.current.github.setPath('k8s/')
      })
      act(() => result.current.github.onPreview())
      expect(result.current.github.errors).toEqual([])
      expect(result.current.github.preview).toEqual({
        kind: 'Deployment',
        name: 'my-repo-manifests',
        namespace: 'default',
        image: 'github:https://github.com/org/my-repo/ (k8s/)',
      })
    })

    it('onPreview falls back to a default name when the URL has no trailing segment', () => {
      const { result } = setup()
      act(() => result.current.github.setUrl('///'))
      act(() => result.current.github.onPreview())
      expect(result.current.github.preview?.name).toBe('github-workload-manifests')
    })

    it('onImport previews first, then imports with source labels on the next call', () => {
      const { result, onImport } = setup()
      act(() => result.current.github.setUrl('https://github.com/org/repo'))

      act(() => result.current.github.onImport())
      expect(onImport).not.toHaveBeenCalled()

      act(() => result.current.github.onImport())
      expect(onImport).toHaveBeenCalledTimes(1)
      const workload = onImport.mock.calls[0][0][0]
      expect(workload.labels['source/type']).toBe('github')
      expect(workload.labels['source/url']).toBe('https://github.com/org/repo')
      expect(result.current.importSuccess).toBe(true)
    })
  })

  describe('kustomize tab', () => {
    it('onPreview requires a URL', () => {
      const { result } = setup()
      act(() => result.current.kustomize.onPreview())
      expect(result.current.kustomize.errors).toEqual(['workloadImport.kustomizeUrlRequired'])
      expect(result.current.kustomize.preview).toBeNull()
    })

    it('onPreview derives the directory name from the URL', () => {
      const { result } = setup()
      act(() => result.current.kustomize.setUrl('https://github.com/org/repo/tree/main/overlays/prod/'))
      act(() => result.current.kustomize.onPreview())
      expect(result.current.kustomize.preview).toEqual({
        kind: 'Deployment',
        name: 'prod-kustomize',
        namespace: 'default',
        image: 'kustomize:https://github.com/org/repo/tree/main/overlays/prod/',
      })
    })

    it('onImport previews first, then imports with source labels on the next call', () => {
      const { result, onImport } = setup()
      act(() => result.current.kustomize.setUrl('https://github.com/org/repo/overlays/prod'))

      act(() => result.current.kustomize.onImport())
      expect(onImport).not.toHaveBeenCalled()

      act(() => result.current.kustomize.onImport())
      expect(onImport).toHaveBeenCalledTimes(1)
      const workload = onImport.mock.calls[0][0][0]
      expect(workload.labels['source/type']).toBe('kustomize')
      expect(workload.labels['source/url']).toBe('https://github.com/org/repo/overlays/prod')
      expect(result.current.importSuccess).toBe(true)
    })
  })

  it('handleClose resets every tab back to its initial state and calls onClose', () => {
    const { result, onClose } = setup()
    act(() => {
      result.current.handleTabChange('helm')
      result.current.yaml.onChange('kind: Deployment')
      result.current.helm.setRepoUrl('https://charts.example.com')
      result.current.helm.setNamespace('custom')
      result.current.github.setUrl('https://github.com/org/repo')
      result.current.kustomize.setUrl('https://github.com/org/repo/overlays')
    })

    act(() => result.current.handleClose())

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(result.current.activeTab).toBe('yaml')
    expect(result.current.importSuccess).toBe(false)
    expect(result.current.yaml.text).toBe('')
    expect(result.current.helm.repoUrl).toBe('')
    expect(result.current.helm.namespace).toBe('default')
    expect(result.current.github.url).toBe('')
    expect(result.current.kustomize.url).toBe('')
  })
})
