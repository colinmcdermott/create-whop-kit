import * as p from "@clack/prompts";
import pc from "picocolors";
import type { WhopAppResult, WhopWebhookResult } from "./types.js";
import { whopHosts, type WhopEnvironment } from "../whop-env.js";

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// Every call carries a timeout so a stalled connection can't hang the
// deploy wizard indefinitely (Node 20+).
const FETCH_TIMEOUT_MS = 15_000;
function fetchOpts(): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
}

/**
 * Validate a Company API key by listing apps.
 */
export async function validateApiKey(
  apiKey: string,
  environment: WhopEnvironment = "production",
): Promise<boolean> {
  try {
    const res = await fetch(`${whopHosts(environment).api}/apps?per_page=1`, {
      headers: headers(apiKey),
      ...fetchOpts(),
    });
    return res.ok;
  } catch (err) {
    // Network failure is not the same as an invalid key — say so
    console.error(
      `[Whop API] Could not reach Whop to validate the key: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
}

/**
 * Get the company ID for this API key.
 * Tries /companies first, falls back to asking the user.
 */
export async function getCompanyId(
  apiKey: string,
  environment: WhopEnvironment = "production",
): Promise<string | null> {
  // Try the API first
  try {
    const res = await fetch(`${whopHosts(environment).api}/companies`, {
      headers: headers(apiKey),
      ...fetchOpts(),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: { id: string }[] };
      const companies = data.data || [];
      if (companies.length > 0) {
        return companies[0].id;
      }
    }
  } catch { /* permission might be missing */ }

  // Fallback: ask the user
  p.log.info(pc.dim("Could not detect your company ID automatically."));
  const result = await p.text({
    message: "Your Whop Company ID",
    placeholder: "biz_xxxxxxxxx (find it in your dashboard URL)",
    validate: (v) => {
      if (!v) return "Required";
      if (!v.startsWith("biz_")) return 'Must start with "biz_"';
    },
  });
  if (p.isCancel(result)) return null;
  return result;
}

/**
 * Create a Whop OAuth app.
 */
export async function createWhopApp(
  apiKey: string,
  name: string,
  redirectUris: string[],
  companyId: string,
  environment: WhopEnvironment = "production",
): Promise<WhopAppResult | null> {
  try {
    const res = await fetch(`${whopHosts(environment).api}/apps`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        name,
        company_id: companyId,
        redirect_uris: redirectUris,
      }),
      ...fetchOpts(),
    });

    if (res.ok) {
      const data = (await res.json()) as WhopAppResult;
      if (typeof data.id !== "string" || !data.id) {
        console.error("[Whop API] Create app returned no app ID");
        return null;
      }
      return { id: data.id, client_secret: data.client_secret };
    }

    const err = await res.text().catch(() => "");
    console.error(`[Whop API] Create app failed (${res.status}): ${err}`);
    return null;
  } catch (err) {
    console.error("[Whop API] Create app error:", err);
    return null;
  }
}

/**
 * Set an app's OAuth client type to "public" (no client_secret needed for token exchange).
 * Returns `{ ok: true }` on success, otherwise an error string suitable for surfacing
 * to the user — previously this returned a bare boolean and silently swallowed
 * the API response, hiding real failures.
 */
export async function setOAuthPublicMode(
  apiKey: string,
  appId: string,
  environment: WhopEnvironment = "production",
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${whopHosts(environment).api}/apps/${appId}`, {
      method: "PATCH",
      headers: headers(apiKey),
      body: JSON.stringify({ oauth_client_type: "public" }),
      ...fetchOpts(),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Create a webhook endpoint.
 */
export async function createWhopWebhook(
  apiKey: string,
  url: string,
  events: string[],
  companyId: string,
  environment: WhopEnvironment = "production",
): Promise<WhopWebhookResult | null> {
  try {
    const res = await fetch(`${whopHosts(environment).api}/webhooks`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({ url, events, resource_id: companyId }),
      ...fetchOpts(),
    });

    if (res.ok) {
      const data = (await res.json()) as { id: string; webhook_secret?: string; secret?: string; signing_secret?: string };
      return {
        id: data.id,
        secret: data.webhook_secret || data.secret || data.signing_secret || "",
      };
    }

    const err = await res.text().catch(() => "");
    console.error(`[Whop API] Create webhook failed (${res.status}): ${err}`);
    return null;
  } catch (err) {
    console.error("[Whop API] Create webhook error:", err);
    return null;
  }
}
