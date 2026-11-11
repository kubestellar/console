import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClusterPicker } from './ClusterPicker'

const t = (key: string, options?: string | Record<string, unknown>) =>
  typeof options === 'object' && options.name ? `${key}:${options.name}` : key

const CLUSTERS = [
  { name: 'cluster-a', totalGPUs: 8, allocatedGPUs: 2, availableGPUs: 6, gpuTypes: ['A100'] },
  { name: 'cluster-b', totalGPUs: 4, allocatedGPUs: 4, availableGPUs: 0, gpuTypes: ['H100'] },
]

function renderPicker(overrides: Partial<Parameters<typeof ClusterPicker>[0]> = {}) {
  const props = {
    t,
    cluster: '',
    setCluster: vi.fn(),
    namespace: '',
    isNewNamespace: false,
    setNsField: vi.fn(),
    setGpuPreferences: vi.fn(),
    gpuClusters: CLUSTERS,
    clusterNamespaces: ['default', 'ml'],
    editingReservation: null,
    namespacesLoading: false,
    namespacesError: null,
    refetchNamespaces: vi.fn(),
    ...overrides,
  }
  render(<ClusterPicker {...props} />)
  return props
}

describe('ClusterPicker', () => {
  it('renders one option per GPU cluster', () => {
    renderPicker()
    expect(screen.getByText('gpuReservations.form.fields.clusterOption:cluster-a')).toBeTruthy()
    expect(screen.getByText('gpuReservations.form.fields.clusterOption:cluster-b')).toBeTruthy()
  })

  it('shows a warning when there are no GPU clusters', () => {
    renderPicker({ gpuClusters: [] })
    expect(screen.getByText('gpuReservations.form.fields.noClustersWithGpus')).toBeTruthy()
  })

  it('resets namespace and GPU preferences when the cluster changes', () => {
    const props = renderPicker()
    const [clusterSelect] = screen.getAllByRole('combobox')
    fireEvent.change(clusterSelect, { target: { value: 'cluster-a' } })
    expect(props.setCluster).toHaveBeenCalledWith('cluster-a')
    expect(props.setNsField).toHaveBeenCalledWith({ value: '', isNew: false })
    expect(props.setGpuPreferences).toHaveBeenCalledWith([])
  })

  it('disables selects while editing a reservation', () => {
    renderPicker({ editingReservation: { id: 'r1' }, cluster: 'cluster-a' })
    const [clusterSelect, nsSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(clusterSelect.disabled).toBe(true)
    expect(nsSelect.disabled).toBe(true)
  })

  it('disables the namespace select until a cluster is chosen', () => {
    renderPicker()
    const [, nsSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(nsSelect.disabled).toBe(true)
  })

  it('updates the namespace through the functional setter', () => {
    const props = renderPicker({ cluster: 'cluster-a' })
    const [, nsSelect] = screen.getAllByRole('combobox')
    fireEvent.change(nsSelect, { target: { value: 'ml' } })
    const updater = props.setNsField.mock.calls[0][0] as (prev: { value: string; isNew: boolean }) => unknown
    expect(updater({ value: '', isNew: false })).toEqual({ value: 'ml', isNew: false })
  })

  it('switches to new-namespace mode when the new option is chosen', () => {
    const props = renderPicker({ cluster: 'cluster-a' })
    const [, nsSelect] = screen.getAllByRole('combobox')
    fireEvent.change(nsSelect, { target: { value: '__new__' } })
    expect(props.setNsField).toHaveBeenCalledWith({ value: '', isNew: true })
  })

  it('sanitizes the new namespace input and can go back to the list', () => {
    const props = renderPicker({ cluster: 'cluster-a', isNewNamespace: true })
    const input = screen.getByPlaceholderText('gpuReservations.form.fields.enterNamespace')
    fireEvent.change(input, { target: { value: 'My_NS!' } })
    const updater = props.setNsField.mock.calls[0][0] as (prev: { value: string; isNew: boolean }) => unknown
    expect(updater({ value: '', isNew: true })).toEqual({ value: 'myns', isNew: true })

    fireEvent.click(screen.getByLabelText('gpuReservations.form.fields.backToList'))
    expect(props.setNsField).toHaveBeenLastCalledWith({ value: '', isNew: false })
  })

  it('shows the loading indicator while namespaces load', () => {
    renderPicker({ cluster: 'cluster-a', namespacesLoading: true })
    expect(screen.getByText('common:status.loadingNamespaces')).toBeTruthy()
  })

  it('shows the error and retries on click', () => {
    const props = renderPicker({ cluster: 'cluster-a', namespacesError: 'boom' })
    expect(screen.getByText('boom')).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(props.refetchNamespaces).toHaveBeenCalledTimes(1)
  })
})
