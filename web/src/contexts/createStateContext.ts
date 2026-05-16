import { createContext, useContext } from 'react'

interface CreateStateContextOptions<T> {
  name: string
  createFallbackValue?: () => T
}

export function createStateContext<T>({ name, createFallbackValue }: CreateStateContextOptions<T>) {
  const Context = createContext<T | null>(null)

  function useRequiredStateContext(): T {
    const value = useContext(Context)
    if (value !== null) return value
    if (createFallbackValue) return createFallbackValue()
    throw new Error(`use${name} must be used within a ${name}Provider`)
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
