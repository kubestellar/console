import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WeatherSearch } from './WeatherSearch'

const showToast = vi.hoisted(() => vi.fn())
vi.mock('../../ui/Toast', () => ({ useToast: () => ({ showToast }) }))
const demoMode = vi.hoisted(() => ({ value: false }))
vi.mock('../../../hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: demoMode.value }) }))
const translate = vi.hoisted(() => (_key: string, fallback: string) => fallback)
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }))

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); showToast.mockClear(); demoMode.value = false })

it('reports failed city searches instead of silently showing no results', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<WeatherSearch currentLocation={{ id: '1', cityName: 'Paris', latitude: 0, longitude: 0 }} savedLocations={[]} isCurrentLocationSaved={false} onSelectCity={vi.fn()} onSaveCurrentLocation={vi.fn()} onRemoveSavedLocation={vi.fn()} onLoadSavedLocation={vi.fn()} units="C" onUnitsChange={vi.fn()} forecastLength={7} onForecastLengthChange={vi.fn()} />)
  fireEvent.change(screen.getByPlaceholderText('Type city name...'), { target: { value: 'Paris' } })
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('City search failed. Please try again.', 'error'))
})

it('keeps the latest city search busy until it finishes and ignores stale failures', async () => {
  let rejectFirst!: (reason: Error) => void
  let resolveSecond!: (response: { ok: boolean; json: () => Promise<{ results: { id: number; name: string }[] }> }) => void
  const fetchMock = vi.fn()
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve }))
  vi.stubGlobal('fetch', fetchMock)
  render(<WeatherSearch currentLocation={{ id: '1', cityName: 'Paris', latitude: 0, longitude: 0 }} savedLocations={[]} isCurrentLocationSaved={false} onSelectCity={vi.fn()} onSaveCurrentLocation={vi.fn()} onRemoveSavedLocation={vi.fn()} onLoadSavedLocation={vi.fn()} units="C" onUnitsChange={vi.fn()} forecastLength={7} onForecastLengthChange={vi.fn()} />)
  const input = screen.getByPlaceholderText('Type city name...')
  fireEvent.change(input, { target: { value: 'Paris' } })
  await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'))
  fireEvent.change(input, { target: { value: 'London' } })
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  await act(async () => { rejectFirst(new Error('stale failure')) })
  expect(showToast).not.toHaveBeenCalled()
  expect(input).toHaveAttribute('aria-busy', 'true')
  await act(async () => { resolveSecond({ ok: true, json: async () => ({ results: [{ id: 1, name: 'London' }] }) }) })
  expect(input).toHaveAttribute('aria-busy', 'false')
  expect(screen.getByRole('option', { name: /London/ })).toBeInTheDocument()
})

it('does not reopen results when an older search finishes after the input is cleared', async () => {
  let resolveSearch!: (response: { ok: boolean; json: () => Promise<{ results: { id: number; name: string }[] }> }) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveSearch = resolve })))
  render(<WeatherSearch currentLocation={{ id: '1', cityName: 'Paris', latitude: 0, longitude: 0 }} savedLocations={[]} isCurrentLocationSaved={false} onSelectCity={vi.fn()} onSaveCurrentLocation={vi.fn()} onRemoveSavedLocation={vi.fn()} onLoadSavedLocation={vi.fn()} units="C" onUnitsChange={vi.fn()} forecastLength={7} onForecastLengthChange={vi.fn()} />)
  const input = screen.getByPlaceholderText('Type city name...')
  fireEvent.change(input, { target: { value: 'Paris' } })
  await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'true'))
  fireEvent.change(input, { target: { value: '' } })
  await act(async () => { resolveSearch({ ok: true, json: async () => ({ results: [{ id: 1, name: 'Paris' }] }) }) })
  expect(input).toHaveAttribute('aria-busy', 'false')
  expect(screen.queryByRole('option', { name: 'Paris' })).not.toBeInTheDocument()
})

it('does not call the geocoding API in demo mode', async () => {
  demoMode.value = true
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  render(<WeatherSearch currentLocation={{ id: '1', cityName: 'Paris', latitude: 0, longitude: 0 }} savedLocations={[]} isCurrentLocationSaved={false} onSelectCity={vi.fn()} onSaveCurrentLocation={vi.fn()} onRemoveSavedLocation={vi.fn()} onLoadSavedLocation={vi.fn()} units="C" onUnitsChange={vi.fn()} forecastLength={7} onForecastLengthChange={vi.fn()} />)
  fireEvent.change(screen.getByPlaceholderText('Type city name...'), { target: { value: 'Paris' } })
  await new Promise(resolve => setTimeout(resolve, 400))
  expect(fetchMock).not.toHaveBeenCalled()
})
