import { Loader2 } from 'lucide-react'
import { useNetworkUtils } from './useNetworkUtils'
import {
  NetworkStatusBar,
  NetworkUtilsTabBar,
  PingTab,
  PortsTab,
  InfoTab,
} from './NetworkUtils.tabs'

export function NetworkUtils() {
  const {
    activeTab,
    setActiveTab,
    isInitialized,
    pingResults,
    isPinging,
    continuousPing,
    setContinuousPing,
    pingInterval,
    setPingInterval,
    hostInput,
    setHostInput,
    portInput,
    setPortInput,
    networkInfo,
    pingAllHosts,
    addHost,
    removeHost,
    getAverageLatency,
    pingHosts,
    portHosts,
  } = useNetworkUtils()

  // Show loading state during initialization
  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
        {/* Network status bar */}
        <NetworkStatusBar networkInfo={networkInfo} />

        {/* Tabs */}
        <NetworkUtilsTabBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Ping tab */}
        {activeTab === 'ping' && (
          <PingTab
            hostInput={hostInput}
            setHostInput={setHostInput}
            addHost={addHost}
            continuousPing={continuousPing}
            setContinuousPing={setContinuousPing}
            pingInterval={pingInterval}
            setPingInterval={setPingInterval}
            pingAllHosts={pingAllHosts}
            isPinging={isPinging}
            pingHosts={pingHosts}
            pingResults={pingResults}
            getAverageLatency={getAverageLatency}
            removeHost={removeHost}
          />
        )}

        {/* Ports tab */}
        {activeTab === 'ports' && (
          <PortsTab
            hostInput={hostInput}
            setHostInput={setHostInput}
            portInput={portInput}
            setPortInput={setPortInput}
            addHost={addHost}
            portHosts={portHosts}
            removeHost={removeHost}
          />
        )}

        {/* Info tab */}
        {activeTab === 'info' && <InfoTab networkInfo={networkInfo} />}
    </div>
  )
}
