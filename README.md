# create-whop-kit

Scaffold, deploy, and manage [Whop](https://whop.com)-powered apps with [whop-kit](https://www.npmjs.com/package/whop-kit).

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

After creating a project, use `whop-kit` to add features:

```bash
npx whop-kit add plans         # create pricing plans on Whop
npx whop-kit add email         # add Resend or SendGrid
npx whop-kit add analytics     # add PostHog, GA, or Plausible
npx whop-kit add webhook-event # scaffold a new event handler
npx whop-kit status            # project health check
npx whop-kit deploy            # deploy (or redeploy) to Vercel + Whop
npx whop-kit env               # view env vars (masked)
npx whop-kit env --reveal      # show actual values
npx whop-kit catalog           # list all available services
npx whop-kit open whop         # open Whop dashboard
npx whop-kit open neon         # open Neon console
npx whop-kit open vercel       # open Vercel dashboard
npx whop-kit upgrade           # update whop-kit to latest
```

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

## Non-interactive mode

```bash
# Full auto — skip all prompts
npx create-whop-kit my-app --framework nextjs --db neon --yes

# Preview what would be created
npx create-whop-kit my-app --framework nextjs --db later --dry-run

# Skip deployment
npx create-whop-kit my-app --framework nextjs --db neon --skip-deploy --yes
```

### All flags

| Flag | Description |
|------|-------------|
| `--framework` | `nextjs` or `astro` |
| `--type` | `saas` or `blank` (default: `saas`) |
| `--db` | `neon`, `prisma-postgres`, `supabase`, `manual`, `later` |
| `--db-url` | PostgreSQL connection URL (skips provisioning) |
| `--skip-deploy` | Skip GitHub/Vercel deployment |
| `--whop-company-key` | Whop Company API key (skips prompt) |
| `-y, --yes` | Skip optional prompts |
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
