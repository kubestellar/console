import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WeatherSearch } from './WeatherSearch'

const showToast = vi.hoisted(() => vi.fn())
vi.mock('../../ui/Toast', () => ({ useToast: () => ({ showToast }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }))

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); showToast.mockClear() })

it('reports failed city searches instead of silently showing no results', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<WeatherSearch currentLocation={{ id: '1', cityName: 'Paris', latitude: 0, longitude: 0 }} savedLocations={[]} isCurrentLocationSaved={false} onSelectCity={vi.fn()} onSaveCurrentLocation={vi.fn()} onRemoveSavedLocation={vi.fn()} onLoadSavedLocation={vi.fn()} units="C" onUnitsChange={vi.fn()} forecastLength={7} onForecastLengthChange={vi.fn()} />)
  fireEvent.change(screen.getByPlaceholderText('Type city name...'), { target: { value: 'Paris' } })
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('City search failed. Please try again.', 'error'))
})
