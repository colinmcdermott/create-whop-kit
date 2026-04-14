import * as p from "@clack/prompts";
import pc from "picocolors";
import type { WhopAppResult, WhopWebhookResult } from "./types.js";

const WHOP_API = "https://api.whop.com/api/v1";

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Validate a Company API key by listing apps.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${WHOP_API}/apps?per_page=1`, {
      headers: headers(apiKey),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get the company ID for this API key.
 * Tries /companies first, falls back to asking the user.
 */
export async function getCompanyId(apiKey: string): Promise<string | null> {
  // Try the API first
  try {
    const res = await fetch(`${WHOP_API}/companies`, {
      headers: headers(apiKey),
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
): Promise<WhopAppResult | null> {
  try {
    const res = await fetch(`${WHOP_API}/apps`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        name,
        company_id: companyId,
        redirect_uris: redirectUris,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as WhopAppResult;
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
 */
export async function setOAuthPublicMode(
  apiKey: string,
  appId: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${WHOP_API}/apps/${appId}`, {
      method: "PATCH",
      headers: headers(apiKey),
      body: JSON.stringify({ oauth_client_type: "public" }),
    });
    return res.ok;
  } catch {
    return false;
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
): Promise<WhopWebhookResult | null> {
  try {
    const res = await fetch(`${WHOP_API}/webhooks`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({ url, events, resource_id: companyId }),
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
