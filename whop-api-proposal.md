# Proposal: CLI-Friendly Improvements to the Whop API

We built [`create-whop-kit`](https://www.npmjs.com/package/create-whop-kit), a scaffolding CLI for **standalone external apps** (SaaS products, marketing sites, dashboards) that use Whop as their authentication and payments provider. It's complementary to `create @whop/react-native` — rather than scaffolding embedded Whop apps, it targets creators shipping their own separately-hosted product (Next.js, Astro, TanStack) with Whop powering sign-in and subscriptions.

The CLI handles project scaffolding, GitHub + Vercel deploy, creating the Whop app record, configuring OAuth, registering webhooks, and setting up pricing plans. During implementation we hit four friction points that force users out of the terminal and into the Whop dashboard. Below are four API changes that would meaningfully improve DX for any third-party CLI or agent building on Whop.

---

## 1. CLI login endpoint (highest impact)

**Ask:** A Stripe-style device-pairing flow that any third-party CLI can use to authenticate a user with Whop and receive a scoped, time-limited API key.

**How Stripe does it** ([writeup](https://bentranter.ca/posts/stripes-cli-login/)):
- `POST https://dashboard.stripe.com/stripecli/auth?device_name=X` → returns `{ browser_url, poll_url, verification_code }`
- CLI shows the verification code, user confirms it matches in the browser
- CLI polls `poll_url` until the user confirms
- Returns restricted keys valid for 90 days

**Why this matters:**
- Today, our CLI has to direct users to the dashboard, walk them through creating a Company API key with the right role, and paste it back into the terminal. It's the single biggest source of setup friction.
- OAuth + local HTTP callback (how `gh` and `vercel` CLIs work) is workable but requires every third-party CLI to register its own OAuth app — and doesn't work in SSH / Codespaces / devcontainer sessions.
- Device pairing works everywhere since the user can open the URL on any device.

**Key requirement for third-party tools:** the endpoint should be usable by any `device_name`, not gated to a single first-party CLI. Stripe's endpoint accepts any device name so both `stripe projects` (a plugin) and external tools can use it. Ideally this would also benefit the official `create @whop/react-native` flow.

---

## 2. Return `api_key.token` on `POST /apps`

**Ask:** When creating an app via `POST /api/v1/apps` with a key that has `developer:manage_api_key` permission, populate `api_key.token` in the response instead of returning `null`.

**Current behavior:** `POST /apps` returns `api_key: null`. Our CLI then has to tell the user: *"Go to the dashboard, copy `WHOP_API_KEY` and `NEXT_PUBLIC_WHOP_APP_ID` from the environment variables section, paste them here"* — a full extra browser round-trip for values the API already knows.

**Same issue with `client_secret`:** referenced in the OAuth docs but never returned from `POST /apps`.

---

## 3. Set `oauth_client_type` at creation time

**Ask:** Accept `oauth_client_type: "public" | "confidential"` as a field on `POST /apps`.

**Current behavior:** apps default to `confidential`. We have to `PATCH /apps/{id}` immediately after creation to set it to `public`. It works, but it's two API calls for what should be one.

---

## 4. Make the company ID discoverable

**Ask:** Either (a) include `company:basic:read` in the default "Owner" role, or (b) have `GET /companies` work with any valid Company API key (since the key is inherently scoped to one company), or (c) add a lightweight `GET /me` that returns the owning company of the current key.

**Current behavior:** `GET /companies` returns `403 — "Actor is missing all required permissions: company:basic:read"` even with an Owner-role key. Our CLI falls back to asking the user to paste their `biz_xxxxx` from the dashboard URL.

**Why this is odd:** a Company API key is already scoped to a specific company. The server knows which company it belongs to — asking for an explicit permission to read that back is a tautology.

---

## Longer-term inspiration: Stripe Projects

Once #1 is in place, there's an obvious follow-on pattern worth flagging: [Stripe Projects](https://stripe.com/projects) layers a provider-account-linking system on top of `stripe login`. Running `stripe projects link vercel` associates a creator's Vercel account with their Stripe identity. Once linked, it stays authorized across multiple projects and Stripe becomes the trusted identity broker — creators (and the agents working on their behalf) can provision infrastructure without juggling credentials across providers.

For Whop creators building SaaS products, the equivalent would be enormously useful. Our CLI currently orchestrates `gh` + `vercel` + `neonctl` + `supabase` CLIs, each with its own auth dance. A `whop link <provider>` model — especially one that agents can drive — would let creators authorize once with Whop and have their Vercel / Neon / Supabase / PostHog connections just work across every project they scaffold. Whop already sits at the intersection of identity and payments for its creators, which is exactly the trust position Stripe is leveraging here.

---

## TL;DR

The four asks above would let any third-party CLI take a Whop-powered app from zero to fully provisioned (app record created, OAuth configured, webhooks registered, env vars known) **without the user ever leaving the terminal**. Today it's three browser round-trips; with these changes it's zero. The Stripe Projects model points at where this could go longer-term.

Happy to help test or provide feedback as these are designed.
