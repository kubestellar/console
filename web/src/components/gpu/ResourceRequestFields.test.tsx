import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResourceRequestFields } from './ResourceRequestFields'

const t = (key: string, options?: string | Record<string, unknown>) =>
  typeof options === 'object' ? `${key}:${JSON.stringify(options)}` : key

const TYPES = [
  { type: 'A100', total: 8, available: 4 },
  { type: 'H100', total: 4, available: 2 },
]

function renderFields(overrides: Partial<Parameters<typeof ResourceRequestFields>[0]> = {}) {
  const props = {
    t,
    gpuCount: '1',
    setGpuCount: vi.fn(),
    maxGPUs: 8,
    selectedClusterInfo: undefined,
    clusterGPUTypes: [] as typeof TYPES,
    gpuPreferences: [] as string[],
    setGpuPreferences: vi.fn(),
    enforceQuota: false,
    extraResources: [] as Array<{ key: string; value: string }>,
    setExtraResources: vi.fn(),
    gpuKeys: ['nvidia.com/gpu'],
    ...overrides,
  }
  render(<ResourceRequestFields {...props} />)
  return props
}

describe('ResourceRequestFields', () => {
  it('reports GPU count changes', () => {
    const props = renderFields()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    expect(props.setGpuCount).toHaveBeenCalledWith('3')
  })

  it('shows max available GPUs for the selected cluster', () => {
    renderFields({ selectedClusterInfo: { availableGPUs: 5 } })
    expect(screen.getByText(/maxAvailable/)).toBeTruthy()
  })

  it('shows a single GPU type as info only', () => {
    renderFields({ clusterGPUTypes: [TYPES[0]] })
    expect(screen.getByText('A100')).toBeTruthy()
    expect(screen.queryByRole('button', { pressed: false })).toBeNull()
  })

  it('shows the no-preference helper when no type is selected', () => {
    renderFields({ clusterGPUTypes: TYPES })
    expect(screen.getByText('No type selected — any GPU will be accepted.')).toBeTruthy()
  })

  it('summarizes selected GPU types', () => {
    renderFields({ clusterGPUTypes: TYPES, gpuPreferences: ['A100'] })
    expect(screen.getByText('1 type accepted')).toBeTruthy()
  })

  it('summarizes multiple selected GPU types', () => {
    renderFields({ clusterGPUTypes: TYPES, gpuPreferences: ['A100', 'H100'] })
    expect(screen.getByText('2 types accepted')).toBeTruthy()
  })

  it('toggles GPU type preferences on and off', () => {
    const props = renderFields({ clusterGPUTypes: TYPES, gpuPreferences: ['A100'] })
    const a100 = screen.getByRole('button', { name: /A100/ })
    expect(a100.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /H100/ }))
    const add = props.setGpuPreferences.mock.calls[0][0] as (prev: string[]) => string[]
    expect(add(['A100'])).toEqual(['A100', 'H100'])

    fireEvent.click(a100)
    const remove = props.setGpuPreferences.mock.calls[1][0] as (prev: string[]) => string[]
    expect(remove(['A100'])).toEqual([])
  })

  it('hides additional limits when quota is not enforced', () => {
    renderFields()
    expect(screen.queryByText('gpuReservations.form.fields.additionalLimits')).toBeNull()
  })

  it('adds, edits and removes extra resources when quota is enforced', () => {
    const props = renderFields({
      enforceQuota: true,
      extraResources: [{ key: 'pods', value: '10' }],
    })
    fireEvent.click(screen.getByText('gpuReservations.form.fields.add'))
    expect(props.setExtraResources).toHaveBeenCalledWith([
      { key: 'pods', value: '10' },
      { key: '', value: '' },
    ])

    fireEvent.change(screen.getByPlaceholderText('gpuReservations.form.fields.resourcePlaceholder'), {
      target: { value: '20' },
    })
    expect(props.setExtraResources).toHaveBeenLastCalledWith([{ key: 'pods', value: '20' }])

    fireEvent.click(screen.getByLabelText('Remove resource limit'))
    expect(props.setExtraResources).toHaveBeenLastCalledWith([])
  })

  it('excludes GPU resource keys from the extra resource options', () => {
    renderFields({
      enforceQuota: true,
      extraResources: [{ key: '', value: '' }],
      gpuKeys: ['gpu'],
    })
    expect(screen.queryByText('Pods')).toBeTruthy()
    expect(screen.queryByRole('option', { name: /nvidia/i })).toBeNull()
  })
})
