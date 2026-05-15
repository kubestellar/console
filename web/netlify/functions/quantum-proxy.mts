import type { Context } from "@netlify/functions";
import { enforceSimpleRateLimit } from "./_shared/rate-limit";

const RATE_LIMIT_STORE_NAME = "quantum-proxy-rate-limit";
const QUANTUM_PROXY_RATE_LIMIT_MAX_REQUESTS = 500;
const QUANTUM_PROXY_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// Demo data responses
const DEMO_STATUS = {
  status: "ready",
  backend: "Aer Simulator",
  version: "1.0.0",
  circuits_executed: 42,
};

const DEMO_QUBITS_SIMPLE = {
  qubits: [0, 1, 2, 3, 4],
  native_gates: ["u", "cx"],
};

const DEMO_EXECUTE_RESPONSE = {
  job_id: "demo-job-123",
  status: "completed",
  result: {
    counts: {
      "000": 512,
      "111": 512,
    },
  },
};

const DEMO_LOOP_RESPONSE = {
  status: "started",
  loop_id: "demo-loop-456",
};

const DEMO_CIRCUIT_ASCII_HTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Circuit Diagram</title>
    <style>
        body { font-family: monospace; margin: 20px; background: #f5f5f5; }
        pre { background: white; padding: 15px; border-radius: 5px; overflow-x: auto; border: 1px solid #ddd; }
    </style>
</head>
<body>
    <pre>     ┌───┐ ░ ┌─┐
q_0: ┤ H ├─░─┤M├─────────
     ├───┤ ░ └╥┘┌─┐
q_1: ┤ H ├─░──╫─┤M├──────
     ├───┤ ░  ║ └╥┘┌─┐
q_2: ┤ H ├─░──╫──╫─┤M├───
     ├───┤ ░  ║  ║ └╥┘┌─┐
q_3: ┤ H ├─░──╫──╫──╫─┤M├
     ├───┤ ░  ║  ║  ║ └╥┘
q_4: ┤ H ├─░──╫──╫──╫──╫─
     └───┘ ░  ║  ║  ║  ║
c: 5/═════════╩══╩══╩══╩═
              0  1  2  3 </pre>
</body>
</html>`;

// Allowlist of valid proxy path prefixes — reject anything not matching
const ALLOWED_PATHS = new Set([
  "/status",
  "/qubits/simple",
  "/execute",
  "/loop/start",
  "/loop/stop",
  "/qasm/circuit/ascii",
  "/qasm/file",
  "/qasm/listfiles",
  "/auth",
  "/auth/status",
  "/auth/save",
  "/auth/clear",
  "/result/histogram",
]);

const PROXY_TIMEOUT_MS = 15_000;

function isAllowedPath(path: string): boolean {
  // Reject path traversal attempts
  if (path.includes("..") || path.includes("//") || path.includes("\\")) {
    return false;
  }
  // Reject absolute URLs or scheme injection
  if (path.includes("://") || path.startsWith("//")) {
    return false;
  }
  return ALLOWED_PATHS.has(path);
}

export default async (req: Request, context: Context): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace("/.netlify/functions/quantum-proxy", "");

  // Validate path against allowlist to prevent SSRF
  if (!isAllowedPath(path)) {
    return new Response(
      JSON.stringify({ error: "Invalid proxy path" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const clientIp =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (req.method === "POST") {
    const rate = await enforceSimpleRateLimit({
      storeName: RATE_LIMIT_STORE_NAME,
      prefix: "quantum-proxy:",
      subject: clientIp,
      maxRequests: QUANTUM_PROXY_RATE_LIMIT_MAX_REQUESTS,
      windowMs: QUANTUM_PROXY_RATE_LIMIT_WINDOW_MS,
    });
    if (rate.limited) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", retryAfter: rate.retryAfterSeconds }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // Determine if we have a real quantum service
  const quantumServiceURL =
    context.env.QUANTUM_SERVICE_URL ||
    "http://quantum-kc-demo.quantum.svc.cluster.local:5000";
  const isDemo = !context.env.QUANTUM_SERVICE_URL;

  try {
    if (isDemo) {
      // Return demo data for demo mode
      if (path === "/status") {
        return new Response(JSON.stringify(DEMO_STATUS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/qubits/simple") {
        return new Response(JSON.stringify(DEMO_QUBITS_SIMPLE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/execute") {
        return new Response(JSON.stringify(DEMO_EXECUTE_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/loop/start") {
        return new Response(JSON.stringify(DEMO_LOOP_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/loop/stop") {
        return new Response(JSON.stringify({ status: "stopped" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/qasm/circuit/ascii") {
        return new Response(DEMO_CIRCUIT_ASCII_HTML, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      if (path === "/auth/status") {
        return new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (path === "/qasm/listfiles") {
        return new Response(JSON.stringify({ files: ["bell.qasm"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Proxy to actual quantum service with timeout
    const targetURL = new URL(path, quantumServiceURL).toString();
    const proxyReq = new Request(targetURL, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" ? undefined : await req.text(),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    const response = await fetch(proxyReq);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    console.error("Quantum proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Quantum service unavailable" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
