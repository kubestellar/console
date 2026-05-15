/**
 * Validates that a URL is safe for use in href attributes.
 * 
 * Prevents XSS via javascript: protocol and open-redirect attacks
 * by allowlisting only http: and https: protocols.
 * 
 * @param url - The URL string to validate
 * @returns The validated URL string if safe, null otherwise
 */
export function validateExternalUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }

  try {
    const parsed = new URL(url)
    
    // Allowlist only http and https protocols
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url
    }
    
    return null
  } catch {
    // Invalid URL
    return null
  }
}
