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

## What happens when you deploy

```
── GitHub ──────────────────────────────
  ◇ Private repo created
  ◇ Code pushed

── Vercel ──────────────────────────────
  ◇ Connected to GitHub (auto-deploy on push)
  ◇ Environment variables configured
  ◇ Deployed to https://my-app.vercel.app

── Whop ────────────────────────────────
  ◇ OAuth app created automatically
  ◇ Webhook endpoint configured
  ◇ All credentials pushed to Vercel
  ◇ Redeployed with full configuration
```

One command, one API key paste — fully deployed app. Every future `git push` auto-deploys.

## Manage your project

```bash
npx whop-kit status           # project health check
npx whop-kit add email        # add Resend or SendGrid
npx whop-kit add analytics    # add PostHog, GA, or Plausible
npx whop-kit add webhook-event # scaffold a new event handler
npx whop-kit deploy           # deploy (or redeploy) to Vercel + Whop
npx whop-kit env              # view env vars (masked)
npx whop-kit env --reveal     # show actual values
npx whop-kit catalog          # list all available services
npx whop-kit open whop        # open Whop dashboard
npx whop-kit upgrade          # update whop-kit to latest
```

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
| `--whop-company-key` | Whop Company API key (skips interactive prompt) |
| `-y, --yes` | Skip optional prompts |
| `--dry-run` | Show what would be created |

## Database provisioning

All three database providers are auto-provisioned — no need to leave the terminal:

| Provider | How it works |
|----------|-------------|
| **Neon** | Installs `neonctl` → authenticates → creates project → gets connection string |
| **Supabase** | Installs CLI → authenticates → creates project → guides connection string |
| **Prisma Postgres** | Runs `npx create-db` → instant database, no account needed |

## Templates

| App Type | Framework | Description |
|----------|-----------|-------------|
| SaaS | Next.js | Full dashboard, pricing, billing, docs |
| SaaS | Astro | Auth, payments, webhooks |
| Blank | Next.js | Just auth + webhooks — build anything |

## How it works

1. **Scaffold** — clone a starter template
2. **Database** — auto-provision via provider CLI
3. **GitHub** — create private repo, push code
4. **Vercel** — connect GitHub, set env vars, deploy
5. **Whop** — create OAuth app + webhook via API
6. **Agent skills** — install provider skills for AI coding assistants

## License

MIT
