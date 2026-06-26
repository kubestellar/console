/**
 * Form-interaction tests for ClusterGroupsForms (#15515).
 *
 * Run from web/:  npm run test:cluster-groups-forms
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { ClusterFilter, ClusterGroup } from '../../../hooks/useClusterGroups'
import {
  AIAssistant,
  CreateGroupForm,
  EditGroupForm,
  QueryBuilder,
} from '../ClusterGroupsForms'

const GROUP_NAME = 'edge-clusters'
const LABEL_SELECTOR_VALUE = 'zone=us-east'
const AI_ERROR_MESSAGE = 'Failed to generate query'
const SAMPLE_FILTER: ClusterFilter = { field: 'healthy', operator: 'eq', value: 'true' }
const NAME_INPUT_PLACEHOLDER = 'cards:clusterGroups.groupNamePlaceholder'
const LABEL_SELECTOR_PLACEHOLDER = 'e.g. topology.kubernetes.io/zone in (us-east-1a)'
const AI_PROMPT_PLACEHOLDER = 'e.g. "Healthy clusters with at least 4 CPU cores"'
const DEFAULT_GROUP_COLOR = 'blue'

const AVAILABLE_CLUSTERS = ['cluster-a', 'cluster-b', 'cluster-c']

const mockPreviewQuery = vi.fn()
const mockGenerateAIQuery = vi.fn()

vi.mock('../../../hooks/useClusterGroups', async () => {
  const actual = await vi.importActual<typeof import('../../../hooks/useClusterGroups')>(
    '../../../hooks/useClusterGroups',
  )
  return {
    ...actual,
    useClusterGroups: () => ({
      previewQuery: mockPreviewQuery,
      generateAIQuery: mockGenerateAIQuery,
    }),
  }
})

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    initReactI18next: actual.initReactI18next ?? { type: '3rdParty', init: () => {} },
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        if (options && typeof options.count === 'number') {
          return `${key}:${options.count}`
        }
        return key
      },
      i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
  }
})

function buildHealthMap() {
  return new Map<string, boolean | undefined>([
    ['cluster-a', true],
    ['cluster-b', true],
    ['cluster-c', false],
  ])
}

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

function getNameInput() {
  return screen.getByPlaceholderText(NAME_INPUT_PLACEHOLDER)
}

function getLabelSelectorInput() {
  return screen.getByPlaceholderText(LABEL_SELECTOR_PLACEHOLDER)
}

function getCreateSaveButton(kind: 'static' | 'dynamic' = 'static') {
  return screen.getByRole('button', {
    name:
      kind === 'dynamic'
        ? 'cards:clusterGroups.createDynamicGroup'
        : 'cards:clusterGroups.createGroup',
  })
}

async function switchToDynamicMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'cards:clusterGroups.dynamic' }))
}

describe('ClusterGroupsForms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreviewQuery.mockResolvedValue({ clusters: [] })
    mockGenerateAIQuery.mockResolvedValue({ query: { labelSelector: LABEL_SELECTOR_VALUE } })
  })

  describe('CreateGroupForm', () => {
    function renderCreateForm(overrides?: {
      onSave?: (group: ClusterGroup) => void
      onCancel?: () => void
    }) {
      const onSave = overrides?.onSave ?? vi.fn()
      const onCancel = overrides?.onCancel ?? vi.fn()
      renderWithRouter(
        <CreateGroupForm
          availableClusters={AVAILABLE_CLUSTERS}
          clusterHealthMap={buildHealthMap()}
          onSave={onSave}
          onCancel={onCancel}
        />,
      )
      return { onSave, onCancel }
    }

    it('disables Save when name is empty in static mode', () => {
      renderCreateForm()
      expect(getCreateSaveButton('static')).toBeDisabled()
    })

    it('disables Save when no clusters are selected in static mode', async () => {
      const user = userEvent.setup()
      renderCreateForm()

      await user.type(getNameInput(), GROUP_NAME)

      expect(getCreateSaveButton('static')).toBeDisabled()
    })

    it('calls onSave with static payload when name and cluster are set', async () => {
      const user = userEvent.setup()
      const { onSave } = renderCreateForm()

      await user.type(getNameInput(), GROUP_NAME)
      await user.click(screen.getByRole('button', { name: 'cluster-a' }))
      await user.click(getCreateSaveButton('static'))

      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: GROUP_NAME,
          kind: 'static',
          clusters: ['cluster-a'],
          color: DEFAULT_GROUP_COLOR,
        }),
      )
    })

    it('disables Save in dynamic mode when labelSelector and filters are empty', async () => {
      const user = userEvent.setup()
      renderCreateForm()

      await user.type(getNameInput(), GROUP_NAME)
      await switchToDynamicMode(user)

      expect(getCreateSaveButton('dynamic')).toBeDisabled()
    })

    it('calls onSave with dynamic payload when labelSelector is set', async () => {
      const user = userEvent.setup()
      const { onSave } = renderCreateForm()

      await user.type(getNameInput(), GROUP_NAME)
      await switchToDynamicMode(user)

      const labelInput = getLabelSelectorInput()
      await user.type(labelInput, LABEL_SELECTOR_VALUE)
      await user.click(getCreateSaveButton('dynamic'))

      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: GROUP_NAME,
          kind: 'dynamic',
          color: DEFAULT_GROUP_COLOR,
          query: { labelSelector: LABEL_SELECTOR_VALUE },
        }),
      )
    })

    it('calls onCancel without onSave when cancel button is clicked', async () => {
      const user = userEvent.setup()
      const { onSave, onCancel } = renderCreateForm()

      await user.type(getNameInput(), GROUP_NAME)
      await user.click(screen.getByRole('button', { name: 'cluster-a' }))
      await user.click(screen.getByRole('button', { name: 'common:common.cancel' }))

      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(onSave).not.toHaveBeenCalled()
    })

    it('switches between QueryBuilder and AIAssistant tabs in dynamic mode', async () => {
      const user = userEvent.setup()
      renderCreateForm()

      await switchToDynamicMode(user)

      expect(getLabelSelectorInput()).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'cards:clusterGroups.aiAssistant' }))
      expect(screen.getByPlaceholderText(AI_PROMPT_PLACEHOLDER)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'cards:clusterGroups.queryBuilder' }))
      expect(getLabelSelectorInput()).toBeInTheDocument()
    })
  })

  describe('QueryBuilder', () => {
    it('fires onLabelSelectorChange when label selector input changes', async () => {
      const user = userEvent.setup()
      const onLabelSelectorChange = vi.fn()

      renderWithRouter(
        <QueryBuilder
          labelSelector=""
          onLabelSelectorChange={onLabelSelectorChange}
          filters={[]}
          onAddFilter={vi.fn()}
          onRemoveFilter={vi.fn()}
          onUpdateFilter={vi.fn()}
        />,
      )

      const labelInput = getLabelSelectorInput()
      await user.type(labelInput, 'a')

      expect(onLabelSelectorChange).toHaveBeenCalled()
      expect(onLabelSelectorChange.mock.calls.at(-1)?.[0]).toBe('a')
    })

    it('calls onAddFilter when add button is clicked', async () => {
      const user = userEvent.setup()
      const onAddFilter = vi.fn()

      renderWithRouter(
        <QueryBuilder
          labelSelector=""
          onLabelSelectorChange={vi.fn()}
          filters={[]}
          onAddFilter={onAddFilter}
          onRemoveFilter={vi.fn()}
          onUpdateFilter={vi.fn()}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'common:common.add' }))

      expect(onAddFilter).toHaveBeenCalledTimes(1)
    })

    it('calls onRemoveFilter with index when remove button is clicked', async () => {
      const user = userEvent.setup()
      const onRemoveFilter = vi.fn()

      renderWithRouter(
        <QueryBuilder
          labelSelector=""
          onLabelSelectorChange={vi.fn()}
          filters={[SAMPLE_FILTER]}
          onAddFilter={vi.fn()}
          onRemoveFilter={onRemoveFilter}
          onUpdateFilter={vi.fn()}
        />,
      )

      await user.click(
        screen.getByRole('button', { name: 'cards:clusterGroups.removeFilter' }),
      )

      expect(onRemoveFilter).toHaveBeenCalledWith(0)
    })

    it('shows no-filters message when filters array is empty', () => {
      renderWithRouter(
        <QueryBuilder
          labelSelector=""
          onLabelSelectorChange={vi.fn()}
          filters={[]}
          onAddFilter={vi.fn()}
          onRemoveFilter={vi.fn()}
          onUpdateFilter={vi.fn()}
        />,
      )

      expect(screen.getByText('cards:clusterGroups.noFilters')).toBeInTheDocument()
    })
  })

  describe('AIAssistant', () => {
    it('disables generate button when prompt is empty', () => {
      renderWithRouter(
        <AIAssistant
          prompt=""
          onPromptChange={vi.fn()}
          onGenerate={vi.fn()}
          loading={false}
          error={null}
        />,
      )

      expect(
        screen.getByRole('button', { name: 'cards:clusterGroups.generateQuery' }),
      ).toBeDisabled()
    })

    it('calls onGenerate when prompt is filled and generate is clicked', async () => {
      const user = userEvent.setup()
      const onGenerate = vi.fn()

      renderWithRouter(
        <AIAssistant
          prompt="healthy gpu clusters"
          onPromptChange={vi.fn()}
          onGenerate={onGenerate}
          loading={false}
          error={null}
        />,
      )

      await user.click(
        screen.getByRole('button', { name: 'cards:clusterGroups.generateQuery' }),
      )

      expect(onGenerate).toHaveBeenCalledTimes(1)
    })

    it('renders error message with text-red-400 when error prop is set', () => {
      renderWithRouter(
        <AIAssistant
          prompt=""
          onPromptChange={vi.fn()}
          onGenerate={vi.fn()}
          loading={false}
          error={AI_ERROR_MESSAGE}
        />,
      )

      const errorText = screen.getByText(AI_ERROR_MESSAGE)
      expect(errorText).toHaveClass('text-red-400')
    })
  })

  describe('EditGroupForm', () => {
    const baseGroup: ClusterGroup = {
      name: 'prod-group',
      kind: 'static',
      clusters: ['cluster-a', 'cluster-b'],
      color: 'blue',
    }

    it('pre-populates selected clusters from group prop', () => {
      renderWithRouter(
        <EditGroupForm
          group={baseGroup}
          availableClusters={AVAILABLE_CLUSTERS}
          clusterHealthMap={buildHealthMap()}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />,
      )

      expect(
        screen.getByText(/cards:clusterGroups\.selectClusters \(2 /),
      ).toBeInTheDocument()
    })

    it('calls onSave with remaining clusters after deselecting one', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()

      renderWithRouter(
        <EditGroupForm
          group={baseGroup}
          availableClusters={AVAILABLE_CLUSTERS}
          clusterHealthMap={buildHealthMap()}
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'cluster-a' }))
      await user.click(screen.getByRole('button', { name: 'common:common.save' }))

      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'static',
          clusters: ['cluster-b'],
          color: 'blue',
        }),
      )
    })
  })
})
