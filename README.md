# create-whop-kit

[![npm](https://img.shields.io/npm/v/create-whop-kit.svg)](https://www.npmjs.com/package/create-whop-kit)

Scaffold, deploy, and manage [Whop](https://whop.com)-powered apps with [whop-kit](https://www.npmjs.com/package/whop-kit).

Published on npm: **[create-whop-kit](https://www.npmjs.com/package/create-whop-kit)**

## Create a new project

```bash
npx create-whop-kit my-app
```

The CLI walks you through:

1. **What are you building?** — SaaS or Blank (just auth + webhooks)
2. **Which framework?** — Next.js or Astro
3. **Which database?** — Neon, Supabase, Prisma Postgres (all auto-provisioned)
4. **Deploy?** — Push to GitHub + deploy to Vercel, or develop locally first
5. **Connect Whop** — creates app with OAuth + webhooks automatically
6. **Pricing plans** — creates products + plans on Whop via API

## What happens when you deploy

```
── GitHub ──────────────────────────────
  ◇ Private repo created
  ◇ Code pushed to GitHub

── Vercel ──────────────────────────────
  ◇ Connected to GitHub (auto-deploy on push)
  ◇ Environment variables configured
  ◇ Deployed to https://my-app.vercel.app

── Whop ────────────────────────────────
  ◇ App created with OAuth + webhooks
  ◇ Set OAuth to Public mode
  ◇ Credentials pushed to Vercel

── Pricing Plans ───────────────────────
  ◇ Free + Starter ($29/mo) + Pro ($79/mo)
  ◇ Products + plans created on Whop
  ◇ Plan IDs pushed to Vercel
  ◇ Redeployed with full configuration
```

## Manage your project

After creating a project, use the `whop-kit` command. It's bundled inside
the `create-whop-kit` package, so install once and run anywhere:

```bash
npm install -g create-whop-kit   # one-time install — gives you `whop-kit` everywhere
```

Then:

```bash
whop-kit dev               # local dev server + public webhook tunnel
whop-kit doctor            # diagnose env, auth, and project state
whop-kit add plans         # create pricing plans on Whop
whop-kit add email         # add Resend or SendGrid
whop-kit add analytics     # add PostHog, GA, or Plausible
whop-kit add webhook-event # scaffold a new event handler
whop-kit status            # project health check
whop-kit deploy            # deploy (or redeploy) to Vercel + Whop
whop-kit env               # view env vars (masked)
whop-kit env --reveal      # show actual values
whop-kit catalog           # list all available services
whop-kit open whop         # open Whop dashboard
whop-kit open neon         # open Neon console
whop-kit open vercel       # open Vercel dashboard
whop-kit upgrade           # update whop-kit to latest
```

**Don't want a global install?** Use `npx` with the `-p` flag — npm needs the
package name (`create-whop-kit`) explicitly because the binary name
(`whop-kit`) differs:

```bash
npx -p create-whop-kit whop-kit doctor
npx -p create-whop-kit whop-kit dev
# …etc.
```

### `whop-kit dev`

Boots your local dev server *and* opens a public HTTPS tunnel to it, so
Whop webhooks can hit your laptop during development without deploying.

```
◇ Tunnel ready (cloudflared)
│
●  Tunnel
│  Public URL     https://random-words.trycloudflare.com
│  Webhook URL    https://random-words.trycloudflare.com/api/webhooks/whop
│
●  Starting npm run dev on port 3000...
```

Uses `ngrok` if installed, otherwise falls back to `cloudflared` via `npx`
(downloads on first run, no account needed). Paste the webhook URL into
your Whop dashboard once and you're set — events stream to localhost
until you `Ctrl+C`.

### `whop-kit doctor`

Runs preflight checks and surfaces fixable issues:

```
  Environment
  ✓ Node.js              v20.11.0
  ✓ git                  2.43.0
  ✓ npm global prefix    /home/you/.npm-global
  ✓ GitHub CLI           signed in as you
  ⚠ Vercel CLI           not signed in
    → Sign in during deploy, or run: vercel login
  ✓ Whop API reachable   HTTP 401

  Project
  ✓ Project manifest     nextjs / saas / neon
  ✓ .env.local           all required vars set
```

Catches the most common onboarding traps — wrong Node version, restrictive
npm global prefix (the WSL / EACCES class), missing CLI auth, network
issues, manifest drift, missing `.env.local` keys.

## Available configurations

### `whop-kit add plans`

Create subscription plans on Whop without leaving the terminal:

```
◆ How many paid tiers?  →  2 (Starter + Pro)
◆ Include a free tier?  →  Yes
◆ Billing intervals?    →  Monthly + Yearly
◆ Starter monthly ($)   →  29
◆ Starter yearly ($)    →  290
◆ Pro monthly ($)       →  79
◆ Pro yearly ($)        →  790

◇ Creating Free tier... plan_xxx
◇ Creating Starter... plan_aaa + plan_bbb
◇ Creating Pro... plan_ccc + plan_ddd
```

Creates Whop products + pricing plans via API, writes plan IDs to `.env.local`.

### `whop-kit add email`

```
◆ Email provider?  →  Resend / SendGrid
◆ API key?         →  re_xxxxxxxxx
◆ From address?    →  noreply@myapp.com
```

### `whop-kit add analytics`

```
◆ Analytics provider?  →  PostHog / Google Analytics / Plausible
◆ ID?                  →  phc_xxxxxxxxx
```

### Database providers

All auto-provisioned via their CLIs:

| Provider | What happens |
|----------|-------------|
| **Neon** | Installs `neonctl` → authenticates → creates project → gets connection string |
| **Supabase** | Installs CLI → authenticates → creates project → guides connection string |
| **Prisma Postgres** | Runs `npx create-db` → instant database, no account needed |

### Deployment

| Service | What happens |
|---------|-------------|
| **GitHub** | Installs `gh` CLI → authenticates → creates private repo → pushes code |
| **Vercel** | Installs CLI → authenticates → links project → connects GitHub → deploys |
| **Whop** | Creates app via API → sets OAuth to Public → creates webhook → pushes credentials |

## Quick start examples

```bash
# Recommended — SaaS with Neon, walks you through deploy + Whop + plans
npx create-whop-kit my-app --framework nextjs --db neon

# Same but with Supabase
npx create-whop-kit my-app --framework nextjs --db supabase

# Blank starter — just auth + webhooks, you build the rest
npx create-whop-kit my-app --type blank --framework nextjs --db neon

# Astro instead of Next.js
npx create-whop-kit my-app --framework astro --db neon

# Local dev only — no deploy, configure later
npx create-whop-kit my-app --framework nextjs --db neon --skip-deploy

# Fully non-interactive — scaffold only, no deploy
npx create-whop-kit my-app --framework nextjs --db later --skip-deploy --yes

# Preview what would be created
npx create-whop-kit my-app --framework nextjs --db neon --dry-run
```

**Tip:** Pass `--framework` and `--db` to skip the setup questions and go straight to deployment and Whop configuration — the important parts.

### All flags

| Flag | Description |
|------|-------------|
| `--framework` | `nextjs` or `astro` |
| `--type` | `saas` or `blank` (default: `saas`) |
| `--db` | `neon`, `prisma-postgres`, `supabase`, `manual`, `later` |
| `--db-url` | PostgreSQL connection URL (skips provisioning) |
| `--skip-deploy` | Skip GitHub/Vercel deployment |
| `--whop-company-key` | Whop Company API key (skips prompt) |
| `-y, --yes` | Skip setup questions, use defaults |
| `--dry-run` | Show what would be created |

## Templates

| App Type | Framework | Description |
|----------|-----------|-------------|
| SaaS | Next.js | Full dashboard, pricing, billing, docs |
| SaaS | Astro | Auth, payments, webhooks |
| Blank | Next.js | Just auth + webhooks — build anything |

## AI / Agent support

The CLI installs provider-specific skills for AI coding assistants:

- **Neon** — `neon-postgres`, `neon-serverless` skills
- **Supabase** — `supabase-postgres-best-practices` skill
- **Whop** — `whop-saas-starter`, `whop-dev` skills
- **Project context** — `.whop/project-context.md` with your project's configuration

AI assistants (Claude Code, Cursor, etc.) can use these to understand your project and help you build.

## License

MIT
