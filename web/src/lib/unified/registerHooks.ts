/**
 * Unified Card System - Hook Registration
 *
 * This file registers data hooks with the unified card system.
 * Import this file early in the application (e.g., in main.tsx) to make
 * hooks available for unified cards.
 *
 * IMPORTANT: These hooks are called inside the useDataSource hook,
 * which is a React hook. The registered functions must follow React's
 * rules of hooks - they are called consistently on every render.
 */

export { registerUnifiedHooks } from './registerHooks/index'

import { registerUnifiedHooks as autoRegisterUnifiedHooks } from './registerHooks/index'

// Auto-register when this module is imported
autoRegisterUnifiedHooks()
