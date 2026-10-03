import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mockSafeRevokeObjectURL,
  tPass,
  makeCard,
  applyUpdater,
} from './dashboardState.actions.setup'
import {
  confirmDeployAction,
  exportDashboardAsFile,
  moveCardToDashboardAction,
  moveCardToNewDashboardAction,
} from '../dashboardState.actions'

describe('confirmDeployAction', () => {
  const basePending = {
    workloadName: 'nginx',
    namespace: 'default',
    sourceCluster: 'src',
    targetClusters: ['t1', 't2'],
    groupName: 'g1',
  }

  it('publishes deploy:started then deploy:result on success', async () => {
    const publish = vi.fn()
    const deployWorkload = vi.fn(async (_args, cb) => {
      cb.onSuccess({
        success: true,
        message: 'ok',
        deployedTo: ['t1', 't2'],
      })
    })
    await confirmDeployAction({
      pendingDeploy: basePending,
      deployWorkload,
      publishCardEvent: publish,
      showToast: vi.fn(),
      t: tPass,
    })
    expect(publish).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'deploy:started' }))
    expect(publish).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'deploy:result',
      payload: expect.objectContaining({ success: true, message: 'ok', deployedTo: ['t1', 't2'] }),
    }))
    // Both events share the same deploy id
    expect(publish.mock.calls[0][0].payload.id).toBe(publish.mock.calls[1][0].payload.id)
  })

  it('defaults success=true when onSuccess payload omits it', async () => {
    const publish = vi.fn()
    const deployWorkload = vi.fn(async (_args, cb) => { cb.onSuccess({}) })
    await confirmDeployAction({
      pendingDeploy: basePending,
      deployWorkload,
      publishCardEvent: publish,
      showToast: vi.fn(),
      t: tPass,
    })
    expect(publish.mock.calls[1][0].payload).toMatchObject({ success: true, message: '' })
  })

  it('shows an error toast when deployWorkload throws', async () => {
    const publish = vi.fn()
    const showToast = vi.fn()
    const deployWorkload = vi.fn(async () => { throw new Error('unreachable') })
    await confirmDeployAction({
      pendingDeploy: basePending,
      deployWorkload,
      publishCardEvent: publish,
      showToast,
      t: tPass,
    })
    // deploy:started still fired before the throw
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'deploy:started' }))
    // deploy:result never fired
    expect(publish).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'deploy:result' }))
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('unreachable'), 'error')
  })
})

// ─── exportDashboardAsFile ─────────────────────────────────────────────────

describe('exportDashboardAsFile', () => {
  let clickSpy: ReturnType<typeof vi.fn>
  let origCreateObjectURL: typeof URL.createObjectURL
  let origCreateElement: typeof document.createElement
  let capturedDownload: string

  beforeEach(() => {
    clickSpy = vi.fn()
    capturedDownload = ''
    origCreateObjectURL = URL.createObjectURL
    origCreateElement = document.createElement.bind(document)
    URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL
    document.createElement = ((tag: string) => {
      if (tag === 'a') {
        const anchor = { href: '', click: clickSpy } as unknown as HTMLAnchorElement & { download: string }
        Object.defineProperty(anchor, 'download', {
          set(v: string) { capturedDownload = v },
          get() { return capturedDownload },
          configurable: true,
        })
        return anchor
      }
      return origCreateElement(tag)
    }) as typeof document.createElement
  })

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL
    document.createElement = origCreateElement
  })

  it('serialises data, clicks download link, and shows success toast', async () => {
    const showToast = vi.fn()
    const exportDashboard = vi.fn(async () => ({ id: 'd1', name: 'My Dash' }))
    await exportDashboardAsFile('d1', 'My Cool Dashboard', exportDashboard, showToast, tPass)
    expect(exportDashboard).toHaveBeenCalledWith('d1')
    expect(clickSpy).toHaveBeenCalled()
    expect(mockSafeRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    expect(showToast).toHaveBeenCalledWith('Dashboard exported', 'success')
  })

  it('sanitises the filename (spaces → dashes, lowercased)', async () => {
    const showToast = vi.fn()
    const exportDashboard = vi.fn(async () => ({ ok: true }))
    await exportDashboardAsFile('d1', 'My  Cool DASH', exportDashboard, showToast, tPass)
    expect(capturedDownload).toBe('my-cool-dash.json')
  })

  it('falls back to "dashboard" when name is empty', async () => {
    const showToast = vi.fn()
    const exportDashboard = vi.fn(async () => ({}))
    await exportDashboardAsFile('d1', '', exportDashboard, showToast, tPass)
    expect(capturedDownload).toBe('dashboard.json')
  })

  it('shows error toast when exportDashboard throws', async () => {
    const showToast = vi.fn()
    const exportDashboard = vi.fn(async () => { throw new Error('boom') })
    await exportDashboardAsFile('d1', 'X', exportDashboard, showToast, tPass)
    expect(showToast).toHaveBeenCalledWith('Failed to export dashboard', 'error')
  })
})

// ─── moveCardToDashboardAction / moveCardToNewDashboardAction ─────────────

describe('moveCardToDashboardAction', () => {
  const baseDeps = () => ({
    moveCardToDashboard: vi.fn(async () => {}),
    createDashboard: vi.fn(async () => ({ id: 'new1', name: 'New' })),
    snapshot: vi.fn(),
    localCards: [makeCard({ id: 'a' }), makeCard({ id: 'b' })],
    setLocalCards: vi.fn(),
    showToast: vi.fn(),
    t: tPass,
  })

  it('moves the card, removes it locally, and shows success toast', async () => {
    const deps = baseDeps()
    await moveCardToDashboardAction('a', 'target-dash', 'Target', deps)
    expect(deps.moveCardToDashboard).toHaveBeenCalledWith('a', 'target-dash')
    expect(deps.snapshot).toHaveBeenCalledWith(deps.localCards)
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result.map(c => c.id)).toEqual(['b'])
    expect(deps.showToast).toHaveBeenCalledWith('Card moved to "Target"', 'success')
  })

  it('shows failure toast and does not mutate on error', async () => {
    const deps = baseDeps()
    deps.moveCardToDashboard = vi.fn(async () => { throw new Error('nope') })
    await moveCardToDashboardAction('a', 'target-dash', 'Target', deps)
    expect(deps.setLocalCards).not.toHaveBeenCalled()
    expect(deps.showToast).toHaveBeenCalledWith('Failed to move card', 'error')
  })
})

describe('moveCardToNewDashboardAction', () => {
  const baseDeps = () => ({
    moveCardToDashboard: vi.fn(async () => {}),
    createDashboard: vi.fn(async () => ({ id: 'new1', name: 'Shiny' })),
    snapshot: vi.fn(),
    localCards: [makeCard({ id: 'a' })],
    setLocalCards: vi.fn(),
    showToast: vi.fn(),
    t: tPass,
  })

  it('creates a new dashboard, moves card, removes locally, toasts', async () => {
    const deps = baseDeps()
    await moveCardToNewDashboardAction('a', deps)
    expect(deps.createDashboard).toHaveBeenCalledWith('New Dashboard')
    expect(deps.moveCardToDashboard).toHaveBeenCalledWith('a', 'new1')
    const result = applyUpdater(deps.setLocalCards.mock.calls[0][0], deps.localCards)
    expect(result).toEqual([])
    expect(deps.showToast).toHaveBeenCalledWith('Card moved to "Shiny"', 'success')
  })

  it('no-ops when createDashboard returns no id', async () => {
    const deps = baseDeps()
    deps.createDashboard = vi.fn(async () => undefined)
    await moveCardToNewDashboardAction('a', deps)
    expect(deps.moveCardToDashboard).not.toHaveBeenCalled()
    expect(deps.setLocalCards).not.toHaveBeenCalled()
    expect(deps.showToast).not.toHaveBeenCalled()
  })

  it('toasts failure when createDashboard throws', async () => {
    const deps = baseDeps()
    deps.createDashboard = vi.fn(async () => { throw new Error('nope') })
    await moveCardToNewDashboardAction('a', deps)
    expect(deps.showToast).toHaveBeenCalledWith('Failed to create dashboard', 'error')
  })
})
