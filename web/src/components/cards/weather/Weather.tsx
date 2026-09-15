import { useState, useRef } from 'react'
import {
  Cloud, Wind, Droplets, Gauge, Eye,
  MapPin, Search as SearchIcon,
  ExternalLink, Loader2
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WeatherAnimation, getWeatherCondition } from './WeatherAnimation'
import { WeatherSearch } from './WeatherSearch'
import { WeatherForecast } from './WeatherForecast'
import { WeatherHourly } from './WeatherHourly'
import { useWeatherData } from './useWeatherData'
import { useCardLoadingState } from '../CardDataContext'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import type { WeatherConfig } from './types'
import { DEFAULT_FORECAST_LENGTH } from './Weather.constants'

export function Weather({ config }: { config?: WeatherConfig }) {
  const { t } = useTranslation('common')
  const [units, setUnits] = useState<'F' | 'C'>(config?.units || 'F')
  const [forecastLength, setForecastLength] = useState<2 | 7 | 14>(config?.forecastLength || DEFAULT_FORECAST_LENGTH)
  const [showSettings, setShowSettings] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const hourlyScrollRef = useRef<HTMLDivElement>(null)

  const {
    currentLocation,
    savedLocations,
    weatherData,
    isLoading,
    isRefreshing,
    isFailed,
    isDemoFallback,
    lastRefresh,
    refetch,
    selectCity,
    saveCurrentLocation,
    removeSavedLocation,
    loadSavedLocation,
  } = useWeatherData(units, forecastLength)

  const currentWeather = weatherData.current
  const forecast = weatherData.forecast
  const hourlyForecast = weatherData.hourly
  const effectiveIsDemoData = isDemoFallback && !isLoading
  // #6219: pass isFailed through so CardWrapper enters its error render path
  // immediately on a failed fetch instead of waiting for CARD_LOADING_TIMEOUT_MS.
  const hasData = !!currentWeather
  useCardLoadingState({ isLoading: isLoading && !hasData, isRefreshing, hasAnyData: hasData, isDemoData: effectiveIsDemoData, isFailed, lastRefresh })

  // Get current weather condition
  const currentCondition = currentWeather ? getWeatherCondition(currentWeather.weatherCode) : null
  const CurrentIcon = currentCondition?.icon || Cloud

  // Get appropriate gradient based on time of day
  const backgroundGradient = currentCondition
    ? (currentWeather?.isDaytime ? currentCondition.dayGradient : currentCondition.nightGradient)
    : 'from-gray-400 to-gray-600'

  // Wind speed unit
  const windSpeedUnit = units === 'F' ? 'mph' : 'km/h'

  // Check if current location is saved
  const isCurrentLocationSaved = savedLocations.some(loc => loc.id === currentLocation.id)

  if (isLoading && !currentWeather) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">Loading weather...</span>
      </div>
    )
  }

  if (isFailed && !currentWeather) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card">
        <Cloud className="w-8 h-8 text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">Failed to load weather data</span>
        <button
          onClick={() => refetch()}
          className="mt-2 px-3 py-1 text-sm rounded-lg bg-primary/20 text-primary hover:bg-primary/30"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${showSettings ? 'bg-primary/20 text-primary' : 'hover:bg-secondary/50 text-muted-foreground'}`}
        >
          <SearchIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Change Location</span>
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <WeatherSearch
          currentLocation={currentLocation}
          savedLocations={savedLocations}
          isCurrentLocationSaved={isCurrentLocationSaved}
          onSelectCity={selectCity}
          onSaveCurrentLocation={saveCurrentLocation}
          onRemoveSavedLocation={removeSavedLocation}
          onLoadSavedLocation={loadSavedLocation}
          units={units}
          onUnitsChange={setUnits}
          forecastLength={forecastLength}
          onForecastLengthChange={setForecastLength}
        />
      )}

      {/* Main Weather Display */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-2">
        {/* Hero Section */}
        {currentWeather && (
          <div
            key={`weather-hero-${currentLocation.id}`}
            className={`relative rounded-3xl bg-linear-to-b ${backgroundGradient} overflow-hidden shadow-lg`}
          >
            <div className="absolute inset-0 bg-black/20 z-0"></div>

            {/* Weather Animation */}
            <WeatherAnimation weatherCode={currentWeather.weatherCode} isDaytime={currentWeather.isDaytime} windSpeed={currentWeather.windSpeed} />

            <div className="relative z-10 text-white p-4">
              {/* Location */}
              <div className="flex items-center justify-center gap-2 mb-1">
                <MapPin className="w-4 h-4" />
                <h2 className="text-base font-semibold">{currentLocation.cityName}</h2>
              </div>

              {/* Large Temperature */}
              <div className="text-center">
                <div className="text-7xl font-light tracking-tight">
                  {currentWeather.temperature}°
                </div>
                <div className="flex items-center justify-center gap-2 text-lg mt-1">
                  <CurrentIcon className="w-5 h-5" />
                  <span>{currentCondition?.label}</span>
                </div>
                {forecast[0] && (
                  <div className="text-sm opacity-90 mt-1">
                    H:{forecast[0].tempHigh}° L:{forecast[0].tempLow}°
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quick location switcher */}
        {savedLocations.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent">
            {savedLocations.map((location) => {
              const isCurrentLoc = location.id === currentLocation.id
              return (
                <button
                  key={location.id}
                  onClick={() => loadSavedLocation(location)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors border ${
                    isCurrentLoc
                      ? 'bg-primary/20 text-primary border-primary/30'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground border-border/30'
                  }`}
                >
                  <span className="font-medium">{location.cityName.split(',')[0]}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Hourly Forecast */}
        <WeatherHourly hourlyForecast={hourlyForecast} hourlyScrollRef={hourlyScrollRef} />

        {/* Daily Forecast */}
        <WeatherForecast
          forecast={forecast}
          forecastLength={forecastLength}
          expandedDay={expandedDay}
          onToggleDay={setExpandedDay}
        />

        {/* Current Conditions Grid */}
        {currentWeather && (
          <div className="grid grid-cols-2 gap-3">
            {/* Feels Like */}
            <div className="rounded-2xl bg-secondary border border-border p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Gauge className="w-3 h-3" />
                <span>{t('weather.feelsLike')}</span>
              </div>
              <div className="text-3xl font-semibold mb-1">
                {currentWeather.feelsLike}°
              </div>
              <div className="text-sm text-muted-foreground">
                {currentWeather.feelsLike > currentWeather.temperature ? t('weather.warmer') : currentWeather.feelsLike < currentWeather.temperature ? t('weather.cooler') : t('weather.sameAsActual')}
              </div>
            </div>

            {/* Humidity */}
            <div className="rounded-2xl bg-secondary border border-border p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Droplets className="w-3 h-3" />
                <span>{t('weather.humidity')}</span>
              </div>
              <div className="text-3xl font-semibold mb-1">
                {currentWeather.humidity}%
              </div>
              <div className="text-sm text-muted-foreground">
                {currentWeather.humidity > 70 ? t('weather.humidityHigh') : currentWeather.humidity > 40 ? t('weather.humidityModerate') : t('weather.humidityLow')}
              </div>
            </div>

            {/* Wind */}
            <div className="rounded-2xl bg-secondary border border-border p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Wind className="w-3 h-3" />
                <span>{t('weather.wind')}</span>
              </div>
              <div className="text-3xl font-semibold mb-1">
                {currentWeather.windSpeed}
              </div>
              <div className="text-sm text-muted-foreground">
                {windSpeedUnit}
              </div>
            </div>

            {/* Condition */}
            <div className="rounded-2xl bg-secondary border border-border p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Eye className="w-3 h-3" />
                <span>{t('weather.condition')}</span>
              </div>
              <div className="text-xl font-semibold mb-1">
                {currentCondition?.label}
              </div>
              <div className="text-sm text-muted-foreground">
                {currentWeather.isDaytime ? 'Daytime' : 'Nighttime'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border/30 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-y-2">
        <a
          href="https://open-meteo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          Weather data from Open-Meteo
          <ExternalLink className="w-3 h-3" />
        </a>
        <RefreshIndicator
          isRefreshing={isRefreshing}
          lastUpdated={lastRefresh ? new Date(lastRefresh) : null}
          size="xs"
          showLabel={true}
        />
      </div>
    </div>
  )
}
