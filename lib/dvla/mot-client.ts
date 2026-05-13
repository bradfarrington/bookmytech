import "server-only";

// DVSA MOT History API — the missing half of vehicle data. DVLA VES gives us
// tax/MOT status but no model; this endpoint gives us model (and MOT history,
// not used yet). Auth is OAuth2 client-credentials against an Azure AD tenant,
// then bearer-token + x-api-key on every request.

interface MotVehicleResponse {
  make?: string;
  model?: string;
  primaryColour?: string;
  fuelType?: string;
  engineSize?: string;
  manufactureDate?: string;
  registrationDate?: string;
}

export interface MotLookupSuccess {
  ok: true;
  model?: string;
}
export interface MotLookupFailure {
  ok: false;
}
export type MotLookupResult = MotLookupSuccess | MotLookupFailure;

interface TokenCache {
  token: string;
  expiresAt: number;
}

// Module-level cache — tokens last ~1h, so we reuse across invocations within
// the same Node process (warm Vercel instance, local dev). Cold starts re-fetch.
let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.MOT_CLIENT_ID;
  const clientSecret = process.env.MOT_CLIENT_SECRET;
  const tokenUrl = process.env.MOT_TOKEN_URL;
  const scope = process.env.MOT_SCOPE;
  if (!clientId || !clientSecret || !tokenUrl || !scope) return null;

  const now = Date.now();
  // Refresh ~60s before expiry to avoid edge-of-expiry 401s.
  if (tokenCache && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    tokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

export async function lookupMotVehicle(reg: string): Promise<MotLookupResult> {
  const apiKey = process.env.MOT_API_KEY;
  if (!apiKey) return { ok: false };

  const token = await getAccessToken();
  if (!token) return { ok: false };

  const registration = reg.trim().toUpperCase().replace(/\s+/g, "");

  try {
    const response = await fetch(
      `https://history.mot.api.gov.uk/v1/trade/vehicles/registration/${encodeURIComponent(registration)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-key": apiKey,
          Accept: "application/json+v6",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) return { ok: false };
    const data = (await response.json()) as MotVehicleResponse;
    return { ok: true, model: data.model };
  } catch {
    return { ok: false };
  }
}
