// The raw AuthContext object, extracted into its own file so AuthContext.tsx
// only exports the AuthProvider component. Fast refresh (react-refresh/
// only-export-components) requires component files to export components
// only — see #22976.

import { createContext } from 'react'
import type { AuthContextType } from './types'

export const AuthContext = createContext<AuthContextType | null>(null)
