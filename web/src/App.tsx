import { useMemo } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { BrandingProvider } from './hooks/useBranding'
import { ThemeProvider } from './hooks/useTheme'
import { useLiveUrl, LiveLocationProvider } from './hooks/useAppSideEffects'
import { AppRoutes } from './routes/AppRoutes'

function App() {
  const liveUrl = useLiveUrl()
  // Merge the real router location (which carries state and — critically —
  // a real `key` that changes on every navigation) with the live browser URL.
  // This keeps pathname/search/hash in lockstep with the address bar while
  // preserving React Router's navigation metadata once it catches up.
  const routerLocation = useLocation()
  const navigationType = useNavigationType()
  const liveLocation = useMemo(() => {
    const url = new URL(liveUrl, window.location.origin)
    return {
      ...routerLocation,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    }
  }, [routerLocation, liveUrl])
  return (
    <BrandingProvider>
      <ThemeProvider>
        <LiveLocationProvider location={liveLocation} navigationType={navigationType}>
          <AppRoutes liveLocation={liveLocation} />
        </LiveLocationProvider>
      </ThemeProvider>
    </BrandingProvider>
  )
}

export default App
