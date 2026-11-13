import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  ClusterPicker,
  NamespaceField,
  ResourceRequestFields,
  ScheduleSelector,
} from './ReservationFormModal.parts'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const CLUSTERS = [
  { name: 'cluster-a', totalGPUs: 8, allocatedGPUs: 2, availableGPUs: 6, gpuTypes: ['A100'] },
]

const TYPES = [
  { type: 'A100', total: 8, available: 4 },
  { type: 'H100', total: 4, available: 2 },
]

describe('ClusterPicker (form parts)', () => {
  it('calls onClusterChange when a cluster is selected', () => {
    const onClusterChange = vi.fn()
    render(
      <ClusterPicker cluster="" setCluster={vi.fn()} gpuClusters={CLUSTERS} onClusterChange={onClusterChange} />,
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cluster-a' } })
    expect(onClusterChange).toHaveBeenCalledWith('cluster-a')
  })

  it('shows a warning and is disabled when editing with no clusters', () => {
    render(
      <ClusterPicker
        cluster=""
        setCluster={vi.fn()}
        gpuClusters={[]}
        editingReservationCluster="cluster-a"
        onClusterChange={vi.fn()}
      />,
    )
    expect(screen.getByText('gpuReservations.form.fields.noClustersWithGpus')).toBeTruthy()
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
  })
})

describe('NamespaceField', () => {
  function renderField(overrides: Partial<Parameters<typeof NamespaceField>[0]> = {}) {
    const props = {
      namespace: '',
      isNewNamespace: false,
      cluster: 'cluster-a',
      clusterNamespaces: ['default'],
      namespacesLoading: false,
      namespacesError: null,
      onNamespaceChange: vi.fn(),
      onToggleNew: vi.fn(),
      onRetry: vi.fn(),
      ...overrides,
    }
    render(<NamespaceField {...props} />)
    return props
  }

  it('selects an existing namespace', () => {
    const props = renderField()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'default' } })
    expect(props.onNamespaceChange).toHaveBeenCalledWith('default')
  })

  it('toggles to new namespace mode', () => {
    const props = renderField()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__new__' } })
    expect(props.onToggleNew).toHaveBeenCalledWith(true)
  })

  it('is disabled without a cluster', () => {
    renderField({ cluster: '' })
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
  })

  it('sanitizes typed namespace and can go back', () => {
    const props = renderField({ isNewNamespace: true })
    fireEvent.change(screen.getByPlaceholderText('gpuReservations.form.fields.enterNamespace'), {
      target: { value: 'Team_A1' },
    })
    expect(props.onNamespaceChange).toHaveBeenCalledWith('teama1')
    fireEvent.click(screen.getByLabelText('gpuReservations.form.fields.backToList'))
    expect(props.onToggleNew).toHaveBeenCalledWith(false)
  })

  it('shows loading state', () => {
    renderField({ namespacesLoading: true })
    expect(screen.getByText('common:status.loadingNamespaces')).toBeTruthy()
  })

  it('shows the error with a working retry button', () => {
    const props = renderField({ namespacesError: 'failed to load' })
    expect(screen.getByText('failed to load')).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('ResourceRequestFields (form parts)', () => {
  function renderFields(overrides: Partial<Parameters<typeof ResourceRequestFields>[0]> = {}) {
    const props = {
      gpuCount: '1',
      setGpuCount: vi.fn(),
      gpuPreferences: [] as string[],
      setGpuPreferences: vi.fn(),
      clusterGPUTypes: [] as typeof TYPES,
      selectedClusterInfo: undefined,
      maxGPUs: 8,
      extraResources: [] as Array<{ key: string; value: string }>,
      setExtraResources: vi.fn(),
      enforceQuota: false,
      notes: '',
      setNotes: vi.fn(),
      ...overrides,
    }
    render(<ResourceRequestFields {...props} />)
    return props
  }

  it('updates GPU count and notes', () => {
    const props = renderFields()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
    expect(props.setGpuCount).toHaveBeenCalledWith('2')
    fireEvent.change(screen.getByPlaceholderText('gpuReservations.form.fields.notesPlaceholder'), {
      target: { value: 'training run' },
    })
    expect(props.setNotes).toHaveBeenCalledWith('training run')
  })

  it('toggles GPU type preference', () => {
    const props = renderFields({ clusterGPUTypes: TYPES, gpuPreferences: ['A100'] })
    fireEvent.click(screen.getByRole('button', { name: /H100/ }))
    const updater = props.setGpuPreferences.mock.calls[0][0] as (prev: string[]) => string[]
    expect(updater(['A100'])).toEqual(['A100', 'H100'])
    expect(screen.getByText('1 type accepted')).toBeTruthy()
  })

  it('shows the single GPU type as info', () => {
    renderFields({ clusterGPUTypes: [TYPES[0]] })
    expect(screen.getByText('A100')).toBeTruthy()
  })

  it('manages extra resources when quota is enforced', () => {
    const props = renderFields({ enforceQuota: true, extraResources: [{ key: 'pods', value: '5' }] })
    fireEvent.click(screen.getByText('gpuReservations.form.fields.add'))
    expect(props.setExtraResources).toHaveBeenCalledWith([
      { key: 'pods', value: '5' },
      { key: '', value: '' },
    ])
    fireEvent.click(screen.getByLabelText('Remove resource limit'))
    expect(props.setExtraResources).toHaveBeenLastCalledWith([])
  })
})

describe('ScheduleSelector', () => {
  it('reports start date and duration changes', () => {
    const setStartDate = vi.fn()
    const setDurationHours = vi.fn()
    render(
      <ScheduleSelector
        startDate="2026-01-01"
        setStartDate={setStartDate}
        durationHours="24"
        setDurationHours={setDurationHours}
      />,
    )
    fireEvent.change(screen.getByDisplayValue('2026-01-01'), { target: { value: '2026-02-01' } })
    expect(setStartDate).toHaveBeenCalledWith('2026-02-01')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '48' } })
    expect(setDurationHours).toHaveBeenCalledWith('48')
  })
})
