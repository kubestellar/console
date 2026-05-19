import type { Config } from "@netlify/functions";
import {
  badRequestResponse,
  buildCorsHeaders,
  enforceSimpleRateLimit,
  errorResponse,
  handlePreflight,
  rateLimitResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "./_shared";
import {
  MUTATION_AUTH_COOKIE_NAME,
  MUTATION_RATE_LIMIT_MAX_REQUESTS,
  MUTATION_RATE_LIMIT_STORE_NAME,
  MUTATION_RATE_LIMIT_WINDOW_MS,
} from "./github-pipelines/constants";
import { mutate } from "./github-pipelines/mutations";

const MUTATION_AUTH_TOKEN_ENV = "GITHUB_PIPELINES_MUTATE_AUTH_TOKEN";
const MUTATION_AUTH_COOKIE_ENV = "GITHUB_PIPELINES_MUTATE_AUTH_COOKIE_NAME";
const AUTH_SCHEME = "Bearer";
const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";

function getClientIp(req: Request): string {
  return req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce<Record<string, string>>((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) return cookies;
    cookies[rawName] = rawValue.join("=");
    return cookies;
  }, {});
}

function getExpectedAuthToken(): string {
  return process.env[MUTATION_AUTH_TOKEN_ENV] ?? "";
}

function getAuthCookieName(): string {
  return process.env[MUTATION_AUTH_COOKIE_ENV] ?? MUTATION_AUTH_COOKIE_NAME;
}

function hasAuthorizedCredential(req: Request, expectedToken: string): boolean {
  const authHeader = req.headers.get("authorization")?.trim();
  if (authHeader?.startsWith(`${AUTH_SCHEME} `)) {
    const bearerToken = authHeader.slice(AUTH_SCHEME.length + 1).trim();
    if (bearerToken === expectedToken) return true;
  }

  const cookies = parseCookies(req.headers.get("cookie"));
  return cookies[getAuthCookieName()] === expectedToken;
}

export default async (req: Request): Promise<Response> => {
  const corsHeaders = buildCorsHeaders(req, {
    methods: ALLOWED_METHODS,
    headers: ALLOWED_HEADERS,
  });

  if (req.method === "OPTIONS") {
    return handlePreflight(req, {
      methods: ALLOWED_METHODS,
      headers: ALLOWED_HEADERS,
    });
  }

  if (req.method !== "POST") {
    return errorResponse("Mutations require POST", {
      status: 405,
      headers: {
        ...corsHeaders,
        Allow: "POST, OPTIONS",
      },
    });
  }

  const expectedAuthToken = getExpectedAuthToken();
  if (!expectedAuthToken) {
    return errorResponse("Workflow mutations disabled on this deployment", {
      status: 503,
      headers: corsHeaders,
    });
  }

  if (!hasAuthorizedCredential(req, expectedAuthToken)) {
    return unauthorizedResponse("Mutation auth required", {
      ...corsHeaders,
      "WWW-Authenticate": `${AUTH_SCHEME} realm=\"github-pipelines-mutate\"`,
    });
  }

  const rate = await enforceSimpleRateLimit({
    storeName: MUTATION_RATE_LIMIT_STORE_NAME,
    prefix: "gh-pipelines-mutate:",
    subject: getClientIp(req),
    maxRequests: MUTATION_RATE_LIMIT_MAX_REQUESTS,
    windowMs: MUTATION_RATE_LIMIT_WINDOW_MS,
  });
  if (rate.limited) {
    return rateLimitResponse(rate.retryAfterSeconds, corsHeaders);
  }

  try {
    const url = new URL(req.url);
    const op = url.searchParams.get("op") ?? "";
    const repo = url.searchParams.get("repo") ?? "";
    const run = url.searchParams.get("run") ?? "";

    if (!/^\d+$/.test(run)) {
      return badRequestResponse("Invalid run ID", corsHeaders);
    }

    const response = await mutate(op, repo, run);
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (error) {
    console.error("[github-pipelines-mutate] request failed", error);
    return serverErrorResponse("Internal server error", corsHeaders);
  }
};

export const config: Config = {
  path: "/api/github-pipelines/mutate",
};
