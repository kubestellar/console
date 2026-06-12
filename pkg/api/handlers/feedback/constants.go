package feedback

import "github.com/kubestellar/console/pkg/api/handlers/auth"

// maxGitHubResponseBytes caps the size of GitHub API response bodies that
// the handler will buffer, preventing memory exhaustion from large responses.
const maxGitHubResponseBytes = 10 * 1024 * 1024 // 10 MB

// clientAuthCookieName is the cookie name for client authentication.
const clientAuthCookieName = auth.ClientAuthCookieName

// fiberTestTimeout is the timeout for Fiber app.Test() calls in milliseconds.
const fiberTestTimeout = 5000
