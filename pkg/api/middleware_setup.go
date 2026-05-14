package api

import (
"fmt"
"strings"

"github.com/gofiber/fiber/v2"
"github.com/gofiber/fiber/v2/middleware/compress"
"github.com/gofiber/fiber/v2/middleware/cors"
"github.com/gofiber/fiber/v2/middleware/logger"
"github.com/gofiber/fiber/v2/middleware/recover"
)

func (s *Server) setupMiddleware() {
	// Recovery middleware
	s.app.Use(recover.New())

	// Gzip/Brotli compression for API responses only — static assets are pre-compressed at build time.
	// The handler is created once and reused across requests (#7575).
	compressHandler := compress.New(compress.Config{
		Level: compress.LevelBestCompression,
	})
	s.app.Use(func(c *fiber.Ctx) error {
		p := c.Path()
		if strings.HasSuffix(p, ".js") || strings.HasSuffix(p, ".css") || strings.HasSuffix(p, ".wasm") || strings.HasSuffix(p, ".json") || strings.HasSuffix(p, ".svg") || strings.HasSuffix(p, ".woff2") {
			return c.Next() // skip compress middleware — served pre-compressed with Content-Length
		}
		return compressHandler(c)
	})

	// Logger
	s.app.Use(logger.New(logger.Config{
		Format:     "${time} | ${status} | ${latency} | ${method} ${path}\n",
		TimeFormat: "15:04:05",
	}))

	// CORS
	s.app.Use(cors.New(cors.Config{
		AllowOrigins:     s.config.FrontendURL,
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-Requested-With,X-KC-Client-Auth",
		ExposeHeaders:    "X-Token-Refresh",
		AllowCredentials: true,
	}))

	// Security headers (#7037 CSP, #7038 HSTS)
	s.app.Use(func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		// Skip X-Frame-Options: DENY for /embed/* routes to allow iframe embedding
		// These routes display public CI/CD data and are designed for embedding
		if !strings.HasPrefix(c.Path(), "/embed/") {
			c.Set("X-Frame-Options", "DENY")
		}
		c.Set("X-XSS-Protection", "0") // Disabled per OWASP — modern browsers don't need it and it can introduce vulnerabilities
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		// Content-Security-Policy: restrict script/style sources to self and
		// known analytics/CDN origins. 'unsafe-inline' is required for Vite
		// dev mode injected styles and inline event handlers in the SPA.
		//
		// connect-src includes the local kc-agent (port 8585) for both HTTP
		// and WebSocket on 127.0.0.1 and localhost. Without these, the
		// browser blocks all frontend→agent communication because the agent
		// runs on a different port than the backend (cross-origin).
		// See: web/src/lib/constants/network.ts (LOCAL_AGENT_HTTP_URL,
		// LOCAL_AGENT_WS_URL) for the exact URLs the frontend uses.
		const kcAgentLoopback = "http://127.0.0.1:8585"  // kc-agent HTTP on loopback IP
		const kcAgentLoopbackWS = "ws://127.0.0.1:8585"  // kc-agent WebSocket on loopback IP
		const kcAgentLocalhost = "http://localhost:8585" // kc-agent HTTP on localhost
		const kcAgentLocalhostWS = "ws://localhost:8585" // kc-agent WebSocket on localhost

		customKCAgentConnectSrc := ""
		if kcAgentBaseURL != kcAgentLoopback && kcAgentBaseURL != kcAgentLocalhost {
			customKCAgentConnectSrc = " " + kcAgentBaseURL
			if kcAgentBaseURLWS := kcAgentWebSocketBaseURL(kcAgentBaseURL); kcAgentBaseURLWS != "" {
				customKCAgentConnectSrc += " " + kcAgentBaseURLWS
			}
		}

		// script-src includes 'wasm-unsafe-eval' because the SQLite cache
		// worker compiles a WebAssembly module at runtime; without it the
		// worker aborts, logs a noisy CompileError, and forces an IndexedDB
		// fallback on every page load. 'wasm-unsafe-eval' is a narrower
		// permission than 'unsafe-eval' — it allows WebAssembly.instantiate
		// but still blocks JS eval/Function.
		//
		// connect-src includes https://cdn.jsdelivr.net because the login
		// page's Three.js globe renders cluster labels via troika-three-text,
		// which fetches a unicode font resolver from jsdelivr at runtime.
		// Without it the font lookup throws, labels fail to render, and the
		// globe initialization aborts — leaving the right side of the login
		// page blank.
		//
		// connect-src includes https://raw.githubusercontent.com because the
		// Marketplace page fetches registry.json from the console-marketplace
		// repo on GitHub (#10653). Without it the browser blocks the request.
		c.Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://www.googletagmanager.com; "+
				"worker-src 'self' blob:; "+
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "+
				"img-src 'self' data: https:; "+
				"connect-src 'self' "+kcAgentLoopback+" "+kcAgentLoopbackWS+" "+kcAgentLocalhost+" "+kcAgentLocalhostWS+customKCAgentConnectSrc+" https://console.kubestellar.io https://api.github.com https://raw.githubusercontent.com https://www.google-analytics.com https://www.googletagmanager.com https://cdn.jsdelivr.net wss:; "+
				"font-src 'self' data: https://fonts.gstatic.com; "+
				"object-src 'none'; "+
				"base-uri 'self'")

		// Strict-Transport-Security: instruct browsers to always use HTTPS.
		// Only emitted when the request arrived over TLS (or via a TLS-terminating
		// proxy) to avoid breaking local HTTP development (#7038).
		if c.Protocol() == "https" {
			const hstsMaxAgeSec = 63072000 // 2 years in seconds
			c.Set("Strict-Transport-Security",
				fmt.Sprintf("max-age=%d; includeSubDomains", hstsMaxAgeSec))
		}

		return c.Next()
	})
}

// startupLoadingHTML is a self-contained loading page served while the server initializes.
// It polls /health and reloads automatically when the server is ready.
const startupLoadingHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KubeStellar Console</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a1a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
.wrap{text-align:center}
.spinner{width:40px;height:40px;border:3px solid rgba(99,102,241,.2);border-top-color:#6366f1;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 1.5rem}
@keyframes spin{to{transform:rotate(360deg)}}
h1{font-size:1.25rem;font-weight:500;margin-bottom:.5rem}
p{color:#94a3b8;font-size:.875rem}
.stars{position:fixed;inset:0;pointer-events:none}
.star{position:absolute;width:2px;height:2px;background:#fff;border-radius:50%;opacity:.3;animation:twinkle 3s ease-in-out infinite}
@keyframes twinkle{0%,100%{opacity:.2}50%{opacity:.6}}
</style>
</head>
<body>
<div class="stars" id="stars"></div>
<div class="wrap">
<div class="spinner"></div>
<h1>KubeStellar Console</h1>
<p>KubeStellar Console is loading, please wait&hellip;</p>
</div>
<script>
// Star field
(function(){var s=document.getElementById('stars');for(var i=0;i<30;i++){var d=document.createElement('div');d.className='star';d.style.left=Math.random()*100+'%';d.style.top=Math.random()*100+'%';d.style.animationDelay=Math.random()*3+'s';s.appendChild(d)}})();
// Poll /healthz and reload when ready
setInterval(async function(){try{var r=await fetch('/healthz');if(r.ok){var d=await r.json();if(d.status==='ok')location.reload()}}catch(e){}},2000);
</script>
</body>
</html>`
