import { describe, it, expect } from 'vitest'
import type {
  GeocodingResult,
  WeatherCondition,
  ForecastDay,
  HourlyForecast,
  CurrentWeather,
  WeatherConfig,
  SavedLocation,
} from '../weather/types'

describe('weather types structural checks', () => {
  it('GeocodingResult fields are well-typed', () => {
    const sample: GeocodingResult = {
      id: 1,
      name: 'New York',
      latitude: 40.7128,
      longitude: -74.006,
      country: 'US',
    }
    expect(sample.id).toBe(1)
    expect(typeof sample.name).toBe('string')
    expect(typeof sample.latitude).toBe('number')
    expect(typeof sample.longitude).toBe('number')
    expect(typeof sample.country).toBe('string')
  })

  it('ForecastDay fields are well-typed', () => {
    const sample: ForecastDay = {
      date: '2026-06-25',
      dayOfWeek: 'Wed',
      weatherCode: 0,
      tempHigh: 85,
      tempLow: 68,
      precipitation: 0.1,
    }
    expect(typeof sample.date).toBe('string')
    expect(typeof sample.dayOfWeek).toBe('string')
    expect(typeof sample.weatherCode).toBe('number')
    expect(sample.tempHigh).toBeGreaterThanOrEqual(sample.tempLow)
    expect(typeof sample.precipitation).toBe('number')
  })

  it('HourlyForecast fields are well-typed', () => {
    const sample: HourlyForecast = {
      hour: '14:00',
      time: 1719338400,
      temperature: 75,
      weatherCode: 1,
      precipitation: 0,
    }
    expect(typeof sample.hour).toBe('string')
    expect(typeof sample.time).toBe('number')
    expect(typeof sample.temperature).toBe('number')
    expect(typeof sample.weatherCode).toBe('number')
  })

  it('CurrentWeather fields are well-typed', () => {
    const sample: CurrentWeather = {
      temperature: 72,
      weatherCode: 0,
      humidity: 55,
      feelsLike: 74,
      windSpeed: 10,
      isDaytime: true,
    }
    expect(typeof sample.temperature).toBe('number')
    expect(typeof sample.humidity).toBe('number')
    expect(typeof sample.isDaytime).toBe('boolean')
  })

  it('WeatherConfig accepts valid units', () => {
    const configF: WeatherConfig = { zipcode: '10001', units: 'F', forecastLength: 7 }
    const configC: WeatherConfig = { units: 'C', forecastLength: 14 }
    expect(configF.units).toBe('F')
    expect(configC.units).toBe('C')
    expect([2, 7, 14]).toContain(configF.forecastLength)
    expect([2, 7, 14]).toContain(configC.forecastLength)
  })

  it('SavedLocation fields are well-typed', () => {
    const loc: SavedLocation = {
      id: 'loc-1',
      cityName: 'Boston',
      latitude: 42.3601,
      longitude: -71.0589,
    }
    expect(typeof loc.id).toBe('string')
    expect(typeof loc.cityName).toBe('string')
    expect(typeof loc.latitude).toBe('number')
    expect(typeof loc.longitude).toBe('number')
  })

  it('Weather component can be imported from the index', async () => {
    const mod = await import('../weather/index')
    expect(mod.Weather).toBeDefined()
    expect(typeof mod.Weather).toBe('function')
  })
})
