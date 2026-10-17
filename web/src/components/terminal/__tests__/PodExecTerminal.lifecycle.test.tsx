import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PodExecTerminal from '../PodExecTerminal'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(), disconnect: vi.fn(), sendInput: vi.fn(), resize: vi.fn(),
  onData: vi.fn(), onExit: vi.fn(),
  fit: vi.fn(), dispose: vi.fn(), inputDispose: vi.fn(), write: vi.fn(),
  reset: vi.fn(), focus: vi.fn(), observe: vi.fn(), disconnectObserver: vi.fn(),
  input: undefined as undefined | ((data: string) => void),
  status: 'disconnected',
}))

vi.mock('../../../hooks/useExecSession', () => ({
  useExecSession: () => ({
    ...mocks, error: null, reconnectAttempt: 0, reconnectCountdown: 0, isStale: false,
  }),
}))
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 120
    rows = 40
    open = vi.fn()
    loadAddon = vi.fn()
    write = mocks.write
    reset = mocks.reset
    focus = mocks.focus
    dispose = mocks.dispose
    onData(callback: (data: string) => void) {
      mocks.input = callback
      return { dispose: mocks.inputDispose }
    }
  },
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = mocks.fit } }))

const OriginalResizeObserver = globalThis.ResizeObserver
const props = { cluster: 'prod', namespace: 'apps', pod: 'api-0', containers: ['app', 'sidecar'] }
const RESIZE_DEBOUNCE_MS = 100

describe('PodExecTerminal lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mocks.status = 'disconnected'
    globalThis.ResizeObserver = class {
      observe = mocks.observe
      disconnect = mocks.disconnectObserver
      unobserve = vi.fn()
    }
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0 })
  })
  afterEach(() => {
    globalThis.ResizeObserver = OriginalResizeObserver
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('auto-connects once with the selected container and fitted dimensions', () => {
    const { rerender } = render(<PodExecTerminal {...props} defaultContainer="sidecar" />)
    expect(mocks.connect).toHaveBeenCalledWith({
      cluster: 'prod', namespace: 'apps', pod: 'api-0', container: 'sidecar',
      command: ['/bin/sh'], tty: true, cols: 120, rows: 40,
    })
    rerender(<PodExecTerminal {...props} defaultContainer="sidecar" />)
    expect(mocks.connect).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /container:/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'app' }))
    fireEvent.click(screen.getByRole('button', { name: 'terminal.connect' }))
    expect(mocks.connect).toHaveBeenLastCalledWith(expect.objectContaining({ container: 'app' }))
  })

  it('forwards input, output, and process exit, then resets on reconnect', () => {
    render(<PodExecTerminal {...props} />)
    mocks.input?.('pwd\n')
    expect(mocks.sendInput).toHaveBeenCalledWith('pwd\n')
    act(() => mocks.onData.mock.calls[0][0]('/apps\r\n'))
    expect(mocks.write).toHaveBeenCalledWith('/apps\r\n')
    act(() => mocks.onExit.mock.calls[0][0](7))
    expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining('Process exited with code 7'))
    fireEvent.click(screen.getByRole('button', { name: 'terminal.reconnect' }))
    expect(mocks.reset).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'terminal.connect' })).toBeInTheDocument()
  })

  it('focuses on connection, disconnects, and disposes pending resize work on unmount', () => {
    const { rerender, unmount } = render(<PodExecTerminal {...props} />)
    act(() => {
      window.dispatchEvent(new Event('resize'))
      vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS)
    })
    expect(mocks.resize).toHaveBeenCalledWith(120, 40)
    mocks.status = 'connected'
    rerender(<PodExecTerminal {...props} />)
    expect(mocks.focus).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'terminal.disconnect' }))
    expect(mocks.disconnect).toHaveBeenCalledTimes(1)
    act(() => window.dispatchEvent(new Event('resize')))
    unmount()
    act(() => vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS))
    expect(mocks.resize).toHaveBeenCalledTimes(1)
    expect(mocks.disconnectObserver).toHaveBeenCalledTimes(1)
    expect(mocks.inputDispose).toHaveBeenCalledTimes(1)
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
  })
})
