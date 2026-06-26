
import type { CSSProperties } from 'react'

// Inline style constants
const GLOBE_LOADER_DIV_STYLE_1: CSSProperties = { animationDirection: "reverse", animationDuration: "3s" }
const GLOBE_LOADER_DIV_STYLE_2: CSSProperties = { animationDuration: "2s" }
const GLOBE_LOADER_DIV_STYLE_3: CSSProperties = { animationDelay: "0.1s" }
const GLOBE_LOADER_DIV_STYLE_4: CSSProperties = { animationDelay: "0.2s" }
const GlobeLoader = () => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-4 bg-linear-to-r from-blue-400 to-purple-500 rounded-full animate-pulse"></div>
        <div className="absolute inset-0 border-2 border-blue-400/30 rounded-full animate-spin"></div>
        <div className="absolute inset-2 border-2 border-purple-400/30 rounded-full animate-spin" style={GLOBE_LOADER_DIV_STYLE_1}></div>
        <div className="absolute inset-0 animate-spin" style={GLOBE_LOADER_DIV_STYLE_2}>
          <div className="absolute -top-1 left-1/2 w-2 h-2 bg-cyan-400 rounded-full transform -translate-x-1/2"></div>
          <div className="absolute top-1/2 -right-1 w-2 h-2 bg-yellow-400 rounded-full transform -translate-y-1/2"></div>
          <div className="absolute -bottom-1 left-1/2 w-2 h-2 bg-green-400 rounded-full transform -translate-x-1/2"></div>
          <div className="absolute top-1/2 -left-1 w-2 h-2 bg-purple-400 rounded-full transform -translate-y-1/2"></div>
        </div>
      </div>
      <div className="text-center">
        <div className="text-blue-400 font-semibold text-lg">Console</div>
        <div className="text-muted-foreground text-sm">Initializing clusters...</div>
        <div className="flex space-x-1 mt-2 justify-center">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={GLOBE_LOADER_DIV_STYLE_3}></div>
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={GLOBE_LOADER_DIV_STYLE_4}></div>
        </div>
      </div>
    </div>
  )
}

export default GlobeLoader
