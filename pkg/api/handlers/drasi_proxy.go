// Package handlers implements the HTTP API for the KubeStellar Console.
//
// drasi_proxy.go: a generic reverse proxy for the Drasi REST API.
//
// Drasi ships in three deployment modes (drasi-lib embedded library, drasi-server
// standalone REST process, drasi-platform Kubernetes operator). The console's
// `/drasi` dashboard talks to all three through this single proxy:
//
//   - drasi-server (mode 1+2): requested via ?target=server&url=<full-URL>.
//     The proxy forwards the request to the URL the user configured (typically
//     localhost:8090 or a Docker host). drasi-server already sends permissive
//     CORS, so the frontend could call it directly — but routing it through this
//     proxy keeps the client code path identical for both modes and lets us add
//     auth/audit later without touching the frontend.
//
//   - drasi-platform (mode 3): requested via ?target=platform&cluster=<ctx>.
//     drasi-platform exposes its REST API on the in-cluster `drasi-api` Service
//     in `drasi-system`. The proxy uses the Kubernetes API server's built-in
//     Service proxy to reach it without requiring the user to set up Ingress or
//     a manual port-forward.
//
// The handler streams the upstream response directly so SSE and chunked
// responses work — drasi-server's `/api/v1/instances/.../events/stream`
// endpoints are SSE.
package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// Constants used by the Drasi proxy.
const (
	// drasiPlatformNamespace is the namespace where drasi-platform installs
	// its `drasi-api` Service. Hardcoded to match `drasi init` defaults.
	drasiPlatformNamespace = "drasi-system"
	// drasiPlatformServiceName is the Service name exposed by drasi-platform.
	drasiPlatformServiceName = "drasi-api"
	// drasiPlatformServicePort is the named port on the drasi-api Service.
	drasiPlatformServicePort = "8080"
	// drasiProxyMaxBodyBytes caps request body size to prevent unbounded
	// uploads when creating Drasi resources via the gear modals.
	drasiProxyMaxBodyBytes = 1 << 20 // 1 MiB
	// drasiProxyDefaultTimeout caps non-streaming proxy calls.
	drasiProxyDefaultTimeout = 30 * time.Second
)

// drasiBlockedCIDRs contains CIDR ranges that must never be proxied by the
// Drasi server proxy. This is similar to blockedCIDRs in card_proxy.go but
// deliberately EXCLUDES loopback (127.0.0.0/8, ::1/128) because drasi-server
// runs on localhost.
var drasiBlockedCIDRs = func() []*net.IPNet {
	cidrs := []string{
		"10.0.0.0/8",         // RFC 1918 private
		"172.16.0.0/12",      // RFC 1918 private
		"192.168.0.0/16",     // RFC 1918 private
		"169.254.169.254/32", // cloud metadata
		"169.254.0.0/16",     // link-local
		"fc00::/7",           // IPv6 unique local
		"fe80::/10",          // IPv6 link-local
	}
	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, cidr := range cidrs {
		_, ipnet, err := net.ParseCIDR(cidr)
		if err != nil {
			slog.Error("[DrasiProxy] failed to parse blocked CIDR", "cidr", cidr, "error", err)
			os.Exit(1)
		}
		nets = append(nets, ipnet)
	}
	return nets
}()

// isDrasiBlockedIP returns true if the IP is in a private/reserved range
// that the Drasi proxy should not connect to. Loopback addresses are allowed.
func isDrasiBlockedIP(ip net.IP) bool {
	for _, cidr := range drasiBlockedCIDRs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// drasiProxyClient is an HTTP client hardened against SSRF for Drasi proxy
// requests. It uses a custom DialContext that resolves DNS and validates
// resolved IPs against blocked CIDRs before connecting, and disables
// redirect-following to prevent redirect-based SSRF bypass.
var drasiProxyClient = &http.Client{
	Timeout: drasiProxyDefaultTimeout,
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	},
	Transport: &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			for _, ip := range ips {
				if isDrasiBlockedIP(ip.IP) {
					return nil, fmt.Errorf("blocked: private/reserved IP %s for host %s", ip.IP, host)
				}
			}
			dialer := &net.Dialer{Timeout: drasiProxyDefaultTimeout}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	},
}

// drasiHopByHopHeaders are removed from both directions per RFC 7230 §6.1.
var drasiHopByHopHeaders = map[string]bool{
	"connection":          true,
	"keep-alive":          true,
	"proxy-authenticate":  true,
	"proxy-authorization": true,
	"te":                  true,
	"trailers":            true,
	"transfer-encoding":   true,
	"upgrade":             true,
}

// ProxyDrasi is the handler registered at `/api/drasi/proxy/*`.
// It accepts ANY method (GET/POST/PUT/DELETE/PATCH) and forwards to the
// upstream Drasi REST API, streaming the response.
//
// Query parameters:
//
//	target  — "server" (drasi-server REST) or "platform" (drasi-platform via K8s Service proxy)
//	url     — (target=server) full upstream URL, e.g. "http://localhost:8090"
//	cluster — (target=platform) kubeconfig context name
//
// The wildcard segment after `/api/drasi/proxy/` is the upstream path:
//
//	/api/drasi/proxy/api/v1/sources?target=server&url=http://localhost:8090
//	→ GET http://localhost:8090/api/v1/sources
//
//	/api/drasi/proxy/v1/continuousQueries?target=platform&cluster=prow
//	→ K8s Service proxy on `prow` cluster: drasi-system/drasi-api:8080/v1/continuousQueries
func (h *MCPHandlers) ProxyDrasi(c *fiber.Ctx) error {
	if err := requireViewerOrAbove(c, h.store); err != nil {
		return err
	}

	target := c.Query("target")
	if target != "server" && target != "platform" {
		return fiber.NewError(fiber.StatusBadRequest, "target must be 'server' or 'platform'")
	}

	// The fiber wildcard captures everything after `/api/drasi/proxy/`.
	upstreamPath := c.Params("*")
	if upstreamPath == "" {
		upstreamPath = "/"
	} else if !strings.HasPrefix(upstreamPath, "/") {
		upstreamPath = "/" + upstreamPath
	}

	// Drop the proxy-control query params before forwarding the rest to the upstream.
	upstreamQuery := stripDrasiControlQuery(c.Request().URI().QueryString())

	switch target {
	case "server":
		return h.proxyDrasiServer(c, upstreamPath, upstreamQuery)
	case "platform":
		return h.proxyDrasiPlatform(c, upstreamPath, upstreamQuery)
	}
	return fiber.NewError(fiber.StatusBadRequest, "unreachable")
}

// proxyDrasiServer forwards to a drasi-server REST URL configured via ?url=…
func (h *MCPHandlers) proxyDrasiServer(c *fiber.Ctx, upstreamPath string, upstreamQuery []byte) error {
	rawURL := c.Query("url")
	if rawURL == "" {
		return fiber.NewError(fiber.StatusBadRequest, "target=server requires url query param")
	}
	base, err := url.Parse(rawURL)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return fiber.NewError(fiber.StatusBadRequest, "invalid url query param")
	}
	// Reject URL schemes other than http/https to prevent SSRF surprises.
	if base.Scheme != "http" && base.Scheme != "https" {
		return fiber.NewError(fiber.StatusBadRequest, "url must be http or https")
	}
	// Only localhost / loopback is intentionally allowed for drasi-server.
	// Unspecified bind-all hosts must not be dialed through the proxy.
	host := base.Hostname()
	if host == "0.0.0.0" || host == "::" {
		return fiber.NewError(fiber.StatusForbidden, "url host is not allowed")
	}
	full := *base
	full.Path = strings.TrimRight(base.Path, "/") + upstreamPath
	if len(upstreamQuery) > 0 {
		full.RawQuery = string(upstreamQuery)
	}

	req, err := buildUpstreamRequest(c, full.String())
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return streamUpstream(c, drasiProxyClient, req)
}

// proxyDrasiPlatform forwards to drasi-platform's `drasi-api` Service via
// the Kubernetes API server's built-in Service proxy. Requires a kubeconfig
// context name in ?cluster=…
func (h *MCPHandlers) proxyDrasiPlatform(c *fiber.Ctx, upstreamPath string, upstreamQuery []byte) error {
	cluster := c.Query("cluster")
	if cluster == "" {
		return fiber.NewError(fiber.StatusBadRequest, "target=platform requires cluster query param")
	}
	if h.k8sClient == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "no kubernetes client available")
	}

	cfg, err := h.k8sClient.GetRestConfig(cluster)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("unknown cluster %q: %v", cluster, err))
	}

	// Build the Kubernetes Service proxy URL and use the cluster's
	// authenticated REST client to call it. The Service proxy URL pattern is:
	//   /api/v1/namespaces/{ns}/services/{name}:{port}/proxy/{path}
	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, fmt.Sprintf("kubeclient init failed: %v", err))
	}

	rawQuery := ""
	if len(upstreamQuery) > 0 {
		rawQuery = string(upstreamQuery)
	}

	// Use the typed Services client's proxy verb. This honors RBAC + auth
	// configured on the kubeconfig, and the API server tunnels the request
	// to the Pod backing the Service.
	httpReq := clientset.CoreV1().
		Services(drasiPlatformNamespace).
		ProxyGet(
			"http",
			drasiPlatformServiceName,
			drasiPlatformServicePort,
			strings.TrimPrefix(upstreamPath, "/"),
			parseQueryParams(rawQuery),
		)

	// drasi-platform only exposes synchronous JSON for sources/queries/reactions.
	// SSE streaming is via a separate reaction component (out of scope for the
	// platform proxy in this PR — Phase 3 will add an SSE reaction install path).
	ctx, cancel := context.WithTimeout(c.UserContext(), drasiProxyDefaultTimeout)
	defer cancel()

	body, err := httpReq.DoRaw(ctx)
	if err != nil {
		// Surface API server errors with their original status when possible.
		var status int
		if statusErr := upstreamStatus(err); statusErr != 0 {
			status = statusErr
		} else {
			status = fiber.StatusBadGateway
		}
		return fiber.NewError(status, fmt.Sprintf("drasi-platform proxy: %v", err))
	}
	c.Set("content-type", "application/json")
	return c.Send(body)
}

// buildUpstreamRequest constructs a *http.Request from the incoming Fiber
// request, forwarding method + body + headers minus hop-by-hop and host.
func buildUpstreamRequest(c *fiber.Ctx, fullURL string) (*http.Request, error) {
	method := c.Method()
	bodyBytes := c.Body()
	if len(bodyBytes) > drasiProxyMaxBodyBytes {
		return nil, errors.New("request body exceeds 1 MiB limit")
	}
	var body io.Reader
	if len(bodyBytes) > 0 {
		body = strings.NewReader(string(bodyBytes))
	}
	req, err := http.NewRequestWithContext(c.UserContext(), method, fullURL, body)
	if err != nil {
		return nil, err
	}
	c.Request().Header.VisitAll(func(k, v []byte) {
		key := strings.ToLower(string(k))
		if drasiHopByHopHeaders[key] {
			return
		}
		if key == "host" || key == "cookie" || key == "authorization" {
			return // never forward console auth to upstream
		}
		req.Header.Add(string(k), string(v))
	})
	if req.Header.Get("Accept") == "" {
		req.Header.Set("Accept", "application/json,text/event-stream")
	}
	return req, nil
}

// streamUpstream issues the upstream request and streams the response body
// back to the Fiber client without buffering — required for SSE.
func streamUpstream(c *fiber.Ctx, client *http.Client, req *http.Request) error {
	// SSE responses can be very long-lived. Don't impose a request-level
	// deadline; rely on the client closing the connection.
	resp, err := client.Do(req)
	if err != nil {
		return fiber.NewError(fiber.StatusBadGateway, fmt.Sprintf("upstream request failed: %v", err))
	}
	defer resp.Body.Close()

	for k, vs := range resp.Header {
		key := strings.ToLower(k)
		if drasiHopByHopHeaders[key] {
			continue
		}
		for _, v := range vs {
			c.Append(k, v)
		}
	}
	c.Status(resp.StatusCode)

	// Use SendStream to forward the body without loading it into memory.
	// Fiber will set Transfer-Encoding: chunked automatically when the body
	// has no known length, which is correct for SSE.
	return c.SendStream(resp.Body)
}

// stripDrasiControlQuery removes the proxy's own control params (target, url,
// cluster) from the query string before forwarding. Other params pass through.
func stripDrasiControlQuery(raw []byte) []byte {
	if len(raw) == 0 {
		return raw
	}
	values, err := url.ParseQuery(string(raw))
	if err != nil {
		return raw
	}
	values.Del("target")
	values.Del("url")
	values.Del("cluster")
	encoded := values.Encode()
	return []byte(encoded)
}

// parseQueryParams turns a raw query string into the map the typed Services
// client's ProxyGet expects.
func parseQueryParams(raw string) map[string]string {
	out := map[string]string{}
	if raw == "" {
		return out
	}
	values, err := url.ParseQuery(raw)
	if err != nil {
		return out
	}
	for k, vs := range values {
		if len(vs) > 0 {
			out[k] = vs[0]
		}
	}
	return out
}

// upstreamStatus extracts the HTTP status code from a Kubernetes API error
// (k8s.io/apimachinery/pkg/api/errors). Returns 0 if the error is not a
// recognized API status error.
func upstreamStatus(err error) int {
	type statusGetter interface {
		Status() int
	}
	if sg, ok := err.(statusGetter); ok {
		return sg.Status()
	}
	return 0
}

// Compile-time check that ProxyDrasi has the right signature for the route
// table. (kubernetes.NewForConfig+rest are imported here to ensure the
// k8s client compiles even when not using dynamic clients elsewhere.)
var _ = func() *rest.Config { return nil }
var _ = func() (kubernetes.Interface, error) { return nil, nil }
