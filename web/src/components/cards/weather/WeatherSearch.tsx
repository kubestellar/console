/**
 * Search / location management UI for the Weather card: city geocoding
 * search, current-location save/remove, saved-location list, and the
 * units/forecast-length settings row.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, Search as SearchIcon, Star, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WEATHER_API } from '../../../config/externalApis'
import { useKeyboardNav } from '../../../hooks/useKeyboardNav'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../../lib/constants'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'
import { useToast } from '../../ui/Toast'
import type { GeocodingResult, SavedLocation } from './types'

interface WeatherSearchProps {
  currentLocation: SavedLocation
  savedLocations: SavedLocation[]
  isCurrentLocationSaved: boolean
  onSelectCity: (city: GeocodingResult) => void
  onSaveCurrentLocation: () => void
  onRemoveSavedLocation: (id: string) => void
  onLoadSavedLocation: (location: SavedLocation) => void
  units: 'F' | 'C'
  onUnitsChange: (units: 'F' | 'C') => void
  forecastLength: 2 | 7 | 14
  onForecastLengthChange: (length: 2 | 7 | 14) => void
}

export function WeatherSearch({
  currentLocation,
  savedLocations,
  isCurrentLocationSaved,
  onSelectCity,
  onSaveCurrentLocation,
  onRemoveSavedLocation,
  onLoadSavedLocation,
  units,
  onUnitsChange,
  forecastLength,
  onForecastLengthChange,
}: WeatherSearchProps) {
  const { t } = useTranslation('common')
  const { showToast } = useToast()

  // City search state
  const [citySearchInput, setCitySearchInput] = useState('')
  const [citySearchResults, setCitySearchResults] = useState<GeocodingResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showCityDropdown, setShowCityDropdown] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cityDropdownNav = useKeyboardNav({ selector: '[role="option"]:not([disabled])', orientation: 'vertical', onEscape: () => setShowCityDropdown(false) })

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
        `${WEATHER_API.geocodingUrl}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`,
        { signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) }
      )

      if (response.ok) {
        const data = await response.json()
        setCitySearchResults(data.results || [])
        setShowCityDropdown(true)
      } else {
        setCitySearchResults([])
        setShowCityDropdown(false)
      }
    } catch (error: unknown) {
      console.error('City search error:', error)
      showToast(t('errors.citySearchFailed', 'City search failed. Please try again.'), 'error')
      setCitySearchResults([])
      setShowCityDropdown(false)
    } finally {
      setIsSearching(false)
    }
  }, [showToast, t])

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

  useEffect(() => {
    if (!showCityDropdown || citySearchResults.length === 0) return
    cityDropdownNav.focusMatchingItem({ fallbackSelector: '[role="option"]:not([disabled])' })
  }, [cityDropdownNav, citySearchResults.length, showCityDropdown])

  const handleSelectCity = (city: GeocodingResult) => {
    onSelectCity(city)
    setCitySearchInput('')
    setShowCityDropdown(false)
    setCitySearchResults([])
  }

  return (
    <div className="mb-3 p-3 rounded-xl bg-secondary backdrop-blur-xs border border-border/30 space-y-3">
      {/* City Search */}
      <div>
        <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Search for a city</label>
        <div className="relative">
          <Input
            type="text"
            value={citySearchInput}
            onChange={(e) => setCitySearchInput(e.target.value)}
            onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' || citySearchResults.length === 0) return
              event.preventDefault()
              setShowCityDropdown(true)
            }}
            inputSize="lg"
            leadingIcon={<SearchIcon className="w-4 h-4" />}
            trailingIcon={isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            className="bg-secondary/50"
            placeholder="Type city name..."
            aria-expanded={showCityDropdown}
            aria-controls="weather-city-results"
            aria-autocomplete="list"
          />

          {/* City Search Dropdown */}
          {showCityDropdown && citySearchResults.length > 0 && (
            <div
              id="weather-city-results"
              ref={(node) => {
                cityDropdownNav.containerRef.current = node
              }}
              className="absolute z-50 w-full mt-1 bg-secondary/95 backdrop-blur-xs border border-border/30 rounded-lg shadow-lg max-h-60 overflow-y-auto"
              onKeyDown={cityDropdownNav.handleKeyDown}
              role="listbox"
              aria-label="City search results"
            >
              {citySearchResults.map((city) => (
                <button
                  key={city.id}
                  onClick={() => handleSelectCity(city)}
                  className="w-full text-left px-3 py-2.5 hover:bg-secondary transition-colors border-b border-border last:border-0"
                  role="option"
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
      <div className="flex flex-wrap items-center justify-between gap-y-2 p-2.5 rounded-lg bg-secondary/50 border border-border/30">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <div>
            <div className="text-sm font-medium">{currentLocation.cityName}</div>
            <div className="text-xs text-muted-foreground">Current location</div>
          </div>
        </div>
        {isCurrentLocationSaved ? (
          <button
            onClick={() => onRemoveSavedLocation(currentLocation.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Remove
          </button>
        ) : (
          <button
            onClick={onSaveCurrentLocation}
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
                      : 'bg-secondary hover:bg-secondary/50'
                  }`}
                  onClick={() => !isCurrentLoc && onLoadSavedLocation(location)}
                >
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{location.cityName}</div>
                  </div>
                  {!isCurrentLoc && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveSavedLocation(location.id)
                      }}
                      className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                      title={t('common.remove')}
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
          <Select
            value={units}
            onChange={(e) => onUnitsChange(e.target.value as 'F' | 'C')}
            className="bg-secondary/50"
          >
            <option value="F">°F (Fahrenheit)</option>
            <option value="C">°C (Celsius)</option>
          </Select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Forecast</label>
          <Select
            value={forecastLength}
            onChange={(e) => onForecastLengthChange(Number(e.target.value) as 2 | 7 | 14)}
            className="bg-secondary/50"
          >
            <option value={2}>2 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
          </Select>
        </div>
      </div>
    </div>
  )
}
