package providers

import (
	"fmt"
	"net/url"
	"strings"
)

func ValidateProviderURL(rawURL, _ string) error {
	trimmedURL := strings.TrimSpace(rawURL)
	if trimmedURL == "" {
		return nil
	}

	parsedURL, err := url.Parse(trimmedURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("URL scheme must be http or https, got %q", parsedURL.Scheme)
	}
	if parsedURL.Host == "" {
		return fmt.Errorf("URL must have a host")
	}

	return nil
}
