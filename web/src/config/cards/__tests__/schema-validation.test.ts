/**
 * Card Configuration Schema Validation Tests
 *
 * Validates that all card configurations in web/src/config/cards conform to
 * the expected UnifiedCardConfig schema and required structure.
 *
 * Fixes #19647
 */

import { describe, it, expect } from 'vitest'
import { CARD_CONFIGS } from '../index'
import type {
  CardDataSourceHook,
  CardDataSourceApi,
  CardDataSourceStatic,
  CardDataSourceContext,
  CardContentList,
  CardContentTable,
  CardContentChart,
  CardContentCustom,
  CardContentStatusGrid,
  CardContentStatsGrid,
} from '../../../lib/unified/types'

/** Minimum number of card configs expected */
const MIN_CARD_COUNT = 150

/** Valid card categories */
const VALID_CATEGORIES = [
  'ai-ml',
  'alerting',
  'alerts',
  'ci-cd',
  'cluster-health',
  'compute',
  'cost',
  'drasi',
  'events',
  'games',
  'gitops',
  'insights',
  'live-trends',
  'maturity',
  'namespaces',
  'network',
  'operators',
  'runtime',
  'security',
  'storage',
  'utility',
  'workloads',
] as const

/** Valid card widths */
const VALID_WIDTHS = [3, 4, 5, 6, 8, 12] as const

/** Valid data source types */
const VALID_DATA_SOURCE_TYPES = ['hook', 'api', 'static', 'context'] as const

/** Valid content types */
const VALID_CONTENT_TYPES = [
  'list',
  'table',
  'chart',
  'status-grid',
  'stats-grid',
  'custom',
] as const

/** Valid renderer types */
const VALID_RENDERERS = [
  'text',
  'number',
  'percentage',
  'bytes',
  'duration',
  'date',
  'datetime',
  'relative-time',
  'status-badge',
  'cluster-badge',
  'namespace-badge',
  'progress-bar',
  'icon',
  'boolean',
  'json',
  'truncate',
  'link',
] as const

describe('CARD_CONFIGS registry', () => {
  it('has a substantial number of card configs defined', () => {
    const cardCount = Object.keys(CARD_CONFIGS).length
    expect(cardCount).toBeGreaterThanOrEqual(MIN_CARD_COUNT)
  })

  it('all registry keys are strings', () => {
    Object.keys(CARD_CONFIGS).forEach(key => {
      expect(typeof key).toBe('string')
    })
  })

  it('all registry keys are snake_case', () => {
    Object.keys(CARD_CONFIGS).forEach(key => {
      expect(key).toMatch(/^[a-z0-9_]+$/)
    })
  })

  it('registry keys match config type property', () => {
    Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
      expect(config.type).toBe(key)
    })
  })

  it('has no duplicate type values', () => {
    const types = Object.values(CARD_CONFIGS).map(c => c.type)
    const unique = new Set(types)
    expect(unique.size).toBe(types.length)
  })
})

describe('Card config schema validation', () => {
  Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
    describe(`${key} card config`, () => {
      it('has required type property', () => {
        expect(config.type).toBeDefined()
        expect(typeof config.type).toBe('string')
        expect(config.type.length).toBeGreaterThan(0)
      })

      it('has required title property', () => {
        expect(config.title).toBeDefined()
        expect(typeof config.title).toBe('string')
        expect(config.title.length).toBeGreaterThan(0)
      })

      it('has required category property', () => {
        expect(config.category).toBeDefined()
        expect(typeof config.category).toBe('string')
      })

      it('has valid category value', () => {
        expect(VALID_CATEGORIES).toContain(config.category as string)
      })

      it('has optional description property with correct type', () => {
        if (config.description !== undefined) {
          expect(typeof config.description).toBe('string')
        }
      })

      it('has optional icon property with correct type', () => {
        if (config.icon !== undefined) {
          expect(typeof config.icon).toBe('string')
          expect(config.icon.length).toBeGreaterThan(0)
        }
      })

      it('has optional iconColor property with correct format', () => {
        if (config.iconColor !== undefined) {
          expect(typeof config.iconColor).toBe('string')
          // Should be a Tailwind color class
          expect(config.iconColor).toMatch(/^text-/)
        }
      })

      it('has valid defaultWidth if specified', () => {
        if (config.defaultWidth !== undefined) {
          expect(VALID_WIDTHS).toContain(config.defaultWidth as number)
        }
      })

      it('has valid defaultHeight if specified', () => {
        if (config.defaultHeight !== undefined) {
          expect(typeof config.defaultHeight).toBe('number')
          expect(config.defaultHeight).toBeGreaterThan(0)
        }
      })

      it('has required dataSource property', () => {
        expect(config.dataSource).toBeDefined()
        expect(typeof config.dataSource).toBe('object')
      })

      it('has valid dataSource type', () => {
        expect(VALID_DATA_SOURCE_TYPES).toContain(config.dataSource.type as string)
      })

      it('has required content property', () => {
        expect(config.content).toBeDefined()
        expect(typeof config.content).toBe('object')
      })

      it('has valid content type', () => {
        expect(VALID_CONTENT_TYPES).toContain(config.content.type as string)
      })

      it('has boolean isDemoData property if specified', () => {
        if (config.isDemoData !== undefined) {
          expect(typeof config.isDemoData).toBe('boolean')
        }
      })

      it('has boolean isLive property if specified', () => {
        if (config.isLive !== undefined) {
          expect(typeof config.isLive).toBe('boolean')
        }
      })

      it('has array projects property if specified', () => {
        if (config.projects !== undefined) {
          expect(Array.isArray(config.projects)).toBe(true)
          config.projects.forEach(project => {
            expect(typeof project).toBe('string')
          })
        }
      })
    })
  })
})

describe('DataSource validation', () => {
  Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
    describe(`${key} dataSource`, () => {
      const ds = config.dataSource

      it('has type property', () => {
        expect(ds.type).toBeDefined()
      })

      if (ds.type === 'hook') {
        const hookDs = ds as CardDataSourceHook
        it('has required hook property for hook dataSource', () => {
          expect(hookDs.hook).toBeDefined()
          expect(typeof hookDs.hook).toBe('string')
          expect(hookDs.hook.length).toBeGreaterThan(0)
        })

        it('has object params property if specified', () => {
          if (hookDs.params !== undefined) {
            expect(typeof hookDs.params).toBe('object')
          }
        })
      }

      if (ds.type === 'api') {
        const apiDs = ds as CardDataSourceApi
        it('has required endpoint property for api dataSource', () => {
          expect(apiDs.endpoint).toBeDefined()
          expect(typeof apiDs.endpoint).toBe('string')
          expect(apiDs.endpoint).toMatch(/^\//)
        })

        it('has valid method if specified', () => {
          if (apiDs.method !== undefined) {
            expect(['GET', 'POST']).toContain(apiDs.method)
          }
        })

        it('has number pollInterval if specified', () => {
          if (apiDs.pollInterval !== undefined) {
            expect(typeof apiDs.pollInterval).toBe('number')
            expect(apiDs.pollInterval).toBeGreaterThanOrEqual(0)
          }
        })
      }

      if (ds.type === 'static') {
        const staticDs = ds as CardDataSourceStatic
        it('has array data property if specified', () => {
          if (staticDs.data !== undefined) {
            expect(Array.isArray(staticDs.data)).toBe(true)
          }
        })
      }

      if (ds.type === 'context') {
        const contextDs = ds as CardDataSourceContext
        it('has required contextKey property for context dataSource', () => {
          expect(contextDs.contextKey).toBeDefined()
          expect(typeof contextDs.contextKey).toBe('string')
          expect(contextDs.contextKey.length).toBeGreaterThan(0)
        })
      }
    })
  })
})

describe('Content validation', () => {
  Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
    describe(`${key} content`, () => {
      const content = config.content

      it('has type property', () => {
        expect(content.type).toBeDefined()
      })

      if (content.type === 'list' || content.type === 'table') {
        const columnarContent = content as CardContentList | CardContentTable
        it('has required columns array', () => {
          expect(columnarContent.columns).toBeDefined()
          expect(Array.isArray(columnarContent.columns)).toBe(true)
          expect(columnarContent.columns.length).toBeGreaterThan(0)
        })

        it('has valid column configurations', () => {
          columnarContent.columns.forEach((col) => {
            expect(col.field).toBeDefined()
            expect(typeof col.field).toBe('string')

            if (col.header !== undefined) {
              expect(typeof col.header).toBe('string')
            }

            if (col.render !== undefined) {
              expect(typeof col.render).toBe('string')
            }

            if (col.width !== undefined) {
              expect(['number', 'string'].includes(typeof col.width)).toBe(true)
            }

            if (col.align !== undefined) {
              expect(['left', 'center', 'right']).toContain(col.align)
            }

            if (col.primary !== undefined) {
              expect(typeof col.primary).toBe('boolean')
            }

            if (col.sortable !== undefined) {
              expect(typeof col.sortable).toBe('boolean')
            }
          })
        })

        it('has valid pageSize if specified', () => {
          if (columnarContent.pageSize !== undefined) {
            expect(typeof columnarContent.pageSize).toBe('number')
            expect(columnarContent.pageSize).toBeGreaterThan(0)
          }
        })

        it('has valid sortable property if specified', () => {
          if (columnarContent.sortable !== undefined) {
            expect(typeof columnarContent.sortable).toBe('boolean')
          }
        })

        it('has valid defaultSort if specified', () => {
          if (columnarContent.defaultSort !== undefined) {
            expect(typeof columnarContent.defaultSort).toBe('string')
            const fields = columnarContent.columns.map((c) => c.field)
            expect(fields).toContain(columnarContent.defaultSort)
          }
        })

        it('has valid defaultDirection if specified', () => {
          if (columnarContent.defaultDirection !== undefined) {
            expect(['asc', 'desc']).toContain(columnarContent.defaultDirection)
          }
        })
      }

      if (content.type === 'chart') {
        const chartContent = content as CardContentChart
        it('has required chartType property', () => {
          expect(chartContent.chartType).toBeDefined()
          expect(['line', 'bar', 'donut', 'gauge', 'sparkline', 'area']).toContain(
            chartContent.chartType
          )
        })

        it('has valid height if specified', () => {
          if (chartContent.height !== undefined) {
            expect(typeof chartContent.height).toBe('number')
            expect(chartContent.height).toBeGreaterThan(0)
          }
        })

        it('has valid showLegend if specified', () => {
          if (chartContent.showLegend !== undefined) {
            expect(typeof chartContent.showLegend).toBe('boolean')
          }
        })
      }

      if (content.type === 'custom') {
        const customContent = content as CardContentCustom
        it('has component or componentName property', () => {
          const hasComponent = customContent.component !== undefined
          const hasComponentName = customContent.componentName !== undefined
          expect(hasComponent || hasComponentName).toBe(true)

          if (hasComponent) {
            expect(typeof customContent.component).toBe('string')
          }
          if (hasComponentName) {
            expect(typeof customContent.componentName).toBe('string')
          }
        })

        it('has valid props object if specified', () => {
          if (customContent.props !== undefined) {
            expect(typeof customContent.props).toBe('object')
          }
        })
      }

      if (content.type === 'status-grid') {
        const statusGridContent = content as CardContentStatusGrid
        it('has required items array', () => {
          expect(statusGridContent.items).toBeDefined()
          expect(Array.isArray(statusGridContent.items)).toBe(true)
        })

        it('has valid columns if specified', () => {
          if (statusGridContent.columns !== undefined) {
            expect(typeof statusGridContent.columns).toBe('number')
            expect(statusGridContent.columns).toBeGreaterThan(0)
          }
        })
      }

      if (content.type === 'stats-grid') {
        const statsGridContent = content as CardContentStatsGrid
        it('has required stats array', () => {
          expect(statsGridContent.stats).toBeDefined()
          expect(Array.isArray(statsGridContent.stats)).toBe(true)
        })

        it('has valid stat items', () => {
          statsGridContent.stats.forEach((stat) => {
            expect(stat.field).toBeDefined()
            expect(typeof stat.field).toBe('string')
            expect(stat.label).toBeDefined()
            expect(typeof stat.label).toBe('string')
          })
        })
      }
    })
  })
})

describe('Stats validation', () => {
  Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
    if (!config.stats || config.stats.length === 0) return

    describe(`${key} stats`, () => {
      it('has array stats property', () => {
        expect(Array.isArray(config.stats)).toBe(true)
      })

      it('has valid stat configurations', () => {
        config.stats!.forEach(stat => {
          expect(stat.id).toBeDefined()
          expect(typeof stat.id).toBe('string')

          if (stat.icon !== undefined) {
            expect(typeof stat.icon).toBe('string')
          }

          if (stat.color !== undefined) {
            expect(typeof stat.color).toBe('string')
            expect(stat.color).toMatch(/^text-/)
          }

          if (stat.bgColor !== undefined) {
            expect(typeof stat.bgColor).toBe('string')
            expect(stat.bgColor).toMatch(/^bg-/)
          }

          if (stat.label !== undefined) {
            expect(typeof stat.label).toBe('string')
          }

          expect(stat.valueSource).toBeDefined()
          expect(typeof stat.valueSource).toBe('object')
        })
      })
    })
  })
})

describe('Filters validation', () => {
  Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
    if (!config.filters || config.filters.length === 0) return

    describe(`${key} filters`, () => {
      it('has array filters property', () => {
        expect(Array.isArray(config.filters)).toBe(true)
      })

      it('has valid filter configurations', () => {
        config.filters!.forEach(filter => {
          expect(filter.field).toBeDefined()
          expect(typeof filter.field).toBe('string')

          expect(filter.type).toBeDefined()
          expect(typeof filter.type).toBe('string')

          if (filter.placeholder !== undefined) {
            expect(typeof filter.placeholder).toBe('string')
          }

          if (filter.storageKey !== undefined) {
            expect(typeof filter.storageKey).toBe('string')
          }

          if (filter.searchFields !== undefined) {
            expect(Array.isArray(filter.searchFields)).toBe(true)
          }
        })
      })
    })
  })
})

describe('EmptyState validation', () => {
  Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
    if (!config.emptyState) return

    describe(`${key} emptyState`, () => {
      const emptyState = config.emptyState

      it('has valid icon if specified', () => {
        if (emptyState.icon !== undefined) {
          expect(typeof emptyState.icon).toBe('string')
        }
      })

      it('has valid title if specified', () => {
        if (emptyState.title !== undefined) {
          expect(typeof emptyState.title).toBe('string')
        }
      })

      it('has valid message if specified', () => {
        if (emptyState.message !== undefined) {
          expect(typeof emptyState.message).toBe('string')
        }
      })

      it('has valid variant if specified', () => {
        if (emptyState.variant !== undefined) {
          expect(['success', 'info', 'warning', 'neutral']).toContain(emptyState.variant)
        }
      })
    })
  })
})

describe('LoadingState validation', () => {
  Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
    if (!config.loadingState) return

    describe(`${key} loadingState`, () => {
      const loadingState = config.loadingState

      it('has required type property', () => {
        expect(loadingState.type).toBeDefined()
        expect(typeof loadingState.type).toBe('string')
      })

      it('has valid rows if specified', () => {
        if (loadingState.rows !== undefined) {
          expect(typeof loadingState.rows).toBe('number')
          expect(loadingState.rows).toBeGreaterThan(0)
        }
      })

      it('has valid showSearch if specified', () => {
        if (loadingState.showSearch !== undefined) {
          expect(typeof loadingState.showSearch).toBe('boolean')
        }
      })
    })
  })
})

describe('DrillDown validation', () => {
  Object.entries(CARD_CONFIGS).forEach(([key, config]) => {
    if (!config.drillDown) return

    describe(`${key} drillDown`, () => {
      const drillDown = config.drillDown

      it('has required action property', () => {
        expect(drillDown.action).toBeDefined()
        expect(typeof drillDown.action).toBe('string')
        expect(drillDown.action.length).toBeGreaterThan(0)
      })

      it('has valid params if specified', () => {
        if (drillDown.params !== undefined) {
          expect(Array.isArray(drillDown.params)).toBe(true)
          drillDown.params.forEach(param => {
            expect(typeof param).toBe('string')
          })
        }
      })

      it('has valid context if specified', () => {
        if (drillDown.context !== undefined) {
          expect(typeof drillDown.context).toBe('object')
        }
      })
    })
  })
})
