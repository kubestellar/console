/**
 * Simple CSS-based globe visualization (fallback for Three.js globe)
 * Much lighter weight - no external dependencies
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface SimpleGlobeProps {
  className?: string
}

export function SimpleGlobe({ className = '' }: SimpleGlobeProps) {
  const { t: _t } = useTranslation()
  const [clusters] = useState(() => 
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 3,
    }))
  )

  return (
    <div className={`relative w-full h-full flex items-center justify-center ${className}`}>
      {/* Globe sphere */}
      <div className="relative w-96 h-96">
        {/* Main globe circle with gradient */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-900/20 via-purple-900/20 to-cyan-900/20 border-2 border-blue-500/30 shadow-2xl shadow-blue-500/20">
          {/* Rotating ring animation */}
          <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-spin-slow" />
          <div className="absolute inset-4 rounded-full border border-cyan-500/10 animate-spin-slower" />
          
          {/* Cluster dots */}
          {clusters.map((cluster) => (
            <div
              key={cluster.id}
              className="absolute w-3 h-3 rounded-full bg-blue-400 shadow-lg shadow-blue-500/50 animate-pulse"
              style={{
                left: `${cluster.x}%`,
                top: `${cluster.y}%`,
                animationDelay: `${cluster.delay}s`,
              }}
            >
              {/* Ripple effect */}
              <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-75" />
            </div>
          ))}
          
          {/* Connection lines (simplified) */}
          <svg className="absolute inset-0 w-full h-full opacity-30">
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
                <stop offset="50%" stopColor="rgb(59, 130, 246)" stopOpacity="1" />
                <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {clusters.slice(0, 6).map((cluster, i) => {
              const next = clusters[(i + 1) % 6]
              return (
                <line
                  key={i}
                  x1={`${cluster.x}%`}
                  y1={`${cluster.y}%`}
                  x2={`${next.x}%`}
                  y2={`${next.y}%`}
                  stroke="url(#lineGradient)"
                  strokeWidth="1"
                  className="animate-pulse"
                  style={{ animationDelay: `${cluster.delay}s` }}
                />
              )
            })}
          </svg>

          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-blue-500/5 blur-xl animate-pulse" />
        </div>

        {/* Orbital rings */}
        <div className="absolute inset-0 rounded-full border border-purple-500/20 animate-spin-slow" />
        <div className="absolute inset-8 rounded-full border border-cyan-500/20 animate-spin-slower" />
      </div>

      {/* Title */}
      <div className="absolute bottom-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Multi-Cluster Management</h2>
        <p className="text-gray-400">Visualize and control your Kubernetes infrastructure</p>
      </div>
    </div>
  )
}
