import type { WhopAppResult, WhopWebhookResult } from "./types.js";

const WHOP_API = "https://api.whop.com/api/v1";

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Validate a Company API key by making a lightweight API call.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${WHOP_API}/apps`, {
      headers: headers(apiKey),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Create a Whop OAuth app.
 * Returns the app ID and client_secret (which is the WHOP_API_KEY for the app).
 */
export async function createWhopApp(
  apiKey: string,
  name: string,
  redirectUris: string[],
): Promise<WhopAppResult | null> {
  try {
    const res = await fetch(`${WHOP_API}/apps`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        name,
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
 * Returns the webhook ID and signing secret.
 */
export async function createWhopWebhook(
  apiKey: string,
  url: string,
  events: string[],
): Promise<WhopWebhookResult | null> {
  try {
    const res = await fetch(`${WHOP_API}/webhooks`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        url,
        events,
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

/**
 * List existing apps to check for duplicates.
 */
export async function listWhopApps(
  apiKey: string,
): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await fetch(`${WHOP_API}/apps`, {
      headers: headers(apiKey),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((app: { id: string; name: string }) => ({
      id: app.id,
      name: app.name,
    }));
  } catch {
    return [];
  }
}
