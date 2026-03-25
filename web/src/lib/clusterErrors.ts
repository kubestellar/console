/**
 * Maps known backend error patterns to user-friendly guidance messages.
 * Falls through to the original message when no pattern matches.
 */
export function friendlyErrorMessage(raw: string): string {
  if (!raw) return 'An unknown error occurred.'

  // Docker not running (kind/k3d pre-flight)
  if (/docker is not running/i.test(raw)) {
    return 'Docker is not running. Please start Docker Desktop or Rancher Desktop and try again.'
  }

  // Cluster name validation - RFC-1123 subdomain / kind regex
  if (/invalid.*name|must consist of lower case alphanumeric|not a valid cluster name|cluster names must match/i.test(raw)) {
    return 'Invalid cluster name. Use only lowercase letters, numbers, dots, or hyphens (e.g. "my-cluster-1").'
  }

  // Cluster already exists
  if (/already exists/i.test(raw)) {
    return 'A cluster with that name already exists. Choose a different name or delete the existing cluster first.'
  }

  // Tool not found / unsupported
  if (/unsupported tool/i.test(raw)) {
    return 'The selected cluster tool is not supported. Please choose kind, k3d, or minikube.'
  }

  // Command not found on PATH
  if (/executable file not found|command not found/i.test(raw)) {
    return 'The cluster tool binary was not found on the system PATH. Please install it and try again.'
  }

  // Timeout
  if (/timed?\s*out|deadline exceeded/i.test(raw)) {
    return 'The operation timed out. Check your network connection and system resources, then try again.'
  }

  // Fall through: return the backend message as-is (already sanitized server-side)
  return raw
}
