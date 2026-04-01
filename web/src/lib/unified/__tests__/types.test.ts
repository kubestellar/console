/**
 * Tests for unified/types.ts
 *
 * types.ts is type-only at runtime (no runtime validators or guards).
 * These tests verify the type exports are accessible and that the
 * discriminated unions are correctly structured for runtime usage.
 */
import { describe, it, expect } from 'vitest'
import type {
  UnifiedCardConfig,
  CardDataSource,
  CardDataSourceHook,
  CardDataSourceApi,
  CardDataSourceStatic,
  CardDataSourceContext,
  CardContent,
  CardContentList,
  CardContentTable,
  CardContentChart,
  CardContentStatusGrid,
  CardContentCustom,
  CardContentStatsGrid,
  CardColumnConfig,
  CardRenderer,
  CardWidth,
  UnifiedStatBlockConfig,
  StatValueSource,
  StatValueSourceField,
  StatValueSourceComputed,
  StatValueSourceHook,
  StatValueSourceAggregate,
  UnifiedDashboardConfig,
  DashboardCardPlacement,
  DashboardFeatures,
  DataHookFunction,
  RendererFunction,
  CardConfigRegistry,
  StatsConfigRegistry,
  DashboardConfigRegistry,
  DataHookRegistry,
  RendererRegistry,
  CardFilterConfig,
  CardFilterOption,
  CardEmptyStateConfig,
  CardLoadingStateConfig,
  CardFooterConfig,
  CardDrillDownConfig,
} from '../types'

describe('Unified types - structural verification', () => {
  describe('CardDataSource discriminated union', () => {
    it('can create a hook data source', () => {
      const source: CardDataSourceHook = {
        type: 'hook',
        hook: 'useClusters',
        params: { cluster: 'prod' },
      }
      expect(source.type).toBe('hook')
      expect(source.hook).toBe('useClusters')
    })

    it('can create an API data source', () => {
      const source: CardDataSourceApi = {
        type: 'api',
        endpoint: '/api/pods',
        method: 'GET',
        params: { ns: 'default' },
        pollInterval: 30000,
      }
      expect(source.type).toBe('api')
      expect(source.endpoint).toBe('/api/pods')
    })

    it('can create a static data source', () => {
      const source: CardDataSourceStatic = {
        type: 'static',
        data: [{ name: 'test' }],
      }
      expect(source.type).toBe('static')
      expect(source.data).toHaveLength(1)
    })

    it('can create a static data source without data', () => {
      const source: CardDataSourceStatic = {
        type: 'static',
      }
      expect(source.type).toBe('static')
      expect(source.data).toBeUndefined()
    })

    it('can create a context data source', () => {
      const source: CardDataSourceContext = {
        type: 'context',
        contextKey: 'clusters',
      }
      expect(source.type).toBe('context')
    })

    it('discriminates union by type field at runtime', () => {
      const sources: CardDataSource[] = [
        { type: 'hook', hook: 'useClusters' },
        { type: 'api', endpoint: '/api/pods' },
        { type: 'static', data: [] },
        { type: 'context', contextKey: 'data' },
      ]
      expect(sources.map(s => s.type)).toEqual(['hook', 'api', 'static', 'context'])
    })
  })

  describe('CardContent discriminated union', () => {
    it('can create list content', () => {
      const content: CardContentList = {
        type: 'list',
        columns: [{ field: 'name', header: 'Name' }],
        itemClick: 'drill',
        pageSize: 10,
      }
      expect(content.type).toBe('list')
      expect(content.columns).toHaveLength(1)
    })

    it('can create table content', () => {
      const content: CardContentTable = {
        type: 'table',
        columns: [{ field: 'id' }],
        sortable: true,
        defaultSort: 'id',
        defaultDirection: 'asc',
      }
      expect(content.type).toBe('table')
    })

    it('can create chart content', () => {
      const content: CardContentChart = {
        type: 'chart',
        chartType: 'line',
        series: [{ field: 'cpu', label: 'CPU', color: '#ff0' }],
        showLegend: true,
        height: 200,
      }
      expect(content.type).toBe('chart')
      expect(content.chartType).toBe('line')
    })

    it('supports all chart types', () => {
      const chartTypes: CardContentChart['chartType'][] = [
        'line', 'bar', 'donut', 'gauge', 'sparkline', 'area'
      ]
      for (const ct of chartTypes) {
        const content: CardContentChart = { type: 'chart', chartType: ct }
        expect(content.chartType).toBe(ct)
      }
    })

    it('can create status-grid content', () => {
      const content: CardContentStatusGrid = {
        type: 'status-grid',
        items: [{
          id: 'healthy',
          label: 'Healthy',
          icon: 'CheckCircle',
          color: 'green',
          valueSource: { type: 'field', path: 'summary.healthy' },
        }],
        columns: 3,
        showCounts: true,
      }
      expect(content.type).toBe('status-grid')
    })

    it('can create stats-grid content', () => {
      const content: CardContentStatsGrid = {
        type: 'stats-grid',
        stats: [{ field: 'total', label: 'Total', format: 'number' }],
        columns: 2,
      }
      expect(content.type).toBe('stats-grid')
    })

    it('can create custom content', () => {
      const content: CardContentCustom = {
        type: 'custom',
        componentName: 'MyComponent',
        props: { showHeader: true },
      }
      expect(content.type).toBe('custom')
    })
  })

  describe('StatValueSource discriminated union', () => {
    it('field source', () => {
      const src: StatValueSourceField = { type: 'field', path: 'data.count' }
      expect(src.type).toBe('field')
    })

    it('computed source', () => {
      const src: StatValueSourceComputed = { type: 'computed', expression: 'filter:healthy|count' }
      expect(src.type).toBe('computed')
    })

    it('hook source', () => {
      const src: StatValueSourceHook = { type: 'hook', hookName: 'useClusters', field: 'length' }
      expect(src.type).toBe('hook')
    })

    it('aggregate source', () => {
      const src: StatValueSourceAggregate = {
        type: 'aggregate',
        aggregation: 'sum',
        field: 'pods',
        filter: 'healthy:true',
      }
      expect(src.type).toBe('aggregate')
      expect(src.aggregation).toBe('sum')
    })

    it('supports all aggregation types', () => {
      const aggs: StatValueSourceAggregate['aggregation'][] = ['sum', 'count', 'avg', 'min', 'max']
      for (const agg of aggs) {
        const src: StatValueSourceAggregate = { type: 'aggregate', aggregation: agg, field: 'x' }
        expect(src.aggregation).toBe(agg)
      }
    })
  })

  describe('UnifiedCardConfig', () => {
    it('can construct a complete config', () => {
      const config: UnifiedCardConfig = {
        type: 'test_card',
        title: 'Test Card',
        category: 'cluster',
        description: 'A test card',
        icon: 'Activity',
        iconColor: 'text-green-400',
        defaultWidth: 6,
        defaultHeight: 3,
        dataSource: { type: 'hook', hook: 'useClusters' },
        content: { type: 'list', columns: [{ field: 'name' }] },
        emptyState: { icon: 'Inbox', title: 'No data', variant: 'info' },
        loadingState: { rows: 3, type: 'list' },
        isDemoData: false,
        isLive: true,
        projects: ['kubestellar'],
      }
      expect(config.type).toBe('test_card')
      expect(config.projects).toContain('kubestellar')
    })
  })

  describe('DashboardFeatures', () => {
    it('all features can be toggled independently', () => {
      const features: DashboardFeatures = {
        dragDrop: true,
        autoRefresh: true,
        autoRefreshInterval: 30000,
        addCard: true,
        templates: true,
        recommendations: false,
        missionSuggestions: false,
        floatingActions: true,
        cardSections: false,
      }
      expect(features.dragDrop).toBe(true)
      expect(features.recommendations).toBe(false)
    })
  })

  describe('Registry types', () => {
    it('CardConfigRegistry is a string-keyed record', () => {
      const registry: CardConfigRegistry = {}
      expect(typeof registry).toBe('object')
    })

    it('DataHookRegistry is a string-keyed record of functions', () => {
      const registry: DataHookRegistry = {
        useClusters: () => ({ data: [], isLoading: false, error: null }),
      }
      expect(typeof registry.useClusters).toBe('function')
    })

    it('DashboardConfigRegistry is a string-keyed record', () => {
      const registry: DashboardConfigRegistry = {}
      expect(typeof registry).toBe('object')
    })
  })

  describe('CardWidth type', () => {
    it('valid widths match 12-column grid fractions', () => {
      const validWidths: CardWidth[] = [3, 4, 5, 6, 8, 12]
      for (const w of validWidths) {
        expect(typeof w).toBe('number')
        expect(w).toBeGreaterThanOrEqual(3)
        expect(w).toBeLessThanOrEqual(12)
      }
    })
  })

  describe('CardFilterConfig', () => {
    it('supports all filter types', () => {
      const types: CardFilterConfig['type'][] = [
        'text', 'select', 'multi-select', 'cluster-select', 'chips', 'toggle'
      ]
      for (const t of types) {
        const filter: CardFilterConfig = { field: 'status', type: t }
        expect(filter.type).toBe(t)
      }
    })
  })

  describe('CardEmptyStateConfig variants', () => {
    it('supports all variants', () => {
      const variants: CardEmptyStateConfig['variant'][] = ['success', 'info', 'warning', 'neutral']
      for (const v of variants) {
        const config: CardEmptyStateConfig = { icon: 'Inbox', title: 'No data', variant: v }
        expect(config.variant).toBe(v)
      }
    })
  })
})
