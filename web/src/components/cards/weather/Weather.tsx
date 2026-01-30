import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Cloud, Wind, Droplets, Gauge, Eye,
  MapPin, Calendar, Search as SearchIcon, Star, X,
  ExternalLink, ChevronRight, ChevronDown, Loader2
} from 'lucide-react'
import { WeatherAnimation, getWeatherCondition, getConditionColor } from './WeatherAnimation'
import type {
  GeocodingResult,
  ForecastDay,
  HourlyForecast,
  CurrentWeather,
  WeatherConfig,
  SavedLocation,
} from './types'

export function Weather({ config }: { config?: WeatherConfig }) {
  const [units, setUnits] = useState<'F' | 'C'>(config?.units || 'F')
  const [forecastLength, setForecastLength] = useState<2 | 7 | 14>(config?.forecastLength || 7)
  const [, setIsRefreshing] = useState(false)
  const [, setLastRefresh] = useState(new Date())
  const [showSettings, setShowSettings] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hourlyScrollRef = useRef<HTMLDivElement>(null)

  // Current location state - restore from localStorage
  const [currentLocation, setCurrentLocation] = useState<SavedLocation>(() => {
    const saved = localStorage.getItem('weather-current-location')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        // Fall through to default
      }
    }
    return {
      id: 'default',
      cityName: 'New York, NY',
      latitude: 40.7128,
      longitude: -74.006,
    }
  })

  // City search state
  const [citySearchInput, setCitySearchInput] = useState('')
  const [citySearchResults, setCitySearchResults] = useState<GeocodingResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showCityDropdown, setShowCityDropdown] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(() => {
    const saved = localStorage.getItem('weather-saved-locations-v2')
    return saved ? JSON.parse(saved) : []
  })

  // Weather data state
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null)
  const [forecast, setForecast] = useState<ForecastDay[]>([])
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecast[]>([])

  // Save locations to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('weather-saved-locations-v2', JSON.stringify(savedLocations))
  }, [savedLocations])

  // Save current location to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('weather-current-location', JSON.stringify(currentLocation))
  }, [currentLocation])

  // Fetch weather data from Open-Meteo API
  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const tempUnit = units === 'F' ? 'fahrenheit' : 'celsius'
      const windUnit = units === 'F' ? 'mph' : 'kmh'

      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,weather_code,precipitation_probability` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
        `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&forecast_days=${forecastLength}&timezone=auto`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch weather data')
      }

      const data = await response.json()

      // Parse current weather
      setCurrentWeather({
        temperature: Math.round(data.current.temperature_2m),
        weatherCode: data.current.weather_code,
        humidity: data.current.relative_humidity_2m,
        feelsLike: Math.round(data.current.apparent_temperature),
        windSpeed: Math.round(data.current.wind_speed_10m),
        isDaytime: data.current.is_day === 1,
      })

      // Parse daily forecast
      const dailyForecast: ForecastDay[] = data.daily.time.map((date: string, i: number) => {
        const dayDate = new Date(date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const isToday = dayDate.toDateString() === today.toDateString()

        return {
          date,
          dayOfWeek: isToday ? 'Today' : dayDate.toLocaleDateString('en-US', { weekday: 'short' }),
          weatherCode: data.daily.weather_code[i],
          tempHigh: Math.round(data.daily.temperature_2m_max[i]),
          tempLow: Math.round(data.daily.temperature_2m_min[i]),
          precipitation: data.daily.precipitation_probability_max[i] || 0,
        }
      })
      setForecast(dailyForecast)

      // Parse hourly forecast (next 24 hours)
      const now = new Date()
      const currentHourIndex = data.hourly.time.findIndex((t: string) => new Date(t) >= now)
      const hourlyData: HourlyForecast[] = data.hourly.time
        .slice(currentHourIndex, currentHourIndex + 24)
        .map((time: string, i: number) => {
          const idx = currentHourIndex + i
          const hour = new Date(time).getHours()
          return {
            hour: hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
            time: hour,
            temperature: Math.round(data.hourly.temperature_2m[idx]),
            weatherCode: data.hourly.weather_code[idx],
            precipitation: data.hourly.precipitation_probability[idx] || 0,
          }
        })
      setHourlyForecast(hourlyData)

      setLastRefresh(new Date())
    } catch (err) {
      console.error('Weather fetch error:', err)
      setError('Failed to load weather data')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [units, forecastLength])

  // Fetch weather when location or settings change
  useEffect(() => {
    fetchWeather(currentLocation.latitude, currentLocation.longitude)
  }, [currentLocation, fetchWeather])

  // City search with Open-Meteo Geocoding API
  const searchCities = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setCitySearchResults([])
      setShowCityDropdown(false)
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
      )

      if (response.ok) {
        const data = await response.json()
        setCitySearchResults(data.results || [])
        setShowCityDropdown(true)
      } else {
        setCitySearchResults([])
        setShowCityDropdown(false)
      }
    } catch (error) {
      console.error('City search error:', error)
      setCitySearchResults([])
      setShowCityDropdown(false)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounced city search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchCities(citySearchInput)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [citySearchInput, searchCities])

  // Select city from search results
  const selectCity = useCallback((city: GeocodingResult) => {
    const statePart = city.admin1 || city.country
    const formattedName = `${city.name}, ${statePart}`

    setCurrentLocation({
      id: `${city.latitude}-${city.longitude}`,
      cityName: formattedName,
      latitude: city.latitude,
      longitude: city.longitude,
    })
    setCitySearchInput('')
    setShowCityDropdown(false)
    setCitySearchResults([])
  }, [])

  // Save current location
  const saveCurrentLocation = useCallback(() => {
    const exists = savedLocations.some(loc => loc.id === currentLocation.id)
    if (!exists) {
      setSavedLocations(prev => [...prev, currentLocation])
    }
  }, [currentLocation, savedLocations])

  // Remove a saved location
  const removeSavedLocation = useCallback((id: string) => {
    setSavedLocations(prev => prev.filter(loc => loc.id !== id))
  }, [])

  // Load a saved location
  const loadSavedLocation = useCallback((location: SavedLocation) => {
    setCurrentLocation(location)
  }, [])

  // Refresh weather data
  const refreshWeather = useCallback(() => {
    setIsRefreshing(true)
    fetchWeather(currentLocation.latitude, currentLocation.longitude)
  }, [currentLocation, fetchWeather])

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

  if (error && !currentWeather) {
    return (
      <div className="h-full flex flex-col items-center justify-center min-h-card">
        <Cloud className="w-8 h-8 text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">{error}</span>
        <button
          onClick={refreshWeather}
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
      <div className="flex items-center justify-between mb-3">
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
        <div className="mb-3 p-3 rounded-xl bg-secondary/30 backdrop-blur-sm border border-border/30 space-y-3">
          {/* City Search */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Search for a city</label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={citySearchInput}
                onChange={(e) => setCitySearchInput(e.target.value)}
                onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)}
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground placeholder:text-muted-foreground"
                placeholder="Type city name..."
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
              )}

              {/* City Search Dropdown */}
              {showCityDropdown && citySearchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-secondary/95 backdrop-blur-sm border border-border/30 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {citySearchResults.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => selectCity(city)}
                      className="w-full text-left px-3 py-2.5 hover:bg-secondary transition-colors border-b border-border/20 last:border-0"
                    >
                      <div className="text-sm font-medium">{city.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[city.admin1, city.country].filter(Boolean).join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Current Location + Save Button */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <div>
                <div className="text-sm font-medium">{currentLocation.cityName}</div>
                <div className="text-xs text-muted-foreground">Current location</div>
              </div>
            </div>
            {isCurrentLocationSaved ? (
              <button
                onClick={() => removeSavedLocation(currentLocation.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Remove
              </button>
            ) : (
              <button
                onClick={saveCurrentLocation}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
              >
                <Star className="w-3.5 h-3.5" />
                Save
              </button>
            )}
          </div>

          {/* Saved Locations */}
          {savedLocations.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Saved locations</label>
              <div className="space-y-1.5">
                {savedLocations.map((location) => {
                  const isCurrentLoc = location.id === currentLocation.id

                  return (
                    <div
                      key={location.id}
                      className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer ${
                        isCurrentLoc
                          ? 'bg-primary/10 border border-primary/30'
                          : 'bg-secondary/30 hover:bg-secondary/50'
                      }`}
                      onClick={() => !isCurrentLoc && loadSavedLocation(location)}
                    >
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{location.cityName}</div>
                      </div>
                      {!isCurrentLoc && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeSavedLocation(location.id)
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Settings Row */}
          <div className="flex gap-3 pt-2 border-t border-border/30">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Units</label>
              <select
                value={units}
                onChange={(e) => setUnits(e.target.value as 'F' | 'C')}
                className="w-full px-3 py-2 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground"
              >
                <option value="F">°F (Fahrenheit)</option>
                <option value="C">°C (Celsius)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Forecast</label>
              <select
                value={forecastLength}
                onChange={(e) => setForecastLength(Number(e.target.value) as 2 | 7 | 14)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground"
              >
                <option value={2}>2 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Main Weather Display */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-2">
        {/* Hero Section */}
        {currentWeather && (
          <div
            key={`weather-hero-${currentLocation.id}`}
            className={`relative rounded-3xl bg-gradient-to-b ${backgroundGradient} overflow-hidden shadow-lg`}
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
        {hourlyForecast.length > 0 && (
          <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
            <div className="flex items-center gap-2 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Calendar className="w-3 h-3" />
              <span>Hourly Forecast</span>
            </div>
            <div
              ref={hourlyScrollRef}
              className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent"
            >
              {hourlyForecast.map((hour, idx) => {
                const condition = getWeatherCondition(hour.weatherCode)
                const HourIcon = condition.icon
                const isNow = idx === 0

                return (
                  <div
                    key={idx}
                    className="flex flex-col items-center gap-2 min-w-[60px] text-center"
                  >
                    <div className="text-sm font-medium">
                      {isNow ? 'Now' : hour.hour}
                    </div>
                    <HourIcon className={`w-6 h-6 ${getConditionColor(hour.weatherCode)}`} />
                    <div className="text-lg font-semibold">
                      {hour.temperature}°
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Daily Forecast */}
        {forecast.length > 0 && (
          <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
            <div className="flex items-center gap-2 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Calendar className="w-3 h-3" />
              <span>{forecastLength}-Day Forecast</span>
            </div>
            <div className="space-y-1">
              {forecast.map((day, idx) => {
                const condition = getWeatherCondition(day.weatherCode)
                const Icon = condition.icon
                const isExpanded = expandedDay === day.date
                const tempRange = day.tempHigh - day.tempLow
                const minTemp = Math.min(...forecast.map(d => d.tempLow))
                const maxTemp = Math.max(...forecast.map(d => d.tempHigh))
                const totalRange = maxTemp - minTemp || 1
                const leftPercent = ((day.tempLow - minTemp) / totalRange) * 100
                const widthPercent = (tempRange / totalRange) * 100

                return (
                  <div key={day.date}>
                    <button
                      onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                      className="w-full flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-secondary/50 transition-all group"
                    >
                      <div className="w-16 text-left text-sm font-medium">
                        {day.dayOfWeek}
                      </div>

                      <Icon className={`w-6 h-6 ${getConditionColor(day.weatherCode)}`} />

                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-sm text-muted-foreground w-8 text-right">
                          {day.tempLow}°
                        </span>
                        <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden relative">
                          <div
                            className="absolute h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full"
                            style={{
                              left: `${leftPercent}%`,
                              width: `${Math.max(widthPercent, 5)}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8">
                          {day.tempHigh}°
                        </span>
                      </div>

                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 py-3 ml-6 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Condition</span>
                          <span className="font-medium">{condition.label}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Precipitation</span>
                          <span className="font-medium">{day.precipitation}%</span>
                        </div>
                      </div>
                    )}

                    {idx < forecast.length - 1 && (
                      <div className="h-px bg-border/20 mx-2" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Current Conditions Grid */}
        {currentWeather && (
          <div className="grid grid-cols-2 gap-3">
            {/* Feels Like */}
            <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Gauge className="w-3 h-3" />
                <span>Feels Like</span>
              </div>
              <div className="text-3xl font-semibold mb-1">
                {currentWeather.feelsLike}°
              </div>
              <div className="text-sm text-muted-foreground">
                {currentWeather.feelsLike > currentWeather.temperature ? 'Warmer' : currentWeather.feelsLike < currentWeather.temperature ? 'Cooler' : 'Same as actual'}
              </div>
            </div>

            {/* Humidity */}
            <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Droplets className="w-3 h-3" />
                <span>Humidity</span>
              </div>
              <div className="text-3xl font-semibold mb-1">
                {currentWeather.humidity}%
              </div>
              <div className="text-sm text-muted-foreground">
                {currentWeather.humidity > 70 ? 'High' : currentWeather.humidity > 40 ? 'Moderate' : 'Low'}
              </div>
            </div>

            {/* Wind */}
            <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Wind className="w-3 h-3" />
                <span>Wind</span>
              </div>
              <div className="text-3xl font-semibold mb-1">
                {currentWeather.windSpeed}
              </div>
              <div className="text-sm text-muted-foreground">
                {windSpeedUnit}
              </div>
            </div>

            {/* Condition */}
            <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Eye className="w-3 h-3" />
                <span>Condition</span>
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
      <div className="mt-3 pt-2 border-t border-border/30 text-xs text-center text-muted-foreground">
        <a
          href="https://open-meteo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-blue-400 transition-colors"
        >
          Weather data from Open-Meteo
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
