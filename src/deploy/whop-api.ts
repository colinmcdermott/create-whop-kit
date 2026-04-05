import type { WhopAppResult, WhopWebhookResult } from "./types.js";

const WHOP_API = "https://api.whop.com/api/v1";

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Get the company ID associated with the API key.
 * Company API keys are scoped to a company — we need the ID for app creation.
 */
export async function getCompanyId(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${WHOP_API}/companies`, {
      headers: headers(apiKey),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const companies = data.data || data;
    if (Array.isArray(companies) && companies.length > 0) {
      return companies[0].id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate a Company API key by fetching the company.
 * Returns the company ID if valid, null otherwise.
 */
export async function validateApiKey(apiKey: string): Promise<string | null> {
  return getCompanyId(apiKey);
}

/**
 * Create a Whop OAuth app.
 * Returns the app ID and client_secret.
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

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[Whop API] Create app failed (${res.status}): ${err}`);
      return null;
    }

    const data = await res.json();
    return {
      id: data.id,
      client_secret: data.client_secret,
    };
  } catch (err) {
    console.error("[Whop API] Create app error:", err);
    return null;
  }
}

/**
 * Create a webhook endpoint on the user's company.
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
      body: JSON.stringify({
        url,
        events,
        company_id: companyId,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error(`[Whop API] Create webhook failed (${res.status}): ${err}`);
      return null;
    }

    const data = await res.json();
    return {
      id: data.id,
      secret: data.secret || data.signing_secret || data.webhook_secret || "",
    };
  } catch (err) {
    console.error("[Whop API] Create webhook error:", err);
    return null;
  }
}
