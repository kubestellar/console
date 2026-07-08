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
import type { UnifiedCardConfig, CardDataSource, CardContent } from '../../../lib/unified/types'

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
        expect(VALID_CATEGORIES).toContain(config.category as any)
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
          expect(VALID_WIDTHS).toContain(config.defaultWidth as any)
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
        expect(VALID_DATA_SOURCE_TYPES).toContain(config.dataSource.type as any)
      })

      it('has required content property', () => {
        expect(config.content).toBeDefined()
        expect(typeof config.content).toBe('object')
      })

      it('has valid content type', () => {
        expect(VALID_CONTENT_TYPES).toContain(config.content.type as any)
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
        it('has required hook property for hook dataSource', () => {
          expect((ds as any).hook).toBeDefined()
          expect(typeof (ds as any).hook).toBe('string')
          expect((ds as any).hook.length).toBeGreaterThan(0)
        })

        it('has object params property if specified', () => {
          if ((ds as any).params !== undefined) {
            expect(typeof (ds as any).params).toBe('object')
          }
        })
      }

      if (ds.type === 'api') {
        it('has required endpoint property for api dataSource', () => {
          expect((ds as any).endpoint).toBeDefined()
          expect(typeof (ds as any).endpoint).toBe('string')
          expect((ds as any).endpoint).toMatch(/^\//)
        })

        it('has valid method if specified', () => {
          if ((ds as any).method !== undefined) {
            expect(['GET', 'POST']).toContain((ds as any).method)
          }
        })

        it('has number pollInterval if specified', () => {
          if ((ds as any).pollInterval !== undefined) {
            expect(typeof (ds as any).pollInterval).toBe('number')
            expect((ds as any).pollInterval).toBeGreaterThanOrEqual(0)
          }
        })
      }

      if (ds.type === 'static') {
        it('has array data property if specified', () => {
          if ((ds as any).data !== undefined) {
            expect(Array.isArray((ds as any).data)).toBe(true)
          }
        })
      }

      if (ds.type === 'context') {
        it('has required contextKey property for context dataSource', () => {
          expect((ds as any).contextKey).toBeDefined()
          expect(typeof (ds as any).contextKey).toBe('string')
          expect((ds as any).contextKey.length).toBeGreaterThan(0)
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
        it('has required columns array', () => {
          expect((content as any).columns).toBeDefined()
          expect(Array.isArray((content as any).columns)).toBe(true)
          expect((content as any).columns.length).toBeGreaterThan(0)
        })

        it('has valid column configurations', () => {
          (content as any).columns.forEach((col: any) => {
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
          if ((content as any).pageSize !== undefined) {
            expect(typeof (content as any).pageSize).toBe('number')
            expect((content as any).pageSize).toBeGreaterThan(0)
          }
        })

        it('has valid sortable property if specified', () => {
          if ((content as any).sortable !== undefined) {
            expect(typeof (content as any).sortable).toBe('boolean')
          }
        })

        it('has valid defaultSort if specified', () => {
          if ((content as any).defaultSort !== undefined) {
            expect(typeof (content as any).defaultSort).toBe('string')
            const fields = (content as any).columns.map((c: any) => c.field)
            expect(fields).toContain((content as any).defaultSort)
          }
        })

        it('has valid defaultDirection if specified', () => {
          if ((content as any).defaultDirection !== undefined) {
            expect(['asc', 'desc']).toContain((content as any).defaultDirection)
          }
        })
      }

      if (content.type === 'chart') {
        it('has required chartType property', () => {
          expect((content as any).chartType).toBeDefined()
          expect(['line', 'bar', 'donut', 'gauge', 'sparkline', 'area']).toContain(
            (content as any).chartType
          )
        })

        it('has valid height if specified', () => {
          if ((content as any).height !== undefined) {
            expect(typeof (content as any).height).toBe('number')
            expect((content as any).height).toBeGreaterThan(0)
          }
        })

        it('has valid showLegend if specified', () => {
          if ((content as any).showLegend !== undefined) {
            expect(typeof (content as any).showLegend).toBe('boolean')
          }
        })
      }

      if (content.type === 'custom') {
        it('has component or componentName property', () => {
          const hasComponent = (content as any).component !== undefined
          const hasComponentName = (content as any).componentName !== undefined
          expect(hasComponent || hasComponentName).toBe(true)

          if (hasComponent) {
            expect(typeof (content as any).component).toBe('string')
          }
          if (hasComponentName) {
            expect(typeof (content as any).componentName).toBe('string')
          }
        })

        it('has valid props object if specified', () => {
          if ((content as any).props !== undefined) {
            expect(typeof (content as any).props).toBe('object')
          }
        })
      }

      if (content.type === 'status-grid') {
        it('has required items array', () => {
          expect((content as any).items).toBeDefined()
          expect(Array.isArray((content as any).items)).toBe(true)
        })

        it('has valid columns if specified', () => {
          if ((content as any).columns !== undefined) {
            expect(typeof (content as any).columns).toBe('number')
            expect((content as any).columns).toBeGreaterThan(0)
          }
        })
      }

      if (content.type === 'stats-grid') {
        it('has required stats array', () => {
          expect((content as any).stats).toBeDefined()
          expect(Array.isArray((content as any).stats)).toBe(true)
        })

        it('has valid stat items', () => {
          (content as any).stats.forEach((stat: any) => {
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

          if ((filter as any).searchFields !== undefined) {
            expect(Array.isArray((filter as any).searchFields)).toBe(true)
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
        if ((loadingState as any).rows !== undefined) {
          expect(typeof (loadingState as any).rows).toBe('number')
          expect((loadingState as any).rows).toBeGreaterThan(0)
        }
      })

      it('has valid showSearch if specified', () => {
        if ((loadingState as any).showSearch !== undefined) {
          expect(typeof (loadingState as any).showSearch).toBe('boolean')
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
