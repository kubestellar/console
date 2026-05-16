import { createContext, useContext } from 'react'

interface CreateStateContextOptions<T> {
  name: string
  hookName?: string
  providerLabel?: string
  createFallbackValue?: () => T
}

export function createStateContext<T>({
  name,
  hookName = `use${name}`,
  providerLabel = `${name}Provider`,
  createFallbackValue,
}: CreateStateContextOptions<T>) {
  const Context = createContext<T | null>(null)

  function useRequiredStateContext(): T {
    const value = useContext(Context)
    if (value !== null) return value
    if (createFallbackValue) return createFallbackValue()
    throw new Error(`${hookName} must be used within ${providerLabel}`)
  }

  function useOptionalStateContext(): T | null {
    return useContext(Context)
  }

  return {
    Context,
    useRequiredStateContext,
    useOptionalStateContext,
  }
}
