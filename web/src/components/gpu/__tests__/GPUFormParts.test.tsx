import React, { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClusterPicker } from '../ClusterPicker'
import { ResourceRequestFields } from '../ResourceRequestFields'
import { ClusterPicker as ModalClusterPicker, NamespaceField, ResourceRequestFields as ModalResourceFields } from '../ReservationFormModal.parts'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../../hooks/useMCP', () => ({
  COMMON_RESOURCE_TYPES: [
    { key: 'cpu', label: 'CPU' },
    { key: 'memory', label: 'Memory' },
    { key: 'nvidia.com/gpu', label: 'GPU' },
  ],
}))

const t = (key: string) => key
const cluster = { name: 'alpha', totalGPUs: 8, allocatedGPUs: 2, availableGPUs: 6, gpuTypes: ['A100', 'H100'] }
const types = [{ type: 'A100', total: 4, available: 3 }, { type: 'H100', total: 4, available: 3 }]

function PickerHarness({ loading = false, error = null, editing = false, retry = vi.fn() }: { loading?: boolean; error?: string | null; editing?: boolean; retry?: () => void }) {
  const [selected, setSelected] = useState('alpha')
  const [ns, setNs] = useState({ value: 'production', isNew: false })
  const [prefs, setPrefs] = useState(['A100'])
  return <>
    <ClusterPicker t={t} cluster={selected} setCluster={setSelected} namespace={ns.value} isNewNamespace={ns.isNew}
      setNsField={setNs} setGpuPreferences={setPrefs} gpuClusters={[cluster, { ...cluster, name: 'beta' }]}
      clusterNamespaces={['production']} editingReservation={editing} namespacesLoading={loading} namespacesError={error} refetchNamespaces={retry} />
    <output data-testid="picker-state">{selected}|{ns.value}|{prefs.join(',')}</output>
  </>
}

describe('ClusterPicker', () => {
  it('clears namespace and GPU preferences when changing cluster', () => {
    render(<PickerHarness />)
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'beta' } })
    expect(screen.getByTestId('picker-state')).toHaveTextContent('beta||')
  })

  it('switches between existing and sanitized new namespace', () => {
    render(<PickerHarness />)
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '__new_bottom__' } })
    const input = screen.getByPlaceholderText('gpuReservations.form.fields.enterNamespace')
    fireEvent.change(input, { target: { value: 'My_App-123!' } })
    expect(input).toHaveValue('myapp-123')
    fireEvent.click(screen.getByRole('button', { name: 'gpuReservations.form.fields.backToList' }))
    expect(screen.getAllByRole('combobox')[1]).toHaveValue('')
  })

  it('shows retry on namespace failure and locks selection while editing', () => {
    const retry = vi.fn()
    const { rerender } = render(<PickerHarness error="Network failed" retry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
    rerender(<PickerHarness loading editing error="Network failed" retry={retry} />)
    expect(screen.getByText('common:status.loadingNamespaces')).toBeInTheDocument()
    expect(screen.queryByText('Network failed')).not.toBeInTheDocument()
    screen.getAllByRole('combobox').forEach(select => expect(select).toBeDisabled())
  })
})

function ResourceHarness({ modal = false, quota = true, gpuTypes = types }: { modal?: boolean; quota?: boolean; gpuTypes?: typeof types }) {
  const [count, setCount] = useState('1')
  const [prefs, setPrefs] = useState<string[]>([])
  const [resources, setResources] = useState<Array<{ key: string; value: string }>>([])
  const [notes, setNotes] = useState('')
  const common = { gpuCount: count, setGpuCount: setCount, maxGPUs: 6, selectedClusterInfo: cluster,
    clusterGPUTypes: gpuTypes, gpuPreferences: prefs, setGpuPreferences: setPrefs,
    enforceQuota: quota, extraResources: resources, setExtraResources: setResources }
  return <>{modal ? <ModalResourceFields {...common} notes={notes} setNotes={setNotes} /> :
    <ResourceRequestFields {...common} t={t} gpuKeys={['nvidia.com/gpu']} />}</>
}

describe.each([['standalone', false], ['modal parts', true]] as const)('%s resource fields', (_name, modal) => {
  it('toggles multiple GPU preferences and updates count', () => {
    render(<ResourceHarness modal={modal} />)
    const count = screen.getByRole('spinbutton')
    expect(count).toHaveAttribute('max', '6')
    fireEvent.change(count, { target: { value: '3' } })
    expect(count).toHaveValue(3)
    const a = screen.getByRole('button', { name: /A100/ })
    const h = screen.getByRole('button', { name: /H100/ })
    expect(screen.getByText('No type selected — any GPU will be accepted.')).toBeInTheDocument()
    fireEvent.click(a)
    expect(a).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 type accepted')).toBeInTheDocument()
    fireEvent.click(h)
    expect(screen.getByText('2 types accepted')).toBeInTheDocument()
    fireEvent.click(a)
    expect(a).toHaveAttribute('aria-pressed', 'false')
    expect(h).toHaveAttribute('aria-pressed', 'true')
  })

  it('adds, edits and removes a non-GPU resource limit', () => {
    render(<ResourceHarness modal={modal} />)
    fireEvent.click(screen.getByRole('button', { name: 'gpuReservations.form.fields.add' }))
    const select = screen.getByRole('combobox')
    expect(screen.queryByRole('option', { name: 'GPU' })).not.toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'cpu' } })
    fireEvent.change(screen.getByPlaceholderText('gpuReservations.form.fields.resourcePlaceholder'), { target: { value: '4' } })
    expect(select).toHaveValue('cpu')
    expect(screen.getByPlaceholderText('gpuReservations.form.fields.resourcePlaceholder')).toHaveValue('4')
    fireEvent.click(screen.getByRole('button', { name: 'Remove resource limit' }))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows a single GPU type as information and hides limits without quota', () => {
    render(<ResourceHarness modal={modal} quota={false} gpuTypes={[types[0]]} />)
    expect(screen.getByText('A100')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /A100/ })).not.toBeInTheDocument()
    expect(screen.queryByText('gpuReservations.form.fields.additionalLimits')).not.toBeInTheDocument()
  })
})

describe('ReservationFormModal parts', () => {
  it('selects a cluster and disables selection during editing', () => {
    const onClusterChange = vi.fn()
    const props = { cluster: '', setCluster: vi.fn(), gpuClusters: [cluster], onClusterChange }
    const { rerender } = render(<ModalClusterPicker {...props} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'alpha' } })
    expect(onClusterChange).toHaveBeenCalledWith('alpha')
    rerender(<ModalClusterPicker {...props} editingReservationCluster="alpha" />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('handles namespace selection, creation, loading and retry', () => {
    const onNamespaceChange = vi.fn(), onToggleNew = vi.fn(), onRetry = vi.fn()
    const props = { namespace: '', isNewNamespace: false, cluster: 'alpha', clusterNamespaces: ['production'], namespacesLoading: false, namespacesError: 'Failed', onNamespaceChange, onToggleNew, onRetry }
    const { rerender } = render(<NamespaceField {...props} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'production' } })
    expect(onNamespaceChange).toHaveBeenCalledWith('production')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__new__' } })
    expect(onToggleNew).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
    rerender(<NamespaceField {...props} isNewNamespace />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My_NS-1!' } })
    expect(onNamespaceChange).toHaveBeenLastCalledWith('myns-1')
    fireEvent.click(screen.getByRole('button', { name: 'gpuReservations.form.fields.backToList' }))
    expect(onToggleNew).toHaveBeenLastCalledWith(false)
    rerender(<NamespaceField {...props} clusterNamespaces={[]} namespacesLoading />)
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

})
