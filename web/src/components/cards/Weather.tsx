import { useState, useMemo, useEffect, useCallback } from 'react'
import { Cloud, CloudRain, CloudSnow, Sun, Wind, Droplets, Gauge, Eye, MapPin, Calendar, Search as SearchIcon, Settings, Star, X, ExternalLink } from 'lucide-react'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

// Mock weather data - in production would integrate with weather API
interface WeatherCondition {
  type: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy'
  icon: typeof Sun
  label: string
  gradient: string
}

const WEATHER_CONDITIONS: Record<string, WeatherCondition> = {
  sunny: { type: 'sunny', icon: Sun, label: 'Sunny', gradient: 'from-yellow-400 to-orange-500' },
  cloudy: { type: 'cloudy', icon: Cloud, label: 'Cloudy', gradient: 'from-gray-400 to-gray-600' },
  rainy: { type: 'rainy', icon: CloudRain, label: 'Rainy', gradient: 'from-blue-400 to-blue-700' },
  snowy: { type: 'snowy', icon: CloudSnow, label: 'Snowy', gradient: 'from-blue-100 to-blue-300' },
  windy: { type: 'windy', icon: Wind, label: 'Windy', gradient: 'from-cyan-400 to-cyan-600' },
}

interface ForecastDay {
  date: string
  dayOfWeek: string
  condition: keyof typeof WEATHER_CONDITIONS
  tempHigh: number
  tempLow: number
  precipitation: number
  humidity: number
  windSpeed: number
}

interface WeatherConfig {
  zipcode?: string
  units?: 'F' | 'C'
  forecastLength?: 2 | 7 | 14
}

interface SavedLocation {
  zipcode: string
  cityName: string
  temperature: number
  condition: keyof typeof WEATHER_CONDITIONS
}

type SortByOption = 'date' | 'temperature' | 'precipitation'

const SORT_OPTIONS = [
  { value: 'date' as const, label: 'Date' },
  { value: 'temperature' as const, label: 'Temperature' },
  { value: 'precipitation' as const, label: 'Precipitation' },
]

// Simple hash function to seed random data based on zipcode
function hashZipcode(zipcode: string): number {
  let hash = 0
  for (let i = 0; i < zipcode.length; i++) {
    hash = ((hash << 5) - hash) + zipcode.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// Seeded random number generator
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

// Get city name for zipcode (mock mapping - in production use real API)
function getCityName(zipcode: string): string {
  const cityMap: Record<string, string> = {
    '10001': 'New York, NY',
    '10512': 'Carmel, NY',
    '90210': 'Beverly Hills, CA',
    '60601': 'Chicago, IL',
    '33101': 'Miami, FL',
    '02101': 'Boston, MA',
    '98101': 'Seattle, WA',
    '94102': 'San Francisco, CA',
  }
  return cityMap[zipcode] || `Area ${zipcode}`
}

// Generate mock weather data with seeded randomness based on zipcode
function generateMockForecast(days: number, units: 'F' | 'C', zipcode: string): ForecastDay[] {
  const conditions: Array<keyof typeof WEATHER_CONDITIONS> = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy']
  const forecast: ForecastDay[] = []
  const today = new Date()
  const seed = hashZipcode(zipcode)

  for (let i = 0; i < days; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const conditionIndex = Math.floor(seededRandom(seed + i) * conditions.length)
    const condition = conditions[conditionIndex]
    
    // Temperature based on condition
    let baseTemp = units === 'F' ? 72 : 22
    if (condition === 'snowy') baseTemp = units === 'F' ? 28 : -2
    if (condition === 'rainy') baseTemp = units === 'F' ? 55 : 13
    if (condition === 'sunny') baseTemp = units === 'F' ? 82 : 28
    
    forecast.push({
      date: date.toISOString().split('T')[0],
      dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
      condition,
      tempHigh: baseTemp + Math.floor(seededRandom(seed + i + 100) * 10),
      tempLow: baseTemp - Math.floor(seededRandom(seed + i + 200) * 15) - 5,
      precipitation: condition === 'rainy' || condition === 'snowy' ? Math.floor(seededRandom(seed + i + 300) * 80) + 20 : Math.floor(seededRandom(seed + i + 300) * 30),
      humidity: Math.floor(seededRandom(seed + i + 400) * 40) + 40,
      windSpeed: condition === 'windy' ? Math.floor(seededRandom(seed + i + 500) * 20) + 15 : Math.floor(seededRandom(seed + i + 500) * 15) + 2,
    })
  }

  return forecast
}

function getCurrentWeather(units: 'F' | 'C', zipcode: string) {
  const conditions: Array<keyof typeof WEATHER_CONDITIONS> = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy']
  const seed = hashZipcode(zipcode)
  const conditionIndex = Math.floor(seededRandom(seed) * conditions.length)
  const condition = conditions[conditionIndex]
  
  let baseTemp = units === 'F' ? 72 : 22
  if (condition === 'snowy') baseTemp = units === 'F' ? 28 : -2
  if (condition === 'rainy') baseTemp = units === 'F' ? 55 : 13
  if (condition === 'sunny') baseTemp = units === 'F' ? 82 : 28

  return {
    condition,
    temperature: baseTemp + Math.floor(seededRandom(seed + 1000) * 5),
    humidity: Math.floor(seededRandom(seed + 2000) * 40) + 40,
    windSpeed: condition === 'windy' ? Math.floor(seededRandom(seed + 3000) * 20) + 15 : Math.floor(seededRandom(seed + 3000) * 15) + 2,
    uvIndex: condition === 'sunny' ? Math.floor(seededRandom(seed + 4000) * 5) + 6 : Math.floor(seededRandom(seed + 4000) * 4) + 1,
  }
}

// Animated weather background components
function WeatherBackground({ condition }: { condition: keyof typeof WEATHER_CONDITIONS }) {
  const particles = Array.from({ length: condition === 'snowy' || condition === 'rainy' ? 50 : 0 })

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
      {condition === 'sunny' && (
        <div className="absolute top-4 right-4 w-20 h-20 rounded-full bg-yellow-400 weather-sun" />
      )}
      
      {condition === 'cloudy' && (
        <>
          <div className="absolute top-6 left-10 w-24 h-12 rounded-full bg-gray-400 weather-cloud" style={{ animationDuration: '45s' }} />
          <div className="absolute top-12 left-32 w-32 h-16 rounded-full bg-gray-500 weather-cloud" style={{ animationDuration: '60s', animationDelay: '5s' }} />
        </>
      )}
      
      {condition === 'rainy' && particles.map((_, i) => (
        <div
          key={i}
          className="absolute w-0.5 h-4 bg-blue-400 weather-rain"
          style={{
            left: `${Math.random() * 100}%`,
            animationDuration: `${Math.random() * 0.5 + 0.5}s`,
            animationDelay: `${Math.random() * 2}s`,
          }}
        />
      ))}
      
      {condition === 'snowy' && particles.map((_, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 bg-white rounded-full weather-snow"
          style={{
            left: `${Math.random() * 100}%`,
            animationDuration: `${Math.random() * 3 + 3}s`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}
      
      {condition === 'windy' && (
        <>
          <div className="absolute top-1/4 left-0 w-full h-1 bg-cyan-400/40 weather-wind" style={{ animationDelay: '0s' }} />
          <div className="absolute top-1/2 left-0 w-full h-1 bg-cyan-400/40 weather-wind" style={{ animationDelay: '0.3s' }} />
          <div className="absolute top-3/4 left-0 w-full h-1 bg-cyan-400/40 weather-wind" style={{ animationDelay: '0.6s' }} />
        </>
      )}
    </div>
  )
}

export function Weather({ config }: { config?: WeatherConfig }) {
  const [zipcode, setZipcode] = useState(config?.zipcode || '10001')
  const [units, setUnits] = useState<'F' | 'C'>(config?.units || 'F')
  const [forecastLength, setForecastLength] = useState<2 | 7 | 14>(config?.forecastLength || 7)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortByOption>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>('unlimited')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [showConfig, setShowConfig] = useState(false)
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(() => {
    // Load saved locations from localStorage
    const saved = localStorage.getItem('weather-saved-locations')
    return saved ? JSON.parse(saved) : []
  })
  const [showSavedLocations, setShowSavedLocations] = useState(false)

  // Generate forecast data
  const [forecast, setForecast] = useState<ForecastDay[]>(() => generateMockForecast(forecastLength, units, zipcode))
  const [currentWeather, setCurrentWeather] = useState(() => getCurrentWeather(units, zipcode))

  // Save locations to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('weather-saved-locations', JSON.stringify(savedLocations))
  }, [savedLocations])

  // Save current location
  const saveCurrentLocation = useCallback(() => {
    const newLocation: SavedLocation = {
      zipcode,
      cityName: getCityName(zipcode),
      temperature: currentWeather.temperature,
      condition: currentWeather.condition,
    }
    
    // Don't save if already saved
    if (savedLocations.some(loc => loc.zipcode === zipcode)) {
      return
    }
    
    setSavedLocations(prev => [...prev, newLocation])
  }, [zipcode, currentWeather, savedLocations])

  // Remove a saved location
  const removeSavedLocation = useCallback((zipcodeToRemove: string) => {
    setSavedLocations(prev => prev.filter(loc => loc.zipcode !== zipcodeToRemove))
  }, [])

  // Load a saved location
  const loadSavedLocation = useCallback((savedZipcode: string) => {
    setZipcode(savedZipcode)
    setShowSavedLocations(false)
  }, [])

  // Refresh weather data
  const refreshWeather = useCallback(() => {
    setIsRefreshing(true)
    setTimeout(() => {
      setForecast(generateMockForecast(forecastLength, units, zipcode))
      setCurrentWeather(getCurrentWeather(units, zipcode))
      setLastRefresh(new Date())
      setIsRefreshing(false)
    }, 1000)
  }, [forecastLength, units, zipcode])

  // Auto-refresh on config changes (including zipcode)
  useEffect(() => {
    refreshWeather()
  }, [refreshWeather])

  // Filter and sort forecast
  const filteredAndSorted = useMemo(() => {
    let filtered = forecast

    // Filter by search query (condition type)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(day => 
        WEATHER_CONDITIONS[day.condition].label.toLowerCase().includes(query) ||
        day.dayOfWeek.toLowerCase().includes(query)
      )
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let result = 0
      if (sortBy === 'date') {
        result = new Date(a.date).getTime() - new Date(b.date).getTime()
      } else if (sortBy === 'temperature') {
        result = b.tempHigh - a.tempHigh
      } else if (sortBy === 'precipitation') {
        result = b.precipitation - a.precipitation
      }
      return sortDirection === 'asc' ? result : -result
    })

    return sorted
  }, [forecast, searchQuery, sortBy, sortDirection])

  // Pagination
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: paginatedForecast,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  const currentCondition = WEATHER_CONDITIONS[currentWeather.condition]
  const CurrentIcon = currentCondition.icon

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-muted-foreground">
            Weather for {getCityName(zipcode)}
          </span>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-1 rounded hover:bg-secondary/50 transition-colors"
            title="Configure location and units"
          >
            <Settings className="w-3 h-3 text-muted-foreground" />
          </button>
          <button
            onClick={saveCurrentLocation}
            className={`p-1 rounded hover:bg-secondary/50 transition-colors ${
              savedLocations.some(loc => loc.zipcode === zipcode) ? 'text-yellow-400' : 'text-muted-foreground'
            }`}
            title={savedLocations.some(loc => loc.zipcode === zipcode) ? 'Location saved' : 'Save this location'}
          >
            <Star className="w-3 h-3" fill={savedLocations.some(loc => loc.zipcode === zipcode) ? 'currentColor' : 'none'} />
          </button>
        </div>
        <RefreshButton
          isRefreshing={isRefreshing}
          lastRefresh={lastRefresh}
          onRefresh={refreshWeather}
        />
      </div>

      {/* Configuration Panel */}
      {showConfig && (
        <div className="mb-4 p-3 rounded-lg bg-secondary/30 border border-border/30 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Zipcode</label>
            <input
              type="text"
              value={zipcode}
              onChange={(e) => setZipcode(e.target.value)}
              className="w-full px-2 py-1 text-sm rounded bg-secondary border border-border/30 text-foreground"
              placeholder="Enter zipcode"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Units</label>
              <select
                value={units}
                onChange={(e) => setUnits(e.target.value as 'F' | 'C')}
                className="w-full px-2 py-1 text-sm rounded bg-secondary border border-border/30 text-foreground"
              >
                <option value="F">Fahrenheit (°F)</option>
                <option value="C">Celsius (°C)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Forecast Length</label>
              <select
                value={forecastLength}
                onChange={(e) => setForecastLength(Number(e.target.value) as 2 | 7 | 14)}
                className="w-full px-2 py-1 text-sm rounded bg-secondary border border-border/30 text-foreground"
              >
                <option value={2}>2 Days</option>
                <option value={7}>7 Days</option>
                <option value={14}>14 Days</option>
              </select>
            </div>
          </div>
          
          {/* Saved Locations */}
          {savedLocations.length > 0 && (
            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Saved Locations</label>
                <button
                  onClick={() => setShowSavedLocations(!showSavedLocations)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {showSavedLocations ? 'Hide' : 'Show'} ({savedLocations.length})
                </button>
              </div>
              {showSavedLocations && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {savedLocations.map((location) => {
                    const condition = WEATHER_CONDITIONS[location.condition]
                    const Icon = condition.icon
                    const colorClass = {
                      'sunny': 'text-yellow-400',
                      'cloudy': 'text-gray-400',
                      'rainy': 'text-blue-400',
                      'snowy': 'text-blue-200',
                      'windy': 'text-cyan-400',
                    }[location.condition] || 'text-gray-400'
                    
                    return (
                      <div
                        key={location.zipcode}
                        className="flex items-center justify-between p-2 rounded bg-secondary/50 hover:bg-secondary transition-colors group"
                      >
                        <button
                          onClick={() => loadSavedLocation(location.zipcode)}
                          className="flex items-center gap-2 flex-1 text-left"
                        >
                          <Icon className={`w-4 h-4 ${colorClass}`} />
                          <div className="flex-1">
                            <div className="text-xs font-medium text-foreground">{location.cityName}</div>
                            <div className="text-xs text-muted-foreground">{location.temperature}°{units}</div>
                          </div>
                        </button>
                        <button
                          onClick={() => removeSavedLocation(location.zipcode)}
                          className="p-1 rounded hover:bg-destructive/20 transition-colors opacity-0 group-hover:opacity-100"
                          title="Remove location"
                        >
                          <X className="w-3 h-3 text-destructive" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Current Weather with Animated Background */}
      <div className={`relative mb-4 p-4 rounded-lg bg-gradient-to-br ${currentCondition.gradient} overflow-hidden`}>
        <WeatherBackground condition={currentWeather.condition} />
        
        <div className="relative z-10 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CurrentIcon className="w-8 h-8" />
              <span className="text-lg font-semibold">{currentCondition.label}</span>
            </div>
            <div className="text-4xl font-bold">{currentWeather.temperature}°{units}</div>
          </div>
          
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="flex items-center gap-1.5" title="Humidity">
              <Droplets className="w-4 h-4" />
              <span>{currentWeather.humidity}%</span>
            </div>
            <div className="flex items-center gap-1.5" title="Wind Speed">
              <Wind className="w-4 h-4" />
              <span>{currentWeather.windSpeed} mph</span>
            </div>
            <div className="flex items-center gap-1.5" title="UV Index">
              <Eye className="w-4 h-4" />
              <span>UV {currentWeather.uvIndex}</span>
            </div>
            <div className="flex items-center gap-1.5" title="Pressure">
              <Gauge className="w-4 h-4" />
              <span>29.9 in</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Controls */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by condition..."
            className="w-full pl-7 pr-2 py-1.5 text-sm rounded bg-secondary/50 border border-border/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border"
          />
        </div>
        <CardControls
          limit={limit}
          onLimitChange={setLimit}
          sortBy={sortBy}
          sortOptions={SORT_OPTIONS}
          onSortChange={setSortBy}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
        />
      </div>

      {/* Forecast List */}
      <div className="flex-1 overflow-x-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pb-2">
          {paginatedForecast.map((day) => {
            const condition = WEATHER_CONDITIONS[day.condition]
            const Icon = condition.icon
            
            // Map condition types to color classes (Tailwind-safe)
            const colorClass = {
              'sunny': 'text-yellow-400',
              'cloudy': 'text-gray-400',
              'rainy': 'text-blue-400',
              'snowy': 'text-blue-200',
              'windy': 'text-cyan-400',
            }[day.condition] || 'text-gray-400'
            
            return (
              <div
                key={day.date}
                className="p-3 rounded-lg border border-border/30 bg-secondary/30 hover:bg-secondary/50 transition-all"
              >
                 <div className="text-center space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{day.dayOfWeek}</span>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <a
                        href={`https://www.open-meteo.com/?date=${day.date}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-400 transition-colors"
                        title="View detailed forecast"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                  
                  <div className="flex justify-center">
                    <Icon className={`w-8 h-8 ${colorClass}`} />
                  </div>
                  
                  <div className="text-sm font-medium text-foreground">
                    {day.tempHigh}° / {day.tempLow}°
                  </div>
                  
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Droplets className="w-3 h-3" />
                        {day.precipitation}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Wind className="w-3 h-3" />
                        {day.windSpeed} mph
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border/50 text-xs text-muted-foreground">
        <div className="text-center mb-1">
          Showing {paginatedForecast.length} of {totalItems} days • Last updated {lastRefresh.toLocaleTimeString()}
        </div>
        <div className="text-center">
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
    </div>
  )
}

