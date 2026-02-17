// Cloud provider icons as SVG components
import React from 'react'
import { useTranslation } from 'react-i18next'

export type CloudProvider = 'eks' | 'gke' | 'aks' | 'openshift' | 'oci' | 'alibaba' | 'digitalocean' | 'rancher' | 'coreweave' | 'kind' | 'minikube' | 'k3s' | 'kubernetes'

interface CloudProviderIconProps {
  provider: CloudProvider
  size?: number
  className?: string
}

// AWS EKS icon - blue hexagon with K
const AWSIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
    <defs>
      <linearGradient id="eksGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6B7AE8" />
        <stop offset="100%" stopColor="#4B5BD4" />
      </linearGradient>
    </defs>
    {/* Outer hexagon */}
    <polygon points="12,1 22,6 22,18 12,23 2,18 2,6" fill="url(#eksGradient)" />
    {/* Inner white hexagon cutout */}
    <polygon points="12,5 18,8 18,16 12,19 6,16 6,8" fill="white" />
    {/* K letter */}
    <text x="12" y="15" textAnchor="middle" fill="#4B5BD4" fontSize="9" fontWeight="bold" fontFamily="Arial, sans-serif">K</text>
  </svg>
)

// Google GKE icon - blue rounded hexagon with 3D cube
const GCPIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
    {/* Blue rounded hexagon background */}
    <path d="M12 2 L20 6.5 Q22 8 22 10 L22 14 Q22 16 20 17.5 L12 22 L4 17.5 Q2 16 2 14 L2 10 Q2 8 4 6.5 Z" fill="#4285F4" />
    {/* 3D cube icon - outer hexagon frame */}
    <polygon points="12,5 17,7.5 17,12.5 12,15 7,12.5 7,7.5" stroke="white" strokeWidth="1.2" fill="none" />
    {/* Cube top connector */}
    <line x1="12" y1="5" x2="12" y2="3" stroke="white" strokeWidth="1.2" />
    {/* Inner cube */}
    <polygon points="12,8 15,9.5 15,12 12,13.5 9,12 9,9.5" stroke="white" strokeWidth="1" fill="none" />
    {/* Cube center vertical line */}
    <line x1="12" y1="8" x2="12" y2="10.5" stroke="white" strokeWidth="1" />
    {/* Cube bottom lines */}
    <line x1="12" y1="13.5" x2="12" y2="17" stroke="white" strokeWidth="1.2" />
    <line x1="9" y1="12" x2="6" y2="14" stroke="white" strokeWidth="1" />
    <line x1="15" y1="12" x2="18" y2="14" stroke="white" strokeWidth="1" />
  </svg>
)

// Azure AKS icon - purple gradient 3D cubes pattern
const AzureIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} className={className}>
    <defs>
      <linearGradient id="aksGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#B77AF4" />
        <stop offset="100%" stopColor="#773ADC" />
      </linearGradient>
    </defs>
    {/* Top row - 2 cubes */}
    <path fill="url(#aksGradient1)" d="M5.5 2l-2.2.4v3l2.2.5 2.2-.9V2.8L5.5 2z"/>
    <path fill="#341A6E" d="M3.3 2.4v3l2.2.5V2l-2.2.4zm.9 2.8l-.6-.1V2.8l.6-.1v2.5zm1 .2l-.7-.1V2.6l.7-.1v2.9z"/>
    <path fill="url(#aksGradient1)" d="M10.3 2l-2.2.4v3l2.2.5 2.2-.9V2.8L10.3 2z"/>
    <path fill="#341A6E" d="M8.1 2.5v3l2.2.5V2l-2.2.4zm.9 2.8l-.6-.1V2.8l.6-.1v2.5zm1 .2l-.7-.1V2.6l.7-.1v2.9z"/>
    {/* Middle row - 3 cubes */}
    <path fill="url(#aksGradient1)" d="M3.2 6.2l-2.2.4v3l2.2.5 2.2-.9V7L3.2 6.2z"/>
    <path fill="#341A6E" d="M1 6.6v3l2.2.5V6.2L1 6.6zm.9 2.8l-.6-.1V6.9l.6-.1v2.6zm1 .2l-.7-.1V6.8l.7-.1v2.9z"/>
    <path fill="url(#aksGradient1)" d="M8 6.2l-2.2.4v3l2.2.5 2.2-.9V6.9L8 6.2z"/>
    <path fill="#341A6E" d="M5.8 6.6v3l2.2.5V6.2l-2.2.4zm.9 2.8l-.6-.1V6.9l.6-.1v2.6zm1 .2l-.7-.1V6.8l.7-.1v2.9z"/>
    <path fill="url(#aksGradient1)" d="M12.8 6.2l-2.2.4v3l2.2.5 2.2-.9V7l-2.2-.8z"/>
    <path fill="#341A6E" d="M10.6 6.6v3l2.2.5V6.2l-2.2.4zm1 2.8l-.6-.1V6.9l.6-.1v2.6zm1 .2l-.7-.1V6.8l.7-.1v2.9z"/>
    {/* Bottom row - 2 cubes */}
    <path fill="url(#aksGradient1)" d="M5.5 10.4l-2.2.4v3l2.2.5 2.2-.9v-2.3l-2.2-.7z"/>
    <path fill="#341A6E" d="M3.2 10.8v3l2.2.5v-4l-2.2.5zm1 2.8l-.6-.1v-2.3l.6-.1v2.5zm1 .2l-.7-.1v-2.7l.7-.1v2.9z"/>
    <path fill="url(#aksGradient1)" d="M10.3 10.4l-2.2.4v3l2.2.5 2.2-.9v-2.3l-2.2-.7z"/>
    <path fill="#341A6E" d="M8 10.9v3l2.2.5v-3.9l-2.2.4zm1 2.8l-.6-.1v-2.3l.6-.1v2.5zm1 .2l-.7-.1v-2.7l.7-.1v2.9z"/>
  </svg>
)

// OpenShift icon - official logo: red O with two horizontal offset bars
const OpenShiftIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
    {/* Top horizontal bar with slight tilt */}
    <rect x="5" y="28" width="90" height="12" rx="2" fill="#EE0000" transform="rotate(-10 50 34)" />
    {/* Bottom horizontal bar with slight tilt */}
    <rect x="5" y="60" width="90" height="12" rx="2" fill="#EE0000" transform="rotate(-10 50 66)" />
    {/* Main red O ring */}
    <circle cx="50" cy="50" r="35" fill="#EE0000" />
    {/* White center hole */}
    <circle cx="50" cy="50" r="18" fill="white" />
    {/* Darker overlap areas on top bar */}
    <path d="M15 28 L38 28 L38 40 L15 40 Z" fill="#C00000" transform="rotate(-10 50 34)" />
    <path d="M62 28 L85 28 L85 40 L62 40 Z" fill="#C00000" transform="rotate(-10 50 34)" />
    {/* Darker overlap areas on bottom bar */}
    <path d="M15 60 L38 60 L38 72 L15 72 Z" fill="#C00000" transform="rotate(-10 50 66)" />
    <path d="M62 60 L85 60 L85 72 L62 72 Z" fill="#C00000" transform="rotate(-10 50 66)" />
  </svg>
)

// Oracle Cloud icon - red with O
const OCIIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
    <rect width="24" height="24" rx="4" fill="#C74634" />
    <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="2" fill="none" />
  </svg>
)

// Alibaba Cloud ACK icon - orange hexagon with connected cube nodes
const AlibabaIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
    {/* Outer hexagon outline */}
    <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke="#FF6A00" strokeWidth="2" fill="none" />
    {/* Inner hexagon */}
    <polygon points="12,6 17,9 17,15 12,18 7,15 7,9" stroke="#FF6A00" strokeWidth="1.5" fill="none" />
    {/* Center cube */}
    <rect x="10" y="10" width="4" height="4" fill="#FF6A00" rx="0.5" />
    {/* Top node */}
    <rect x="10.5" y="4" width="3" height="3" fill="#FF6A00" rx="0.5" />
    {/* Top-right node */}
    <rect x="16" y="7" width="3" height="3" fill="#FF6A00" rx="0.5" />
    {/* Bottom-right node */}
    <rect x="16" y="14" width="3" height="3" fill="#FF6A00" rx="0.5" />
    {/* Bottom node */}
    <rect x="10.5" y="17" width="3" height="3" fill="#FF6A00" rx="0.5" />
    {/* Bottom-left node */}
    <rect x="5" y="14" width="3" height="3" fill="#FF6A00" rx="0.5" />
    {/* Top-left node */}
    <rect x="5" y="7" width="3" height="3" fill="#FF6A00" rx="0.5" />
    {/* Connecting lines */}
    <line x1="12" y1="7" x2="12" y2="10" stroke="#FF6A00" strokeWidth="1" />
    <line x1="14" y1="11" x2="16" y2="9" stroke="#FF6A00" strokeWidth="1" />
    <line x1="14" y1="13" x2="16" y2="15" stroke="#FF6A00" strokeWidth="1" />
    <line x1="12" y1="14" x2="12" y2="17" stroke="#FF6A00" strokeWidth="1" />
    <line x1="10" y1="13" x2="8" y2="15" stroke="#FF6A00" strokeWidth="1" />
    <line x1="10" y1="11" x2="8" y2="9" stroke="#FF6A00" strokeWidth="1" />
  </svg>
)

// DigitalOcean icon - official DO logo with arc and pixels
const DigitalOceanIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
    {/* Main arc/circle shape */}
    <path
      d="M12 4C7.6 4 4 7.6 4 12c0 4.4 3.6 8 8 8v-4c-2.2 0-4-1.8-4-4s1.8-4 4-4c2.2 0 4 1.8 4 4h4c0-4.4-3.6-8-8-8z"
      fill="#0080FF"
    />
    {/* Bottom right square pixels */}
    <rect x="12" y="16" width="4" height="4" fill="#0080FF" />
    <rect x="16" y="12" width="4" height="4" fill="#0080FF" />
    {/* Small pixel squares */}
    <rect x="17" y="8" width="2" height="2" fill="#0080FF" />
    <rect x="19" y="10" width="1.5" height="1.5" fill="#0080FF" />
    <rect x="15" y="6" width="1.5" height="1.5" fill="#0080FF" />
  </svg>
)

// Rancher icon - blue cow silhouette
const RancherIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
    {/* Blue rounded background */}
    <rect width="24" height="24" rx="4" fill="#2453FF" />
    {/* Simplified cow head - based on Rancher logo */}
    {/* Left ear/horn */}
    <path d="M5 7 L7 5 L7 8 Z" fill="white" />
    {/* Right ear/horn */}
    <path d="M19 7 L17 5 L17 8 Z" fill="white" />
    {/* Head shape */}
    <path d="M7 7 L7 13 C7 16 9 18 12 18 C15 18 17 16 17 13 L17 7 C17 5 15 4 12 4 C9 4 7 5 7 7 Z" fill="white" />
    {/* Left eye */}
    <circle cx="9.5" cy="10" r="1.2" fill="#2453FF" />
    {/* Right eye */}
    <circle cx="14.5" cy="10" r="1.2" fill="#2453FF" />
    {/* Nose/snout */}
    <ellipse cx="12" cy="14.5" rx="3" ry="2" fill="#2453FF" fillOpacity="0.3" />
    {/* Nostrils */}
    <circle cx="10.5" cy="14.5" r="0.6" fill="#2453FF" />
    <circle cx="13.5" cy="14.5" r="0.6" fill="#2453FF" />
  </svg>
)

// CoreWeave icon - blue rounded rect with stylized CW wave mark
const CoreWeaveIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
    <defs>
      <linearGradient id="cwGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3B5BFF" />
        <stop offset="100%" stopColor="#2741E7" />
      </linearGradient>
    </defs>
    {/* Background */}
    <rect width="24" height="24" rx="4" fill="url(#cwGradient)" />
    {/* Stylized double-wave / CW mark */}
    <path
      d="M4 14 C6 10, 8 10, 10 14 C12 18, 14 18, 16 14"
      stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"
    />
    <path
      d="M8 14 C10 10, 12 10, 14 14 C16 18, 18 18, 20 14"
      stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.6"
    />
    {/* Small cloud dots above */}
    <circle cx="7" cy="8" r="1" fill="white" opacity="0.5" />
    <circle cx="12" cy="7" r="1.3" fill="white" opacity="0.7" />
    <circle cx="17" cy="8" r="1" fill="white" opacity="0.5" />
  </svg>
)

// Kind icon - official logo (ship in bottle)
const KindIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <img
    src="/kind-logo.png"
    alt="Kind"
    width={size}
    height={size}
    className={className}
    style={{ objectFit: 'contain' }}
  />
)

// Minikube icon - hexagon with container and helm wheel
const MinikubeIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
    {/* Outer hexagon outline */}
    <polygon
      points="12,1 22,5.5 22,18.5 12,23 2,18.5 2,5.5"
      fill="none"
      stroke="#326CE5"
      strokeWidth="1.5"
    />
    {/* Inner hexagon (slightly smaller) */}
    <polygon
      points="12,2.5 20.5,6.5 20.5,17.5 12,21.5 3.5,17.5 3.5,6.5"
      fill="white"
    />
    {/* Container/box shape at top - light cyan */}
    <path d="M6 7 L12 4 L18 7 L18 11 L12 14 L6 11 Z" fill="#8FE3E3" />
    <path d="M12 4 L12 8 L6 11 L6 7 Z" fill="#5DD3D3" />
    <path d="M12 4 L12 8 L18 11 L18 7 Z" fill="#B8F0F0" />
    {/* Helm wheel - blue */}
    <circle cx="12" cy="16" r="4" fill="none" stroke="#326CE5" strokeWidth="1.5" />
    <circle cx="12" cy="16" r="1" fill="#326CE5" />
    {/* Helm spokes */}
    <line x1="12" y1="12" x2="12" y2="14.5" stroke="#326CE5" strokeWidth="1" />
    <line x1="12" y1="17.5" x2="12" y2="20" stroke="#326CE5" strokeWidth="1" />
    <line x1="8" y1="16" x2="10.5" y2="16" stroke="#326CE5" strokeWidth="1" />
    <line x1="13.5" y1="16" x2="16" y2="16" stroke="#326CE5" strokeWidth="1" />
    {/* Diagonal spokes */}
    <line x1="9.2" y1="13.2" x2="10.8" y2="14.8" stroke="#326CE5" strokeWidth="1" />
    <line x1="13.2" y1="17.2" x2="14.8" y2="18.8" stroke="#326CE5" strokeWidth="1" />
    <line x1="14.8" y1="13.2" x2="13.2" y2="14.8" stroke="#326CE5" strokeWidth="1" />
    <line x1="10.8" y1="17.2" x2="9.2" y2="18.8" stroke="#326CE5" strokeWidth="1" />
  </svg>
)

// K3s icon - yellow with white three-blade propeller
const K3sIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
    {/* Yellow rounded rectangle background */}
    <rect width="24" height="24" rx="5" fill="#FFC61C" />
    {/* Three-blade propeller shape */}
    {/* Top blade */}
    <path
      d="M12 5 L12 11"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Bottom-left blade */}
    <path
      d="M12 12 L7 17"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Bottom-right blade */}
    <path
      d="M12 12 L17 17"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Center circle */}
    <circle cx="12" cy="12" r="1.5" fill="white" />
  </svg>
)

// Kubernetes icon - official logo from Wikimedia Commons
const KubernetesIcon: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg viewBox="0 0 722.9 702" width={size} height={size} className={className}>
    {/* Blue heptagon background */}
    <path
      fill="#326ce5"
      d="M358.986 10.06a46.725 46.342 0 0 0-17.906 4.532L96.736 131.34a46.725 46.342 0 0 0-25.281 31.438L11.174 425.03a46.725 46.342 0 0 0 6.344 35.53 46.725 46.342 0 0 0 2.656 3.688l169.125 210.281a46.725 46.342 0 0 0 36.531 17.438l271.219-.063a46.725 46.342 0 0 0 36.531-17.406l169.031-210.312a46.725 46.342 0 0 0 9.031-39.219l-60.374-262.25a46.725 46.342 0 0 0-25.282-31.437L381.642 14.592a46.725 46.342 0 0 0-22.656-4.531z"
    />
    {/* White helm wheel */}
    <path
      fill="#fff"
      d="M361.407 99.307c-8.077 0-14.626 7.276-14.625 16.25 0 .138.028.27.031.406-.012 1.22-.07 2.689-.031 3.75.193 5.176 1.32 9.138 2 13.907 1.23 10.206 2.261 18.667 1.625 26.53-.619 2.966-2.803 5.678-4.75 7.563l-.344 6.188c-8.777.727-17.612 2.058-26.437 4.062-37.975 8.622-70.67 28.183-95.563 54.594-1.615-1.102-4.44-3.13-5.281-3.75-2.611.352-5.25 1.158-8.687-.844-6.545-4.406-12.506-10.487-19.72-17.812-3.304-3.504-5.697-6.841-9.624-10.22-.892-.766-2.253-1.804-3.25-2.593-3.07-2.448-6.691-3.724-10.188-3.844-4.496-.154-8.824 1.604-11.656 5.156-5.035 6.316-3.423 15.968 3.594 21.563.071.057.147.1.218.156.965.782 2.145 1.783 3.032 2.438 4.167 3.076 7.973 4.651 12.125 7.093 8.747 5.402 15.998 9.881 21.75 15.282 2.246 2.394 2.638 6.613 2.937 8.437l4.688 4.188c-25.094 37.763-36.707 84.409-29.844 131.937l-6.125 1.781c-1.614 2.085-3.895 5.365-6.281 6.344-7.525 2.37-15.994 3.24-26.219 4.312-4.8.4-8.942.161-14.031 1.125-1.12.213-2.68.619-3.906.907-.043.008-.082.021-.125.03-.067.016-.155.049-.219.063-8.62 2.083-14.158 10.006-12.375 17.813 1.783 7.808 10.203 12.556 18.875 10.687.063-.014.154-.017.219-.031.098-.022.184-.07.281-.094 1.21-.265 2.724-.56 3.782-.843 5.003-1.34 8.627-3.308 13.125-5.032 9.677-3.47 17.691-6.37 25.5-7.5 3.261-.255 6.697 2.012 8.406 2.97l6.375-1.095c14.67 45.483 45.414 82.245 84.344 105.313l-2.656 6.375c.957 2.475 2.013 5.824 1.3 8.269-2.838 7.361-7.7 15.13-13.237 23.793-2.681 4.002-5.425 7.108-7.844 11.688-.579 1.096-1.316 2.779-1.875 3.937-3.759 8.043-1.002 17.306 6.219 20.782 7.266 3.497 16.284-.192 20.187-8.25.006-.012.026-.02.032-.032.004-.008-.004-.022 0-.03.556-1.143 1.343-2.645 1.812-3.72 2.072-4.746 2.762-8.814 4.219-13.405 3.87-9.72 5.996-19.92 11.323-26.275 1.458-1.74 3.836-2.409 6.302-3.069l3.312-6c33.939 13.027 71.927 16.522 109.875 7.906 8.657-1.966 17.015-4.51 25.094-7.562.931 1.651 2.661 4.826 3.125 5.625 2.506.815 5.24 1.236 7.469 4.531 3.985 6.809 6.71 14.864 10.03 24.594 1.458 4.591 2.178 8.659 4.25 13.406.473 1.082 1.256 2.605 1.813 3.75 3.895 8.085 12.942 11.787 20.219 8.281 7.22-3.478 9.98-12.74 6.218-20.781-.558-1.158-1.327-2.842-1.906-3.937-2.42-4.58-5.162-7.655-7.844-11.657-5.537-8.661-10.13-15.857-12.968-23.218-1.188-3.797.2-6.158 1.125-8.625-.554-.635-1.739-4.22-2.438-5.907 40.458-23.888 70.299-62.021 84.313-106.062 1.892.297 5.181.879 6.25 1.093 2.2-1.45 4.222-3.343 8.188-3.03 7.808 1.128 15.822 4.029 25.5 7.5 4.498 1.722 8.121 3.722 13.125 5.062 1.057.283 2.572.547 3.78.813.098.024.184.07.282.093.065.015.156.017.219.032 8.672 1.867 17.094-2.879 18.875-10.688 1.78-7.807-3.754-15.732-12.375-17.812-1.254-.285-3.032-.77-4.25-1-5.09-.964-9.231-.726-14.031-1.125-10.225-1.072-18.694-1.943-26.22-4.313-3.067-1.19-5.25-4.84-6.312-6.343l-5.906-1.72c3.062-22.153 2.237-45.21-3.062-68.28-5.349-23.285-14.8-44.581-27.407-63.344 1.515-1.377 4.376-3.911 5.188-4.656.237-2.624.033-5.376 2.75-8.281 5.751-5.401 13.003-9.88 21.75-15.282 4.151-2.442 7.99-4.016 12.156-7.093.942-.696 2.229-1.798 3.219-2.594 7.015-5.596 8.63-15.248 3.594-21.562-5.037-6.314-14.798-6.91-21.813-1.313-.999.79-2.354 1.823-3.25 2.594-3.927 3.378-6.352 6.714-9.657 10.219-7.212 7.326-13.173 13.437-19.718 17.844-2.836 1.65-6.99 1.08-8.875.968l-5.563 3.97c-31.718-33.262-74.904-54.526-121.406-58.657-.13-1.949-.3-5.471-.343-6.531-1.904-1.822-4.204-3.377-4.782-7.313-.636-7.864.426-16.324 1.656-26.531.68-4.769 1.808-8.73 2-13.906.044-1.177-.026-2.884-.03-4.156-.002-8.975-6.549-16.251-14.626-16.25zm-18.312 113.437l-4.344 76.72-.312.155c-.292 6.864-5.94 12.344-12.875 12.344-2.841 0-5.463-.912-7.594-2.469l-.125.063-62.906-44.594c19.333-19.011 44.063-33.06 72.562-39.531 5.206-1.182 10.41-2.06 15.594-2.688zm36.656 0c33.273 4.093 64.045 19.16 87.625 42.25l-62.5 44.313-.218-.094c-5.548 4.051-13.364 3.046-17.688-2.375-1.771-2.221-2.7-4.832-2.812-7.469l-.063-.031zm-147.625 70.875l57.438 51.375-.063.312c5.184 4.507 5.95 12.328 1.625 17.75-1.771 2.222-4.142 3.711-6.687 4.407l-.063.25-73.625 21.25c-3.747-34.266 4.33-67.574 21.375-95.344zm258.156.031c8.534 13.833 14.997 29.282 18.844 46.031 3.8 16.549 4.755 33.067 3.187 49.032l-74-21.313-.062-.312c-6.627-1.811-10.7-8.552-9.157-15.313.632-2.77 2.103-5.113 4.094-6.844l-.031-.156 57.125-51.125zm-140.656 55.312l23.53 0 14.626 18.282-5.25 22.812-21.125 10.156-21.188-10.187-5.25-22.813zm75.438 62.563c1-.05 1.995.04 2.968.219l.125-.156 76.157 12.875c-11.146 31.313-32.473 58.44-60.97 76.593l-29.562-71.406.094-.125c-2.716-6.31.002-13.71 6.25-16.719 1.6-.77 3.27-1.197 4.938-1.281zm-127.907.312c5.812.082 11.025 4.116 12.375 10.031.632 2.77.325 5.514-.719 7.938l.22.281-29.25 70.688c-27.348-17.549-49.13-43.825-60.782-76.063l75.5-12.812.125.156c.845-.156 1.701-.23 2.531-.22zm63.782 30.969c2.024-.074 4.078.341 6.03 1.281 2.56 1.233 4.538 3.173 5.782 5.5l.281 0 37.219 67.25c-4.83 1.62-9.796 3.004-14.875 4.157-28.465 6.462-56.839 4.504-82.531-4.25l37.125-67.126.062 0c2.228-4.164 6.453-6.648 10.907-6.812z"
    />
  </svg>
)

export function CloudProviderIcon({ provider, size = 16, className }: CloudProviderIconProps) {
  const iconProps = { size, className }

  switch (provider) {
    case 'eks':
      return <AWSIcon {...iconProps} />
    case 'gke':
      return <GCPIcon {...iconProps} />
    case 'aks':
      return <AzureIcon {...iconProps} />
    case 'openshift':
      return <OpenShiftIcon {...iconProps} />
    case 'oci':
      return <OCIIcon {...iconProps} />
    case 'alibaba':
      return <AlibabaIcon {...iconProps} />
    case 'digitalocean':
      return <DigitalOceanIcon {...iconProps} />
    case 'rancher':
      return <RancherIcon {...iconProps} />
    case 'coreweave':
      return <CoreWeaveIcon {...iconProps} />
    case 'kind':
      return <KindIcon {...iconProps} />
    case 'minikube':
      return <MinikubeIcon {...iconProps} />
    case 'k3s':
      return <K3sIcon {...iconProps} />
    case 'kubernetes':
    default:
      return <KubernetesIcon {...iconProps} />
  }
}

export function getProviderLabel(provider: CloudProvider): string {
  switch (provider) {
    case 'eks': return 'AWS EKS'
    case 'gke': return 'Google GKE'
    case 'aks': return 'Azure AKS'
    case 'openshift': return 'OpenShift'
    case 'oci': return 'Oracle OKE'
    case 'alibaba': return 'Alibaba ACK'
    case 'digitalocean': return 'DigitalOcean'
    case 'rancher': return 'Rancher'
    case 'coreweave': return 'CoreWeave'
    case 'kind': return 'Kind'
    case 'minikube': return 'Minikube'
    case 'k3s': return 'K3s'
    default: return 'Kubernetes'
  }
}

// Hook to get translated provider label
export function useProviderLabel(provider: CloudProvider): string {
  const { t } = useTranslation('common')

  switch (provider) {
    case 'eks': return t('cloudProviders.awsEks')
    case 'gke': return t('cloudProviders.googleGke')
    case 'aks': return t('cloudProviders.azureAks')
    case 'openshift': return t('cloudProviders.openshift')
    case 'oci': return t('cloudProviders.oracleOke')
    case 'alibaba': return t('cloudProviders.alibabaAck')
    case 'digitalocean': return t('cloudProviders.digitalocean')
    case 'rancher': return t('cloudProviders.rancher')
    case 'coreweave': return t('cloudProviders.coreweave')
    case 'kind': return t('cloudProviders.kind')
    case 'minikube': return t('cloudProviders.minikube')
    case 'k3s': return t('cloudProviders.k3s')
    default: return t('cloudProviders.kubernetes')
  }
}

// Get the primary brand color for each provider (for borders, accents, etc.)
export function getProviderColor(provider: CloudProvider): string {
  switch (provider) {
    case 'eks': return '#5B6AD4'         // EKS Blue/Purple
    case 'gke': return '#4285F4'         // Google Blue
    case 'aks': return '#773ADC'         // AKS Purple
    case 'openshift': return '#EE0000'   // Red Hat Red
    case 'oci': return '#C74634'         // Oracle Red
    case 'alibaba': return '#FF6A00'     // Alibaba Orange
    case 'digitalocean': return '#0080FF' // DO Blue
    case 'rancher': return '#2453FF'     // Rancher Blue
    case 'coreweave': return '#2741E7'   // CoreWeave Blue
    case 'kind': return '#2496ED'        // Kind Blue
    case 'minikube': return '#326CE5'    // K8s Blue
    case 'k3s': return '#FFC61C'         // K3s Yellow
    default: return '#326CE5'            // Kubernetes Blue
  }
}

// Get Tailwind border class for provider (for use in className)
export function getProviderBorderClass(provider: CloudProvider): string {
  switch (provider) {
    case 'eks': return 'border-indigo-500/40'
    case 'gke': return 'border-blue-500/40'
    case 'aks': return 'border-purple-500/40'
    case 'openshift': return 'border-red-500/40'
    case 'oci': return 'border-red-600/40'
    case 'alibaba': return 'border-orange-500/40'
    case 'digitalocean': return 'border-blue-400/40'
    case 'rancher': return 'border-blue-600/40'
    case 'coreweave': return 'border-indigo-600/40'
    case 'kind': return 'border-blue-400/40'
    case 'minikube': return 'border-blue-500/40'
    case 'k3s': return 'border-yellow-500/40'
    default: return 'border-blue-500/40'
  }
}

// Get console URL for cloud providers
export function getConsoleUrl(provider: CloudProvider, clusterName: string, apiServerUrl?: string): string | null {
  const serverUrl = apiServerUrl?.toLowerCase() || ''

  switch (provider) {
    case 'eks': {
      const urlRegionMatch = serverUrl.match(/\.([a-z]{2}-[a-z]+-\d)\.eks\.amazonaws\.com/)
      if (urlRegionMatch) {
        return `https://${urlRegionMatch[1]}.console.aws.amazon.com/eks/home?region=${urlRegionMatch[1]}#/clusters`
      }
      const nameRegionMatch = clusterName.match(/([a-z]{2}-[a-z]+-\d)/)
      if (nameRegionMatch) {
        return `https://${nameRegionMatch[1]}.console.aws.amazon.com/eks/home?region=${nameRegionMatch[1]}#/clusters`
      }
      return 'https://console.aws.amazon.com/eks/home#/clusters'
    }
    case 'gke':
      return 'https://console.cloud.google.com/kubernetes/list/overview'
    case 'aks':
      return 'https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.ContainerService%2FmanagedClusters'
    case 'openshift': {
      // Handle URLs with or without protocol prefix
      const apiMatch = apiServerUrl?.match(/(?:https?:\/\/)?api\.([^:\/]+)/)
      if (apiMatch) {
        return `https://console-openshift-console.apps.${apiMatch[1]}`
      }
      return null
    }
    case 'oci': {
      const regionMatch = serverUrl.match(/\.([a-z]+-[a-z]+-\d)\.clusters\.oci/)
      if (regionMatch) {
        return `https://cloud.oracle.com/containers/clusters?region=${regionMatch[1]}`
      }
      return 'https://cloud.oracle.com/containers/clusters?region=us-ashburn-1'
    }
    case 'alibaba':
      return 'https://cs.console.aliyun.com/#/k8s/cluster/list'
    case 'digitalocean':
      return 'https://cloud.digitalocean.com/kubernetes/clusters'
    case 'coreweave':
      return 'https://cloud.coreweave.com/kubernetes'
    default:
      return null
  }
}

// Provider detection from cluster name, API server URL, user, and optionally namespaces
// Priority: 1. Namespace-based (most accurate), 2. Name-based, 3. User-based, 4. URL-based
export function detectCloudProvider(
  clusterName: string,
  apiServerUrl?: string,
  namespaces?: string[],
  userName?: string
): CloudProvider {
  const name = clusterName.toLowerCase()
  const serverUrl = apiServerUrl?.toLowerCase() || ''
  const user = userName?.toLowerCase() || ''

  // Check namespace-based patterns FIRST (most accurate when available)
  if (namespaces && namespaces.length > 0) {
    const nsLower = namespaces.map(ns => ns.toLowerCase())

    // OpenShift - has openshift-* namespaces
    if (nsLower.some(ns => ns.startsWith('openshift-') || ns === 'openshift')) {
      return 'openshift'
    }
    // EKS - has aws-observability or amazon-* namespaces
    if (nsLower.some(ns => ns.startsWith('aws-') || ns.startsWith('amazon-') || ns === 'amazon-cloudwatch')) {
      return 'eks'
    }
    // GKE - has gke-* or config-management-system namespaces
    if (nsLower.some(ns => ns.startsWith('gke-') || ns === 'config-management-system' || ns === 'gke-managed-filestorecsi')) {
      return 'gke'
    }
    // AKS - has azure-* namespaces or kube-node-lease with azure annotations
    if (nsLower.some(ns => ns.startsWith('azure-') || ns === 'azure-arc')) {
      return 'aks'
    }
    // OCI - has oci-* or oraclecloud-* namespaces
    if (nsLower.some(ns => ns.startsWith('oci-') || ns.startsWith('oraclecloud-'))) {
      return 'oci'
    }
    // Rancher - has cattle-system or rancher namespaces
    if (nsLower.some(ns => ns === 'cattle-system' || ns === 'cattle-fleet-system' || ns.startsWith('cattle-'))) {
      return 'rancher'
    }
    // K3s - has k3s-system namespace
    if (nsLower.some(ns => ns === 'k3s-system')) {
      return 'k3s'
    }
  }

  // Check name-based patterns (second priority)
  // Oracle OCI OKE - check name first since "oci" in name is definitive
  if (name.includes('oci') || name.includes('oke') || name.includes('oracle')) {
    return 'oci'
  }
  // AWS EKS by name
  if (name.includes('eks') || name.includes('aws') || name.match(/arn:aws:/)) {
    return 'eks'
  }
  // Google GKE by name
  if (name.includes('gke') || name.includes('gcp') || name.includes('google')) {
    return 'gke'
  }
  // Azure AKS by name
  if (name.includes('aks') || name.includes('azure')) {
    return 'aks'
  }
  // OpenShift by name (explicit indicators)
  if (name.includes('openshift') || name.includes('ocp') || name.includes('rosa')) {
    return 'openshift'
  }
  // Alibaba Cloud ACK by name
  if (name.includes('alibaba') || name.includes('aliyun') || name.includes('ack')) {
    return 'alibaba'
  }
  // DigitalOcean by name
  if (name.includes('digitalocean') || name.includes('do-') || name.includes('doks')) {
    return 'digitalocean'
  }
  // CoreWeave by name
  if (name.includes('coreweave')) return 'coreweave'
  // Rancher by name
  if (name.includes('rancher')) return 'rancher'
  // Local development clusters by name
  if (name.includes('kind')) return 'kind'
  if (name.includes('minikube')) return 'minikube'
  if (name.includes('k3s') || name.includes('k3d')) return 'k3s'

  // Check URL-based patterns (fallback for when name doesn't help)
  // AWS EKS by URL
  if (serverUrl.includes('.eks.amazonaws.com')) {
    return 'eks'
  }
  // Google GKE by URL
  if (serverUrl.includes('container.googleapis.com') || serverUrl.includes('.container.cloud.google.com') || serverUrl.includes('gke.io')) {
    return 'gke'
  }
  // Azure AKS by URL
  if (serverUrl.includes('.azmk8s.io')) {
    return 'aks'
  }
  // Oracle OCI by URL
  if (serverUrl.includes('.oraclecloud.com')) {
    return 'oci'
  }
  // Alibaba Cloud by URL
  if (serverUrl.includes('.aliyuncs.com')) {
    return 'alibaba'
  }
  // DigitalOcean by URL
  if (serverUrl.includes('.digitalocean.com') || serverUrl.includes('k8s.ondigitalocean')) {
    return 'digitalocean'
  }
  // CoreWeave by URL
  if (serverUrl.includes('.coreweave.com')) {
    return 'coreweave'
  }
  // OpenShift by URL - check for specific OpenShift domains (NOT just :6443 port)
  if (serverUrl.includes('openshift.com') || serverUrl.includes('openshiftapps.com') || serverUrl.includes('.openshift.')) {
    return 'openshift'
  }

  // Check user-based patterns (OKE generates user names like "user-chbezebxx3a")
  // OKE user pattern: user-[lowercase_alphanumeric_10-12_chars]
  if (user.match(/^user-[a-z0-9]{10,12}$/)) {
    return 'oci'
  }

  return 'kubernetes'
}
