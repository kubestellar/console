import { vi } from 'vitest'

vi.mock('../../lib/demoMode', () => ({
    isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
    isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
    toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => { },
    isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
    useDemoMode: () => false
}))

vi.mock('../../hooks/useDemoMode', () => ({
    getDemoMode: () => true, default: () => true, useDemoMode: () => true, isDemoModeForced: false,
}))

vi.mock('../../lib/analytics', () => ({
    emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
    trackEvent: vi.fn()
}))

vi.mock('../../hooks/useTokenUsage', () => ({
    useTokenUsage: () => ({
        used: 0,
        limit: 1000,
        warningThreshold: 0.8,
        criticalThreshold: 0.9
    })
}))
