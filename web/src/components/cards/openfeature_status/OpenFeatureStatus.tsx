/**
 * OpenFeature Status Card — thin forward to the canonical implementation.
 *
 * The canonical card lives in ./index.tsx. This file exists as a compatibility
 * shim for historical imports (existing tests, documentation, and dashboard
 * entries reference `./OpenFeatureStatus` by name).
 */
export { OpenFeatureStatus, default } from './index'
