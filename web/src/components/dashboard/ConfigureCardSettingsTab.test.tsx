import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TFunction } from 'i18next'
import { ConfigureCardSettingsTab } from './ConfigureCardSettingsTab'
import type { CardConfigField } from './cardConfigData'
import type { ClusterInfo } from '../../hooks/mcp/types'

const translations: Record<string, string> = {
  'dashboard.configure.cardTitle': 'Card Title',
  'dashboard.configure.cardTitlePlaceholder': 'Enter a title',
  'dashboard.configure.noSettings': 'No settings available for this card',
  'cardConfig.allClusters': 'All clusters',
  'cardConfig.default': 'Default',
}

const t = ((key: string) => translations[key] ?? key) as TFunction

const clusters = [{ name: 'cluster-a' }, { name: 'cluster-b' }] as ClusterInfo[]

describe('ConfigureCardSettingsTab Component', () => {
  it('renders the title input with the current value', () => {
    render(
      <ConfigureCardSettingsTab
        title="My Card"
        fields={[]}
        config={{}}
        clusters={clusters}
        t={t}
        onTitleChange={vi.fn()}
        updateConfig={vi.fn()}
      />,
    )

    expect(screen.getByPlaceholderText('Enter a title')).toHaveValue('My Card')
  })

  it('calls onTitleChange when the title input changes', () => {
    const onTitleChange = vi.fn()
    render(
      <ConfigureCardSettingsTab
        title=""
        fields={[]}
        config={{}}
        clusters={clusters}
        t={t}
        onTitleChange={onTitleChange}
        updateConfig={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Enter a title'), { target: { value: 'New Title' } })
    expect(onTitleChange).toHaveBeenCalledWith('New Title')
  })

  it('shows the empty state message when there are no fields', () => {
    render(
      <ConfigureCardSettingsTab
        title=""
        fields={[]}
        config={{}}
        clusters={clusters}
        t={t}
        onTitleChange={vi.fn()}
        updateConfig={vi.fn()}
      />,
    )

    expect(screen.getByText('No settings available for this card')).toBeVisible()
  })

  it('renders a cluster select populated with the provided clusters', () => {
    const fields: CardConfigField[] = [{ key: 'cluster', label: 'Cluster', type: 'cluster' }]
    render(
      <ConfigureCardSettingsTab
        title=""
        fields={fields}
        config={{}}
        clusters={clusters}
        t={t}
        onTitleChange={vi.fn()}
        updateConfig={vi.fn()}
      />,
    )

    expect(screen.getByText('All clusters')).toBeVisible()
    expect(screen.getByText('cluster-a')).toBeVisible()
    expect(screen.getByText('cluster-b')).toBeVisible()
  })

  it('calls updateConfig with a parsed number for number fields', () => {
    const updateConfig = vi.fn()
    const fields: CardConfigField[] = [{ key: 'limit', label: 'Limit', type: 'number' }]
    render(
      <ConfigureCardSettingsTab
        title=""
        fields={fields}
        config={{}}
        clusters={clusters}
        t={t}
        onTitleChange={vi.fn()}
        updateConfig={updateConfig}
      />,
    )

    const numberInput = screen.getByPlaceholderText('dashboard.configure.defaultPlaceholder')
    fireEvent.change(numberInput, { target: { value: '5' } })
    expect(updateConfig).toHaveBeenCalledWith('limit', 5)
  })
})
