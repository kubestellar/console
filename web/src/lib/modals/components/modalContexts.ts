/**
 * Shared React contexts for BaseModal and its sub-components.
 *
 * Extracted from BaseModal.tsx so the header sub-component can consume
 * these without importing the full modal container.
 */

import { createContext } from 'react'

// React Context so ModalHeader can receive the generated title ID
export const ModalTitleIdContext = createContext<string | undefined>(undefined)

// React Context so ModalHeader can read whether Escape-to-close is enabled,
// which drives the close button's tooltip + aria-label keyboard hint.
// Defaults to true to preserve behavior for any ModalHeader rendered outside
// a BaseModal provider (none today, but defensive).
export const ModalEscapeContext = createContext<{ escapeEnabled: boolean }>({ escapeEnabled: true })
