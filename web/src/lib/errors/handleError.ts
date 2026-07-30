export type ErrorLogLevel = 'warn' | 'error'

export interface ReportAppErrorOptions {
  context: string
  level?: ErrorLogLevel
  fallbackMessage?: string
}

export function getUserSafeErrorMessage(
  error: unknown,
  fallbackMessage = 'Something went wrong.',
): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return fallbackMessage
}

export function reportAppError(
  error: unknown,
  { context, level = 'error', fallbackMessage = 'Unknown error' }: ReportAppErrorOptions,
): string {
  const message = getUserSafeErrorMessage(error, fallbackMessage)
  const line = `${context}: ${message}`
  if (level === 'warn') {
    console.warn(line)
  } else {
    console.error(line)
  }
  return message
}
