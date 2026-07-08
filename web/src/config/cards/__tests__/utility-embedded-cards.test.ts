/**
 * Comprehensive tests for utility & embedded content cards (issue #19665)
 *
 * Validates configuration correctness, field constraints, data source types,
 * content structure, and invariants for all utility/embedded/game cards.
 */
import { describe, expect, it } from 'vitest'
import { getCardConfig, hasUnifiedConfig } from '../index'

// === Game card imports ===
import { kubeSnakeConfig } from '../kube-snake'
import { kubePongConfig } from '../kube-pong'
import { kubeDoomConfig } from '../kube-doom'
import { kubeGalagaConfig } from '../kube-galaga'
import { kubeKartConfig } from '../kube-kart'
import { kubeKongConfig } from '../kube-kong'
import { kubeManConfig } from '../kube-man'
import { kubeBertConfig } from '../kube-bert'
import { kubeChessConfig } from '../kube-chess'
import { flappyPodConfig } from '../flappy-pod'
import { game2048Config } from '../game-2048'
import { nodeInvadersConfig } from '../node-invaders'
import { matchGameConfig } from '../match-game'
import { missileCommandConfig } from '../missile-command'
import { solitaireConfig } from '../solitaire'
import { sudokuGameConfig } from '../sudoku-game'
import { containerTetrisConfig } from '../container-tetris'
import { podBrothersConfig } from '../pod-brothers'
import { podCrosserConfig } from '../pod-crosser'
import { podPitfallConfig } from '../pod-pitfall'
import { podSweeperConfig } from '../pod-sweeper'
import { checkersConfig } from '../checkers'
import { kubedleConfig } from '../kubedle'

// === Embedded content card imports ===
import { iframeEmbedConfig } from '../iframe-embed'
import { mobileBrowserConfig } from '../mobile-browser'
import { rssFeedConfig } from '../rss-feed'
import { weatherConfig } from '../weather'
import { stockMarketTickerConfig } from '../stock-market-ticker'
import { githubActivityConfig } from '../github-activity'

// === Utility card imports ===
import { dynamicCardConfig } from '../dynamic-card'
import { kubectlConfig } from '../kubectl'
import { networkUtilsConfig } from '../network-utils'
import { upgradeStatusConfig } from '../upgrade-status'

import type { UnifiedCardConfig } from '../../../lib/unified/types'

// ============================================================================
// Game Cards — Configuration Invariants
// ============================================================================

const GAME_CARDS: Array<{ config: UnifiedCardConfig; name: string }> = [
  { config: kubeSnakeConfig, name: 'kube-snake' },
  { config: kubePongConfig, name: 'kube-pong' },
  { config: kubeDoomConfig, name: 'kube-doom' },
  { config: kubeGalagaConfig, name: 'kube-galaga' },
  { config: kubeKartConfig, name: 'kube-kart' },
  { config: kubeKongConfig, name: 'kube-kong' },
  { config: kubeManConfig, name: 'kube-man' },
  { config: kubeBertConfig, name: 'kube-bert' },
  { config: kubeChessConfig, name: 'kube-chess' },
  { config: flappyPodConfig, name: 'flappy-pod' },
  { config: game2048Config, name: 'game-2048' },
  { config: nodeInvadersConfig, name: 'node-invaders' },
  { config: matchGameConfig, name: 'match-game' },
  { config: missileCommandConfig, name: 'missile-command' },
  { config: solitaireConfig, name: 'solitaire' },
  { config: sudokuGameConfig, name: 'sudoku-game' },
  { config: containerTetrisConfig, name: 'container-tetris' },
  { config: podBrothersConfig, name: 'pod-brothers' },
  { config: podCrosserConfig, name: 'pod-crosser' },
  { config: podPitfallConfig, name: 'pod-pitfall' },
  { config: podSweeperConfig, name: 'pod-sweeper' },
  { config: checkersConfig, name: 'checkers' },
  { config: kubedleConfig, name: 'kubedle' },
]

describe('Game cards — shared invariants', () => {
  it.each(GAME_CARDS)('$name belongs to category "games"', ({ config }) => {
    expect(config.category).toBe('games')
  })

  it.each(GAME_CARDS)('$name uses static data source (no server dependency)', ({ config }) => {
    expect(config.dataSource.type).toBe('static')
  })

  it.each(GAME_CARDS)('$name uses custom component rendering', ({ config }) => {
    expect(config.content.type).toBe('custom')
    expect((config.content as { component?: string }).component).toBeTruthy()
  })

  it.each(GAME_CARDS)('$name is not live data (isLive: false)', ({ config }) => {
    expect(config.isLive).toBe(false)
  })

  it.each(GAME_CARDS)('$name is not demo data', ({ config }) => {
    expect(config.isDemoData).toBe(false)
  })

  it.each(GAME_CARDS)('$name has minimum playable dimensions (width≥5, height≥4)', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThanOrEqual(5)
    expect(config.defaultHeight).toBeGreaterThanOrEqual(4)
  })

  it.each(GAME_CARDS)('$name has an emptyState with info variant', ({ config }) => {
    expect(config.emptyState).toBeDefined()
    expect(config.emptyState!.variant).toBe('info')
    expect(config.emptyState!.title).toBeTruthy()
    expect(config.emptyState!.message).toBeTruthy()
  })

  it.each(GAME_CARDS)('$name has a description', ({ config }) => {
    expect(config.description).toBeTruthy()
    expect(config.description!.length).toBeGreaterThan(3)
  })

  it.each(GAME_CARDS)('$name is registered in the card config registry', ({ config }) => {
    expect(hasUnifiedConfig(config.type)).toBe(true)
    expect(getCardConfig(config.type)).toBeDefined()
  })

  it('all game cards have unique type identifiers', () => {
    const types = GAME_CARDS.map(c => c.config.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it('all game cards have unique component names', () => {
    const components = GAME_CARDS.map(
      c => (c.config.content as { component?: string }).component
    )
    expect(new Set(components).size).toBe(components.length)
  })
})

// ============================================================================
// Embedded Content Cards — Configuration Validation
// ============================================================================

describe('Embedded content cards', () => {
  describe('iframe-embed', () => {
    it('has correct type and category', () => {
      expect(iframeEmbedConfig.type).toBe('iframe_embed')
      expect(iframeEmbedConfig.category).toBe('utility')
    })

    it('uses static data source (URL comes from user config, not a hook)', () => {
      expect(iframeEmbedConfig.dataSource.type).toBe('static')
    })

    it('is not live (content is static once loaded)', () => {
      expect(iframeEmbedConfig.isLive).toBe(false)
    })

    it('has sufficient dimensions for embedded content', () => {
      expect(iframeEmbedConfig.defaultWidth).toBeGreaterThanOrEqual(6)
      expect(iframeEmbedConfig.defaultHeight).toBeGreaterThanOrEqual(4)
    })

    it('uses custom component renderer', () => {
      expect(iframeEmbedConfig.content.type).toBe('custom')
      expect((iframeEmbedConfig.content as { component: string }).component).toBe('IframeEmbed')
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('iframe_embed')).toBe(true)
    })
  })

  describe('mobile-browser', () => {
    it('has correct type and category', () => {
      expect(mobileBrowserConfig.type).toBe('mobile_browser')
      expect(mobileBrowserConfig.category).toBe('utility')
    })

    it('uses static data source', () => {
      expect(mobileBrowserConfig.dataSource.type).toBe('static')
    })

    it('has taller height for mobile viewport', () => {
      expect(mobileBrowserConfig.defaultHeight).toBeGreaterThanOrEqual(4)
    })

    it('uses custom MobileBrowser component', () => {
      expect((mobileBrowserConfig.content as { component: string }).component).toBe('MobileBrowser')
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('mobile_browser')).toBe(true)
    })
  })

  describe('rss-feed', () => {
    it('has correct type and category', () => {
      expect(rssFeedConfig.type).toBe('rss_feed')
      expect(rssFeedConfig.category).toBe('utility')
    })

    it('uses hook data source for fetching feed data', () => {
      expect(rssFeedConfig.dataSource.type).toBe('hook')
      expect((rssFeedConfig.dataSource as { hook: string }).hook).toBe('useRSSFeed')
    })

    it('is live (feeds update in real-time)', () => {
      expect(rssFeedConfig.isLive).toBe(true)
    })

    it('uses list content type with appropriate columns', () => {
      expect(rssFeedConfig.content.type).toBe('list')
      const content = rssFeedConfig.content as { columns: Array<{ field: string }> }
      const fields = content.columns.map(c => c.field)
      expect(fields).toContain('title')
      expect(fields).toContain('pubDate')
    })

    it('has pagination configured', () => {
      const content = rssFeedConfig.content as { pageSize: number }
      expect(content.pageSize).toBeGreaterThan(0)
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('rss_feed')).toBe(true)
    })
  })

  describe('weather', () => {
    it('has correct type and category', () => {
      expect(weatherConfig.type).toBe('weather')
      expect(weatherConfig.category).toBe('utility')
    })

    it('uses hook data source', () => {
      expect(weatherConfig.dataSource.type).toBe('hook')
      expect((weatherConfig.dataSource as { hook: string }).hook).toBe('useWeather')
    })

    it('is live data', () => {
      expect(weatherConfig.isLive).toBe(true)
    })

    it('uses custom WeatherDisplay component', () => {
      expect(weatherConfig.content.type).toBe('custom')
      expect((weatherConfig.content as { component: string }).component).toBe('WeatherDisplay')
    })

    it('has reasonable dimensions', () => {
      expect(weatherConfig.defaultWidth).toBeGreaterThanOrEqual(4)
      expect(weatherConfig.defaultHeight).toBeGreaterThanOrEqual(2)
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('weather')).toBe(true)
    })
  })

  describe('stock-market-ticker', () => {
    it('has correct type and category', () => {
      expect(stockMarketTickerConfig.type).toBe('stock_market_ticker')
      expect(stockMarketTickerConfig.category).toBe('utility')
    })

    it('uses hook data source for live market data', () => {
      expect(stockMarketTickerConfig.dataSource.type).toBe('hook')
      expect((stockMarketTickerConfig.dataSource as { hook: string }).hook).toBe('useStockMarketTicker')
    })

    it('is live (real-time market data)', () => {
      expect(stockMarketTickerConfig.isLive).toBe(true)
    })

    it('uses custom StockTicker component', () => {
      expect((stockMarketTickerConfig.content as { component: string }).component).toBe('StockTicker')
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('stock_market_ticker')).toBe(true)
    })
  })

  describe('github-activity', () => {
    it('has correct type and category', () => {
      expect(githubActivityConfig.type).toBe('github_activity')
      expect(githubActivityConfig.category).toBe('ci-cd')
    })

    it('uses hook data source', () => {
      expect(githubActivityConfig.dataSource.type).toBe('hook')
      expect((githubActivityConfig.dataSource as { hook: string }).hook).toBe('useGithubActivity')
    })

    it('is live data', () => {
      expect(githubActivityConfig.isLive).toBe(true)
    })

    it('uses list content type with activity columns', () => {
      expect(githubActivityConfig.content.type).toBe('list')
      const content = githubActivityConfig.content as { columns: Array<{ field: string }> }
      const fields = content.columns.map(c => c.field)
      expect(fields).toContain('type')
      expect(fields).toContain('repo')
      expect(fields).toContain('actor')
      expect(fields).toContain('timestamp')
    })

    it('has wider default width for table display', () => {
      expect(githubActivityConfig.defaultWidth).toBeGreaterThanOrEqual(8)
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('github_activity')).toBe(true)
    })
  })
})

// ============================================================================
// Utility Cards — Configuration Validation
// ============================================================================

describe('Utility cards', () => {
  describe('dynamic-card', () => {
    it('has correct type and category', () => {
      expect(dynamicCardConfig.type).toBe('dynamic_card')
      expect(dynamicCardConfig.category).toBe('utility')
    })

    it('uses static data source (user-defined content)', () => {
      expect(dynamicCardConfig.dataSource.type).toBe('static')
    })

    it('is not live', () => {
      expect(dynamicCardConfig.isLive).toBe(false)
    })

    it('uses custom DynamicCardRenderer component', () => {
      expect((dynamicCardConfig.content as { component: string }).component).toBe('DynamicCardRenderer')
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('dynamic_card')).toBe(true)
    })
  })

  describe('kubectl', () => {
    it('has correct type and category', () => {
      expect(kubectlConfig.type).toBe('kubectl')
      expect(kubectlConfig.category).toBe('utility')
    })

    it('uses hook data source for terminal interaction', () => {
      expect(kubectlConfig.dataSource.type).toBe('hook')
      expect((kubectlConfig.dataSource as { hook: string }).hook).toBe('useKubectl')
    })

    it('is live (interactive terminal)', () => {
      expect(kubectlConfig.isLive).toBe(true)
    })

    it('has larger dimensions for terminal use', () => {
      expect(kubectlConfig.defaultWidth).toBeGreaterThanOrEqual(8)
      expect(kubectlConfig.defaultHeight).toBeGreaterThanOrEqual(4)
    })

    it('uses custom KubectlTerminal component', () => {
      expect((kubectlConfig.content as { component: string }).component).toBe('KubectlTerminal')
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('kubectl')).toBe(true)
    })
  })

  describe('network-utils', () => {
    it('has correct type and category', () => {
      expect(networkUtilsConfig.type).toBe('network_utils')
      expect(networkUtilsConfig.category).toBe('utility')
    })

    it('uses static data source', () => {
      expect(networkUtilsConfig.dataSource.type).toBe('static')
    })

    it('is not live', () => {
      expect(networkUtilsConfig.isLive).toBe(false)
    })

    it('uses custom NetworkUtils component', () => {
      expect((networkUtilsConfig.content as { component: string }).component).toBe('NetworkUtils')
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('network_utils')).toBe(true)
    })
  })

  describe('upgrade-status', () => {
    it('has correct type and category', () => {
      expect(upgradeStatusConfig.type).toBe('upgrade_status')
      expect(upgradeStatusConfig.category).toBe('cluster-health')
    })

    it('uses hook data source', () => {
      expect(upgradeStatusConfig.dataSource.type).toBe('hook')
      expect((upgradeStatusConfig.dataSource as { hook: string }).hook).toBe('useUpgradeStatus')
    })

    it('is live data', () => {
      expect(upgradeStatusConfig.isLive).toBe(true)
    })

    it('uses list content type with version columns', () => {
      expect(upgradeStatusConfig.content.type).toBe('list')
      const content = upgradeStatusConfig.content as { columns: Array<{ field: string }> }
      const fields = content.columns.map(c => c.field)
      expect(fields).toContain('cluster')
      expect(fields).toContain('currentVersion')
      expect(fields).toContain('availableVersion')
      expect(fields).toContain('status')
    })

    it('has pagination configured', () => {
      const content = upgradeStatusConfig.content as { pageSize: number }
      expect(content.pageSize).toBeGreaterThan(0)
    })

    it('emptyState indicates neutral (all up to date)', () => {
      expect(upgradeStatusConfig.emptyState!.variant).toBe('neutral')
    })

    it('is registered in the config registry', () => {
      expect(hasUnifiedConfig('upgrade_status')).toBe(true)
    })
  })
})

// ============================================================================
// Cross-cutting Validations
// ============================================================================

const ALL_CARDS: Array<{ config: UnifiedCardConfig; name: string }> = [
  ...GAME_CARDS,
  { config: iframeEmbedConfig, name: 'iframe-embed' },
  { config: mobileBrowserConfig, name: 'mobile-browser' },
  { config: rssFeedConfig, name: 'rss-feed' },
  { config: weatherConfig, name: 'weather' },
  { config: stockMarketTickerConfig, name: 'stock-market-ticker' },
  { config: githubActivityConfig, name: 'github-activity' },
  { config: dynamicCardConfig, name: 'dynamic-card' },
  { config: kubectlConfig, name: 'kubectl' },
  { config: networkUtilsConfig, name: 'network-utils' },
  { config: upgradeStatusConfig, name: 'upgrade-status' },
]

describe('Cross-cutting invariants for utility/embedded/game cards', () => {
  it('all cards have unique type identifiers', () => {
    const types = ALL_CARDS.map(c => c.config.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it.each(ALL_CARDS)('$name type follows snake_case convention', ({ config }) => {
    expect(config.type).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it.each(ALL_CARDS)('$name has valid defaultWidth in allowed range', ({ config }) => {
    const VALID_WIDTHS = [3, 4, 5, 6, 8, 12]
    expect(VALID_WIDTHS).toContain(config.defaultWidth)
  })

  it.each(ALL_CARDS)('$name has positive defaultHeight', ({ config }) => {
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(ALL_CARDS)('$name has a non-empty title', ({ config }) => {
    expect(config.title.trim().length).toBeGreaterThan(0)
  })

  it.each(ALL_CARDS)('$name has an icon configured', ({ config }) => {
    expect(config.icon).toBeTruthy()
  })

  it.each(ALL_CARDS)('$name has an iconColor class', ({ config }) => {
    expect(config.iconColor).toBeTruthy()
    expect(config.iconColor).toMatch(/^text-/)
  })

  it.each(ALL_CARDS)('$name has isDemoData set to false', ({ config }) => {
    expect(config.isDemoData).toBe(false)
  })

  it.each(ALL_CARDS)('$name emptyState icon matches card icon', ({ config }) => {
    if (config.emptyState?.icon) {
      expect(config.emptyState.icon).toBe(config.icon)
    }
  })

  it.each(ALL_CARDS)('$name loadingState is defined', ({ config }) => {
    expect(config.loadingState).toBeDefined()
  })
})
