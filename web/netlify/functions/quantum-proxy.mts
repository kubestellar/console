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
const MAX_PROXY_BODY_BYTES = 1_048_576;
const MAX_RESPONSE_BYTES = 1_048_576;
const ALLOWED_METHODS = new Set(["GET", "POST"]);
const CIRCUIT_POST_PATHS = new Set(["/execute", "/loop/start"]);
const LOOP_STOP_PATH = "/loop/stop";
const OVERSIZED_RESPONSE_ERROR = "Upstream response too large";

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePostBody(path: string, requestBody: string): string | null {
  const trimmedBody = requestBody.trim();
  let parsedBody: unknown;

  try {
    parsedBody = trimmedBody === "" ? {} : JSON.parse(trimmedBody);
  } catch {
    return "Invalid JSON in request body";
  }

  if (!isPlainObject(parsedBody)) {
    return "Request body must be a JSON object";
  }

  if (CIRCUIT_POST_PATHS.has(path)) {
    if (Object.keys(parsedBody).length !== 1 || typeof parsedBody.circuit !== "string" || parsedBody.circuit.trim() === "") {
      return 'Request body must be an object with a non-empty "circuit" string';
    }
  }

  if (path === LOOP_STOP_PATH && Object.keys(parsedBody).length !== 0) {
    return "Request body for /loop/stop must be empty";
  }

  return null;
}

async function readResponseBodyWithCap(response: Response): Promise<Uint8Array | null> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new Error(OVERSIZED_RESPONSE_ERROR);
    }
  }

  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    totalSize += value.byteLength;
    if (totalSize > MAX_RESPONSE_BYTES) {
      await reader.cancel(OVERSIZED_RESPONSE_ERROR);
      throw new Error(OVERSIZED_RESPONSE_ERROR);
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

export default async (req: Request, context: Context): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname.replace("/.netlify/functions/quantum-proxy", "");

  // Only allow GET and POST methods
  if (!ALLOWED_METHODS.has(req.method)) {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", "Allow": "GET, POST" },
      }
    );
  }

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

  // Auth check for POST mutation endpoints (parity with Go backend requireBearerToken)
  if (req.method === "POST") {
    const authHeader = req.headers.get("authorization") || "";
    const cookie = req.headers.get("cookie") || "";
    const hasBearer = authHeader.startsWith("Bearer ") && authHeader.length > 7;
    const hasCookie = cookie.includes("kc_auth=");
    
    if (!hasBearer && !hasCookie) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
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
  const quantumServiceURL = context.env.QUANTUM_SERVICE_URL;
  const isDemo = !quantumServiceURL;

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

    // Proxy to actual quantum service — requires QUANTUM_SERVICE_URL
    if (!quantumServiceURL) {
      return new Response(
        JSON.stringify({ error: "Quantum service not configured" }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const targetURL = new URL(path, quantumServiceURL).toString();
    if (req.method !== "GET") {
      const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
      if (contentLength > MAX_PROXY_BODY_BYTES) {
        return new Response(JSON.stringify({ error: "Request body too large" }), {
          status: 413,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    const requestBody = req.method === "GET" ? undefined : await req.text();
    if (req.method === "POST" && requestBody !== undefined) {
      const validationError = validatePostBody(path, requestBody);
      if (validationError) {
        return new Response(JSON.stringify({ error: validationError }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const response = await fetch(targetURL, {
      method: req.method,
      headers: {
        "Content-Type": req.headers.get("Content-Type") ?? "application/json",
        Accept: req.headers.get("Accept") ?? "application/json",
      },
      body: requestBody,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    const responseBody = await readResponseBodyWithCap(response);
    return new Response(responseBody, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    if (error instanceof Error && error.message === OVERSIZED_RESPONSE_ERROR) {
      return new Response(JSON.stringify({ error: OVERSIZED_RESPONSE_ERROR }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

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
