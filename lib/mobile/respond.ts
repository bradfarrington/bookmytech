import "server-only";

// Shared response shape for every `app/api/mobile/v1/**` route handler.
//
// The app (`src/lib/api.ts` in bmt-customer-app) treats any non-2xx as an error
// and shows `error` to the customer VERBATIM. So these strings are product copy,
// not developer diagnostics — no status codes, no field names, no stack hints.
//
// Deliberately no CORS headers anywhere. A native app doesn't need them, and
// adding `Access-Control-Allow-Origin: *` would make account-creating and
// billed endpoints callable from any web page.

/** `{ "error": "…" }` with a real status code. */
export function apiError(error: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ error }, { status, headers });
}

/** A 429 that also tells a well-behaved client when to come back. */
export function apiRateLimited(error: string, retryAfterSeconds: number): Response {
  return apiError(error, 429, { "Retry-After": String(Math.max(1, retryAfterSeconds)) });
}

/** Success. JSON only — the app cannot follow a redirect. */
export function apiOk<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

export type JsonBodyResult<T> = { ok: true; body: T } | { ok: false; response: Response };

/**
 * Parse a JSON request body.
 *
 * The `application/json` requirement is a security control, not pedantry: it is
 * not a CORS-simple content type, so a cross-origin browser request carrying it
 * is preflighted — and we answer no preflights. Without the check, a page on any
 * origin could POST a JSON body as `text/plain` (a simple request, no preflight)
 * and create accounts or spend our DVLA credits from a victim's browser.
 */
export async function readJsonBody<T = unknown>(request: Request): Promise<JsonBodyResult<T>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: apiError("Something went wrong — please update the app and try again.", 415),
    };
  }

  try {
    const body = (await request.json()) as T;
    if (!body || typeof body !== "object") {
      return { ok: false, response: apiError("Something went wrong — please try again.", 400) };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, response: apiError("Something went wrong — please try again.", 400) };
  }
}

/**
 * Best-effort client IP for rate limiting.
 *
 * Vercel sets `x-forwarded-for` with the real client first. The header is
 * spoofable in principle, but on Vercel it's rewritten at the edge, so the first
 * entry is trustworthy in production. Falls back to a constant so a missing
 * header degrades to one shared bucket (throttled) rather than to no limit.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
