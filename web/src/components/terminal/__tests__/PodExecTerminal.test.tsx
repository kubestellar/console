/**
 * PodExecTerminal component smoke tests
 *
 * PodExecTerminal depends on @xterm/xterm which requires a real DOM,
 * so we verify the export exists rather than attempting a full render.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../hooks/useExecSession', () => ({
  useExecSession: () => ({
    status: 'disconnected' as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendInput: vi.fn(),
    sendResize: vi.fn(),
    error: null,
  }),
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    write: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(),
    onResize: vi.fn(),
    loadAddon: vi.fn(),
  })),
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
  })),
}))

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

describe('PodExecTerminal', () => {
  it('exports PodExecTerminal component', async () => {
    const mod = await import('../PodExecTerminal')
    expect(mod.default).toBeDefined()
  }, IMPORT_TIMEOUT_MS)
})
