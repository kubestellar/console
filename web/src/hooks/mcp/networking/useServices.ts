import { getDemoServices, loadServicesCacheFromStorage } from './shared'

export { useServices } from './servicesCore'
export { subscribeNetworkingCache } from './shared'

export const __networkingTestables = {
  loadServicesCacheFromStorage,
  getDemoServices,
}
