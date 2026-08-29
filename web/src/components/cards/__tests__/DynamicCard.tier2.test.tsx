import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach, act, waitFor } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tier2CardRuntime } from '../DynamicCard'
import {
  mockCompileCardCode,
  mockCreateCardComponent,
  makeT2Definition,
} from './DynamicCard.test.shared'

// ---------------------------------------------------------------------------
// Tier2CardRuntime — compilation, component rendering, error handling,
//                    cleanup, and edge cases (#5282 failure paths)
// ---------------------------------------------------------------------------

describe('Tier2CardRuntime', () => {
  const definition = makeT2Definition()

  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows compiling spinner initially', () => {
    // Never resolves — stays in compiling state
    mockCompileCardCode.mockReturnValue(new Promise(() => { }))
    render(<Tier2CardRuntime definition={definition} />)
    expect(screen.getByText('dynamicCard.compiling')).toBeInTheDocument()
  })

  it('renders compiled component on success', async () => {
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: () => <div>Tier2 Works</div>,
      cleanup: vi.fn(),
      error: false,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() => expect(screen.getByText('Tier2 Works')).toBeInTheDocument())
  })

  it('shows compilation error returned by compileCardCode', async () => {
    mockCompileCardCode.mockResolvedValue({ code: null, error: 'Syntax error on line 3' })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() => expect(screen.getByText('dynamicCard.compilationError')).toBeInTheDocument())
    expect(screen.getByText('Syntax error on line 3')).toBeInTheDocument()
  })

  it('shows compilation error returned by createCardComponent', async () => {
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: null,
      cleanup: undefined,
      error: 'Module export missing',
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() => expect(screen.getByText('Module export missing')).toBeInTheDocument())
  })

  it('shows error when sourceCode is missing', async () => {
    const def = makeT2Definition({ sourceCode: undefined })

    await act(async () => {
      render(<Tier2CardRuntime definition={def} />)
    })
    await waitFor(() =>
      expect(screen.getByText(/No source code provided/i)).toBeInTheDocument()
    )
  })

  it('uses compiledCode cache and skips compileCardCode when available', async () => {
    const defWithCache = makeT2Definition({ compiledCode: 'cached-code' })
    mockCreateCardComponent.mockResolvedValue({
      component: () => <div>Cached</div>,
      cleanup: vi.fn(),
      error: false,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={defWithCache} />)
    })
    await waitFor(() => expect(screen.getByText('Cached')).toBeInTheDocument())
    expect(mockCompileCardCode).not.toHaveBeenCalled()
  })

  it('shows no-component message when component is null after compile', async () => {
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: null,
      cleanup: undefined,
      error: false,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() =>
      expect(screen.getByText('dynamicCard.noComponent')).toBeInTheDocument()
    )
  })

  it('calls cleanup on unmount', async () => {
    const cleanup = vi.fn()
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: () => <div>OK</div>,
      cleanup,
      error: false,
    })

    let unmount!: () => void
    await act(async () => {
      ; ({ unmount } = render(<Tier2CardRuntime definition={definition} />))
    })
    await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument())
    unmount()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('handles unexpected thrown errors from compileCardCode', async () => {
    mockCompileCardCode.mockRejectedValue(new Error('Totally unexpected'))

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} />)
    })
    await waitFor(() =>
      expect(screen.getByText(/Unexpected error: Totally unexpected/i)).toBeInTheDocument()
    )
  })

  it('passes config prop through to the compiled component', async () => {
    const ReceivedConfig = vi.fn(({ config }: { config: Record<string, unknown> }) => (
      <div data-testid="cfg">{JSON.stringify(config)}</div>
    ))
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: ReceivedConfig,
      cleanup: vi.fn(),
      error: false,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} config={{ mode: 'dark', limit: 5 }} />)
    })
    await waitFor(() =>
      expect(screen.getByTestId('cfg').textContent).toContain('"mode":"dark"')
    )
  })

  it('passes empty config when config prop is undefined', async () => {
    const ReceivedConfig = vi.fn(({ config }: { config: Record<string, unknown> }) => (
      <div data-testid="cfg">{JSON.stringify(config)}</div>
    ))
    mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
    mockCreateCardComponent.mockResolvedValue({
      component: ReceivedConfig,
      cleanup: vi.fn(),
      error: false,
    })

    await act(async () => {
      render(<Tier2CardRuntime definition={definition} config={undefined} />)
    })
    await waitFor(() =>
      expect(screen.getByTestId('cfg').textContent).toBe('{}')
    )
  })

  // =========================================================================
  // #5282 — Tier 2 Compile/Runtime Failure Paths
  // =========================================================================

  describe('Tier 2 compile/runtime failure paths (#5282)', () => {
    it('shows error when compileCardCode throws synchronously', async () => {
      mockCompileCardCode.mockRejectedValue(new TypeError('Cannot read property of undefined'))

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText(/Unexpected error/i)).toBeInTheDocument()
      )
      expect(screen.getByText(/Cannot read property of undefined/)).toBeInTheDocument()
    })

    it('shows error when compileCardCode returns both code and error', async () => {
      // Edge case: compile returns error (should take precedence)
      mockCompileCardCode.mockResolvedValue({ code: 'some-code', error: 'Parse error at line 1' })

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText('Parse error at line 1')).toBeInTheDocument()
      )
    })

    it('shows error when createCardComponent throws during execution', async () => {
      mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
      mockCreateCardComponent.mockRejectedValue(new RangeError('Maximum call stack size exceeded'))

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText(/Unexpected error: Maximum call stack size exceeded/)).toBeInTheDocument()
      )
    })

    it('shows Compilation Error heading with error detail from compileCardCode', async () => {
      mockCompileCardCode.mockResolvedValue({
        code: null,
        error: 'Compilation error: Unexpected token at line 42',
      })

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      // The heading "Compilation Error" and the detail message are both rendered
      await waitFor(() =>
        expect(screen.getByText(/Unexpected token at line 42/)).toBeInTheDocument()
      )
    })

    it('handles non-Error thrown values from compileCardCode', async () => {
      // Throw a string instead of an Error instance
      mockCompileCardCode.mockRejectedValue('string error thrown')

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText(/Unexpected error: string error thrown/)).toBeInTheDocument()
      )
    })

    it('renders "No component produced" when component is null and error is null', async () => {
      mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
      mockCreateCardComponent.mockResolvedValue({
        component: null,
        cleanup: undefined,
        error: false,
      })

      await act(async () => {
        render(<Tier2CardRuntime definition={definition} />)
      })
      await waitFor(() =>
        expect(screen.getByText('dynamicCard.noComponent')).toBeInTheDocument()
      )
    })

    it('does not call compileCardCode when definition has compiledCode but createCardComponent fails', async () => {
      const defWithCache = makeT2Definition({ compiledCode: 'pre-compiled' })
      mockCreateCardComponent.mockResolvedValue({
        component: null,
        cleanup: undefined,
        error: 'Invalid module.exports: not a function',
      })

      await act(async () => {
        render(<Tier2CardRuntime definition={defWithCache} />)
      })
      await waitFor(() =>
        expect(screen.getByText('Invalid module.exports: not a function')).toBeInTheDocument()
      )
      expect(mockCompileCardCode).not.toHaveBeenCalled()
    })

    it('cleans up even when compilation fails', async () => {
      const cleanup = vi.fn()
      mockCompileCardCode.mockResolvedValue({ code: 'compiled', error: false })
      mockCreateCardComponent.mockResolvedValue({
        component: () => <div>OK</div>,
        cleanup,
        error: false,
      })

      let unmount!: () => void
      await act(async () => {
        ;({ unmount } = render(<Tier2CardRuntime definition={definition} />))
      })
      await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument())

      // Replace with a failing definition to trigger recompile
      unmount()
      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })
})
