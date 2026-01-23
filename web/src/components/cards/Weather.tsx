import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { 
  Cloud, CloudRain, CloudSnow, Sun, Wind, Droplets, Gauge, Eye, 
  MapPin, Calendar, Search as SearchIcon, Settings, Star, X, 
  ExternalLink, Sunset, ChevronRight, ChevronDown, Loader2 
} from 'lucide-react'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'

// Geocoding API types
interface GeocodingResult {
  id: number
  name: string
  latitude: number
  longitude: number
  country: string
  admin1?: string
  timezone?: string
  postal_code?: string
}

// Mock weather data - in production would integrate with weather API
interface WeatherCondition {
  type: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy'
  icon: typeof Sun
  label: string
  gradient: string
  dayGradient: string
  nightGradient: string
}

const WEATHER_CONDITIONS: Record<string, WeatherCondition> = {
  sunny: { 
    type: 'sunny', 
    icon: Sun, 
    label: 'Sunny', 
    gradient: 'from-yellow-400 to-orange-500',
    dayGradient: 'from-blue-400 via-sky-400 to-blue-200',
    nightGradient: 'from-indigo-900 via-purple-900 to-indigo-800'
  },
  cloudy: { 
    type: 'cloudy', 
    icon: Cloud, 
    label: 'Cloudy', 
    gradient: 'from-gray-400 to-gray-600',
    dayGradient: 'from-gray-400 via-slate-300 to-gray-200',
    nightGradient: 'from-slate-800 via-slate-700 to-slate-600'
  },
  rainy: { 
    type: 'rainy', 
    icon: CloudRain, 
    label: 'Rainy', 
    gradient: 'from-blue-400 to-blue-700',
    dayGradient: 'from-slate-600 via-blue-500 to-slate-500',
    nightGradient: 'from-slate-900 via-blue-900 to-slate-800'
  },
  snowy: { 
    type: 'snowy', 
    icon: CloudSnow, 
    label: 'Snowy', 
    gradient: 'from-blue-100 to-blue-300',
    dayGradient: 'from-blue-200 via-slate-200 to-blue-100',
    nightGradient: 'from-slate-700 via-blue-800 to-slate-600'
  },
  windy: { 
    type: 'windy', 
    icon: Wind, 
    label: 'Windy', 
    gradient: 'from-cyan-400 to-cyan-600',
    dayGradient: 'from-cyan-400 via-teal-300 to-cyan-200',
    nightGradient: 'from-cyan-900 via-teal-800 to-cyan-800'
  },
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
  windDirection?: string
}

interface HourlyForecast {
  hour: string
  time: number
  temperature: number
  condition: keyof typeof WEATHER_CONDITIONS
  precipitation: number
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
  favorite?: boolean
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

// Generate hourly forecast for next 24 hours
function generateHourlyForecast(units: 'F' | 'C', zipcode: string): HourlyForecast[] {
  const conditions: Array<keyof typeof WEATHER_CONDITIONS> = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy']
  const hourly: HourlyForecast[] = []
  const now = new Date()
  const seed = hashZipcode(zipcode)

  for (let i = 0; i < 24; i++) {
    const hour = (now.getHours() + i) % 24
    const conditionIndex = Math.floor(seededRandom(seed + i + 5000) * conditions.length)
    const condition = conditions[conditionIndex]
    
    let baseTemp = units === 'F' ? 72 : 22
    if (condition === 'snowy') baseTemp = units === 'F' ? 28 : -2
    if (condition === 'rainy') baseTemp = units === 'F' ? 55 : 13
    if (condition === 'sunny') baseTemp = units === 'F' ? 82 : 28
    
    // Temperature varies throughout the day
    const tempVariation = Math.sin((hour - 6) * Math.PI / 12) * 8 // Peak at 6 PM
    
    hourly.push({
      hour: hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`,
      time: hour,
      temperature: Math.round(baseTemp + tempVariation + seededRandom(seed + i + 6000) * 5),
      condition,
      precipitation: condition === 'rainy' || condition === 'snowy' ? Math.floor(seededRandom(seed + i + 7000) * 50) + 30 : Math.floor(seededRandom(seed + i + 7000) * 20),
    })
  }

  return hourly
}

// Generate mock weather data with seeded randomness based on zipcode
function generateMockForecast(days: number, units: 'F' | 'C', zipcode: string): ForecastDay[] {
  const conditions: Array<keyof typeof WEATHER_CONDITIONS> = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy']
  const forecast: ForecastDay[] = []
  const today = new Date()
  const seed = hashZipcode(zipcode)
  const windDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

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
    
    const windDirIndex = Math.floor(seededRandom(seed + i + 9000) * windDirections.length)
    
    forecast.push({
      date: date.toISOString().split('T')[0],
      dayOfWeek: i === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }),
      condition,
      tempHigh: baseTemp + Math.floor(seededRandom(seed + i + 100) * 10),
      tempLow: baseTemp - Math.floor(seededRandom(seed + i + 200) * 15) - 5,
      precipitation: condition === 'rainy' || condition === 'snowy' ? Math.floor(seededRandom(seed + i + 300) * 80) + 20 : Math.floor(seededRandom(seed + i + 300) * 30),
      humidity: Math.floor(seededRandom(seed + i + 400) * 40) + 40,
      windSpeed: condition === 'windy' ? Math.floor(seededRandom(seed + i + 500) * 20) + 15 : Math.floor(seededRandom(seed + i + 500) * 15) + 2,
      windDirection: windDirections[windDirIndex],
    })
  }

  return forecast
}

// Format time in 12-hour format
function formatTime(hour: number, minuteSeed: number) {
  const minute = Math.floor(seededRandom(minuteSeed) * 60)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
}

// Get icon color based on weather condition
function getConditionColor(condition: keyof typeof WEATHER_CONDITIONS) {
  const colorMap: Record<keyof typeof WEATHER_CONDITIONS, string> = {
    'sunny': 'text-yellow-400',
    'cloudy': 'text-gray-400',
    'rainy': 'text-blue-400',
    'snowy': 'text-blue-200',
    'windy': 'text-cyan-400',
  }
  return colorMap[condition]
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

  // Calculate sunset/sunrise (mock times based on seed)
  const currentHour = new Date().getHours()
  const sunriseHour = 6 + Math.floor(seededRandom(seed + 8000) * 2)
  const sunsetHour = 18 + Math.floor(seededRandom(seed + 8100) * 2)
  const isDaytime = currentHour >= sunriseHour && currentHour < sunsetHour

  return {
    condition,
    temperature: baseTemp + Math.floor(seededRandom(seed + 1000) * 5),
    humidity: Math.floor(seededRandom(seed + 2000) * 40) + 40,
    windSpeed: condition === 'windy' ? Math.floor(seededRandom(seed + 3000) * 20) + 15 : Math.floor(seededRandom(seed + 3000) * 15) + 2,
    uvIndex: condition === 'sunny' ? Math.floor(seededRandom(seed + 4000) * 5) + 6 : Math.floor(seededRandom(seed + 4000) * 4) + 1,
    feelsLike: baseTemp + Math.floor(seededRandom(seed + 1100) * 3) - 2,
    visibility: Math.floor(seededRandom(seed + 5000) * 5) + 5,
    isDaytime,
    sunrise: formatTime(sunriseHour, seed + 8200),
    sunset: formatTime(sunsetHour, seed + 8300),
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
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const hourlyScrollRef = useRef<HTMLDivElement>(null)
  
  // City search state
  const [citySearchInput, setCitySearchInput] = useState('')
  const [citySearchResults, setCitySearchResults] = useState<GeocodingResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showCityDropdown, setShowCityDropdown] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(() => {
    const saved = localStorage.getItem('weather-saved-locations')
    return saved ? JSON.parse(saved) : []
  })
  const [showSavedLocations, setShowSavedLocations] = useState(false)

  // Generate forecast data
  const [forecast, setForecast] = useState<ForecastDay[]>(() => generateMockForecast(forecastLength, units, zipcode))
  const [currentWeather, setCurrentWeather] = useState(() => getCurrentWeather(units, zipcode))
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecast[]>(() => generateHourlyForecast(units, zipcode))

  // Save locations to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('weather-saved-locations', JSON.stringify(savedLocations))
  }, [savedLocations])

  // City search with Open-Meteo Geocoding API
  const searchCities = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setCitySearchResults([])
      setShowCityDropdown(false)
      return
    }

    setIsSearching(true)
    try {
      // TODO: In production, implement proper API error handling and rate limiting
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
    // Use postal_code if available, otherwise generate a mock zipcode from coordinates
    const newZipcode = city.postal_code || `${String(Math.abs(Math.floor(city.latitude * 1000))).substring(0, 5)}`
    setZipcode(newZipcode)
    setCitySearchInput('')
    setShowCityDropdown(false)
    setCitySearchResults([])
  }, [])

  // Save current location or toggle favorite
  const saveCurrentLocation = useCallback(() => {
    const existingLocation = savedLocations.find(loc => loc.zipcode === zipcode)
    
    if (existingLocation) {
      setSavedLocations(prev => prev.map(loc => 
        loc.zipcode === zipcode ? { ...loc, favorite: !loc.favorite } : loc
      ))
    } else {
      const newLocation: SavedLocation = {
        zipcode,
        cityName: getCityName(zipcode),
        temperature: currentWeather.temperature,
        condition: currentWeather.condition,
        favorite: true,
      }
      setSavedLocations(prev => [...prev, newLocation])
    }
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
      setHourlyForecast(generateHourlyForecast(units, zipcode))
      setLastRefresh(new Date())
      setIsRefreshing(false)
    }, 1000)
  }, [forecastLength, units, zipcode])

  // Auto-refresh on config changes
  useEffect(() => {
    refreshWeather()
  }, [refreshWeather])

  // Filter and sort forecast
  const filteredAndSorted = useMemo(() => {
    let filtered = forecast

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(day => 
        WEATHER_CONDITIONS[day.condition].label.toLowerCase().includes(query) ||
        day.dayOfWeek.toLowerCase().includes(query)
      )
    }

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
  
  // Get appropriate gradient based on time of day
  const backgroundGradient = currentWeather.isDaytime 
    ? currentCondition.dayGradient 
    : currentCondition.nightGradient

  // Wind speed unit conversion
  const windSpeedUnit = units === 'F' ? 'mph' : 'km/h'
  const convertWindSpeed = (mph: number) => {
    return units === 'F' ? mph : Math.round(mph * 1.60934) // Convert to km/h for metric
  }

  // Get UV Index color
  const getUVColor = (uvIndex: number) => {
    if (uvIndex <= 2) return 'text-green-400'
    if (uvIndex <= 5) return 'text-yellow-400'
    if (uvIndex <= 7) return 'text-orange-400'
    if (uvIndex <= 10) return 'text-red-400'
    return 'text-purple-400'
  }

  const getUVLabel = (uvIndex: number) => {
    if (uvIndex <= 2) return 'Low'
    if (uvIndex <= 5) return 'Moderate'
    if (uvIndex <= 7) return 'High'
    if (uvIndex <= 10) return 'Very High'
    return 'Extreme'
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-1 rounded hover:bg-secondary/50 transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={saveCurrentLocation}
            className={`p-1 rounded hover:bg-secondary/50 transition-colors ${
              savedLocations.find(loc => loc.zipcode === zipcode)?.favorite ? 'text-yellow-400' : 'text-muted-foreground'
            }`}
            title={savedLocations.find(loc => loc.zipcode === zipcode)?.favorite ? 'Unfavorite' : 'Favorite'}
          >
            <Star className="w-4 h-4" fill={savedLocations.find(loc => loc.zipcode === zipcode)?.favorite ? 'currentColor' : 'none'} />
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
        <div className="mb-3 p-3 rounded-xl bg-secondary/30 backdrop-blur-sm border border-border/30 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">City Search</label>
            <div className="relative">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={citySearchInput}
                  onChange={(e) => setCitySearchInput(e.target.value)}
                  onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)}
                  className="w-full pl-10 pr-10 py-2 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground placeholder:text-muted-foreground"
                  placeholder="Search for any city..."
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                )}
              </div>
              
              {/* City Search Dropdown */}
              {showCityDropdown && citySearchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-secondary/95 backdrop-blur-sm border border-border/30 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {citySearchResults.map((city) => (
                    <button
                      key={city.id}
                      onClick={() => selectCity(city)}
                      className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors border-b border-border/20 last:border-0"
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
          
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Zipcode (or generated)</label>
            <input
              type="text"
              value={zipcode}
              onChange={(e) => setZipcode(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground"
              placeholder="Enter zipcode"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Units</label>
              <select
                value={units}
                onChange={(e) => setUnits(e.target.value as 'F' | 'C')}
                className="w-full px-3 py-2 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground"
              >
                <option value="F">°F</option>
                <option value="C">°C</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Days</label>
              <select
                value={forecastLength}
                onChange={(e) => setForecastLength(Number(e.target.value) as 2 | 7 | 14)}
                className="w-full px-3 py-2 text-sm rounded-lg bg-secondary/50 border border-border/30 text-foreground"
              >
                <option value={2}>2</option>
                <option value={7}>7</option>
                <option value={14}>14</option>
              </select>
            </div>
          </div>
          
          {/* Saved Locations */}
          {savedLocations.length > 0 && (
            <div className="pt-2 border-t border-border/30">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Saved ({savedLocations.length})</label>
                <button
                  onClick={() => setShowSavedLocations(!showSavedLocations)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  {showSavedLocations ? 'Hide' : 'Show'}
                </button>
              </div>
              {showSavedLocations && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {[...savedLocations]
                    .sort((a, b) => {
                      if (a.favorite && !b.favorite) return -1
                      if (!a.favorite && b.favorite) return 1
                      return 0
                    })
                    .map((location) => {
                    const condition = WEATHER_CONDITIONS[location.condition]
                    const Icon = condition.icon
                    
                    return (
                      <div
                        key={location.zipcode}
                        className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group"
                      >
                        <button
                          onClick={() => loadSavedLocation(location.zipcode)}
                          className="flex items-center gap-2 flex-1 text-left"
                        >
                          <Icon className="w-4 h-4" />
                          <div className="flex-1">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium">{location.cityName}</span>
                              {location.favorite && <Star className="w-3 h-3 text-yellow-400" fill="currentColor" />}
                            </div>
                            <div className="text-xs text-muted-foreground">{location.temperature}°{units}</div>
                          </div>
                        </button>
                        <button
                          onClick={() => removeSavedLocation(location.zipcode)}
                          className="p-1 rounded hover:bg-destructive/20 transition-colors opacity-0 group-hover:opacity-100"
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
          
          {/* Search and Controls in Config */}
          <div className="pt-2 border-t border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter forecast..."
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg bg-secondary/50 border border-border/30 text-foreground placeholder:text-muted-foreground"
                />
              </div>
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
        </div>
      )}

      {/* Main Weather Display - iPhone Style */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-2">
        {/* Hero Section - Large Temperature Display (Reduced Height) */}
        <div className={`relative rounded-3xl bg-gradient-to-b ${backgroundGradient} overflow-hidden shadow-lg`}>
          {/* Darker overlay for better text readability */}
          <div className="absolute inset-0 bg-black/30 z-0"></div>
          
          {/* Subtle animated background */}
          <WeatherBackground condition={currentWeather.condition} />
          
          <div className="relative z-10 text-white p-3">
            {/* Location */}
            <div className="flex items-center justify-center gap-2 mb-0.5">
              <MapPin className="w-4 h-4" />
              <h2 className="text-base font-semibold">{getCityName(zipcode)}</h2>
            </div>
            
            {/* Large Temperature - iOS Style (Further Reduced Size) */}
            <div className="text-center mb-1">
              <div className="text-6xl font-light tracking-tight mb-0.5">
                {currentWeather.temperature}°
              </div>
              <div className="flex items-center justify-center gap-2 text-base mb-0.5">
                <CurrentIcon className="w-4 h-4" />
                <span>{currentCondition.label}</span>
              </div>
              <div className="text-sm opacity-90">
                H:{forecast[0]?.tempHigh}° L:{forecast[0]?.tempLow}°
              </div>
            </div>
          </div>
        </div>

        {/* Hourly Forecast - Horizontal Scroll */}
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
              const condition = WEATHER_CONDITIONS[hour.condition]
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
                  <HourIcon className={`w-6 h-6 ${getConditionColor(hour.condition)}`} />
                  <div className="text-lg font-semibold">
                    {hour.temperature}°
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Forecast */}
        <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
          <div className="flex items-center gap-2 mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Calendar className="w-3 h-3" />
            <span>{forecastLength}-Day Forecast</span>
          </div>
          <div className="space-y-1">
            {paginatedForecast.map((day, idx) => {
              const condition = WEATHER_CONDITIONS[day.condition]
              const Icon = condition.icon
              const isExpanded = expandedDay === day.date
              const tempRange = day.tempHigh - day.tempLow
              const minTemp = Math.min(...paginatedForecast.map(d => d.tempLow))
              const maxTemp = Math.max(...paginatedForecast.map(d => d.tempHigh))
              const totalRange = maxTemp - minTemp
              const leftPercent = ((day.tempLow - minTemp) / totalRange) * 100
              const widthPercent = (tempRange / totalRange) * 100
              
              return (
                <div key={day.date}>
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                    className="w-full flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-secondary/50 transition-all group"
                  >
                    {/* Day */}
                    <div className="w-16 text-left text-sm font-medium">
                      {day.dayOfWeek}
                    </div>
                    
                    {/* Icon */}
                    <Icon className={`w-6 h-6 ${getConditionColor(day.condition)}`} />
                    
                    {/* Temperature Bar */}
                    <div className="flex-1 flex items-center gap-2">
                      <span className="text-sm text-muted-foreground w-8 text-right">
                        {day.tempLow}°
                      </span>
                      <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden relative">
                        <div
                          className="absolute h-full bg-gradient-to-r from-blue-400 to-orange-400 rounded-full"
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8">
                        {day.tempHigh}°
                      </span>
                    </div>
                    
                    {/* Expand indicator */}
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                  
                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-4 py-3 ml-6 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Precipitation</span>
                        <span className="font-medium">{day.precipitation}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Humidity</span>
                        <span className="font-medium">{day.humidity}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Wind</span>
                        <span className="font-medium">{convertWindSpeed(day.windSpeed)} {windSpeedUnit} {day.windDirection}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Divider */}
                  {idx < paginatedForecast.length - 1 && (
                    <div className="h-px bg-border/20 mx-2" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Additional Details Grid - iOS Style Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* UV Index */}
          <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Eye className="w-3 h-3" />
              <span>UV Index</span>
            </div>
            <div className={`text-3xl font-semibold mb-1 ${getUVColor(currentWeather.uvIndex)}`}>
              {currentWeather.uvIndex}
            </div>
            <div className="text-sm text-muted-foreground">
              {getUVLabel(currentWeather.uvIndex)}
            </div>
          </div>

          {/* Sunset */}
          <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Sunset className="w-3 h-3" />
              <span>Sunset</span>
            </div>
            <div className="text-3xl font-semibold mb-1">
              {currentWeather.sunset}
            </div>
            <div className="text-sm text-muted-foreground">
              Sunrise: {currentWeather.sunrise}
            </div>
          </div>

          {/* Wind */}
          <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Wind className="w-3 h-3" />
              <span>Wind</span>
            </div>
            <div className="text-3xl font-semibold mb-1">
              {convertWindSpeed(currentWeather.windSpeed)}
            </div>
            <div className="text-sm text-muted-foreground">
              {windSpeedUnit}
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
              {currentWeather.feelsLike > currentWeather.temperature ? 'Warmer' : currentWeather.feelsLike < currentWeather.temperature ? 'Cooler' : 'Same'}
            </div>
          </div>

          {/* Visibility */}
          <div className="rounded-2xl bg-secondary/30 backdrop-blur-sm border border-border/20 p-4">
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Eye className="w-3 h-3" />
              <span>Visibility</span>
            </div>
            <div className="text-3xl font-semibold mb-1">
              {currentWeather.visibility}
            </div>
            <div className="text-sm text-muted-foreground">
              miles
            </div>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/30 mt-2">
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
      <div className="mt-3 pt-2 border-t border-border/30 text-xs text-center text-muted-foreground">
        <div className="mb-1">
          {paginatedForecast.length} of {totalItems} days • Updated {lastRefresh.toLocaleTimeString()}
        </div>
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

