# create-whop-kit

Scaffold and manage [Whop](https://whop.com)-powered apps with [whop-kit](https://www.npmjs.com/package/whop-kit).

## Create a new project

```bash
npx create-whop-kit my-app
```

Interactive prompts guide you through:

1. **What are you building?** — SaaS (full dashboard + billing) or Blank (just auth + webhooks)
2. **Which framework?** — Next.js or Astro
3. **Which database?** — Neon (auto-provisioned), Prisma Postgres (instant), Supabase, manual URL, or skip
4. **Whop credentials** — App ID, API key, webhook secret (optional, can use setup wizard later)

The CLI clones a template, provisions your database, writes `.env.local`, installs dependencies, and initializes git.

### Non-interactive mode

```bash
# Skip all prompts
npx create-whop-kit my-app --framework nextjs --type saas --db neon --yes

# With credentials
npx create-whop-kit my-app --framework nextjs --db later --app-id "app_xxx" --api-key "apik_xxx"

# Preview without creating files
npx create-whop-kit my-app --framework nextjs --db later --dry-run
```

### All flags

| Flag | Description |
|------|-------------|
| `--framework` | `nextjs` or `astro` |
| `--type` | `saas` or `blank` (default: `saas`) |
| `--db` | `neon`, `prisma-postgres`, `supabase`, `manual`, `later` |
| `--db-url` | PostgreSQL connection URL (skips DB provisioning) |
| `--app-id` | Whop App ID |
| `--api-key` | Whop API Key |
| `--webhook-secret` | Whop webhook secret |
| `-y, --yes` | Skip optional prompts |
| `--dry-run` | Show what would be created |
| `--verbose` | Detailed output |

## Manage your project

After creating a project, use `whop-kit` to add features and check status:

```bash
# Check project health
npx whop-kit status

# Add email (Resend or SendGrid)
npx whop-kit add email

# Add analytics (PostHog, Google Analytics, or Plausible)
npx whop-kit add analytics

# Add a webhook event handler
npx whop-kit add webhook-event

# Open provider dashboards
npx whop-kit open whop
npx whop-kit open neon
npx whop-kit open vercel

# Update whop-kit to latest
npx whop-kit upgrade
```

## Database provisioning

The CLI can provision databases automatically — no need to leave the terminal:

| Provider | How it works |
|----------|-------------|
| **Neon** | Installs `neonctl` → authenticates (browser) → creates project → gets connection string |
| **Prisma Postgres** | Runs `npx create-db` → instant database, no account needed |
| **Supabase** | Installs CLI → authenticates → creates project → guides you to get connection string |

## Templates

| App Type | Framework | Template | Status |
|----------|-----------|----------|--------|
| SaaS | Next.js | Full dashboard, pricing, billing, docs | Available |
| SaaS | Astro | Auth, payments, webhooks | Available |
| Blank | Next.js | Just auth + webhooks — build anything | Available |
| Course | — | — | Coming soon |
| Community | — | — | Coming soon |

## How it works

1. **Template** — clones a starter repo from GitHub
2. **Database** — optionally provisions via provider CLI
3. **Environment** — writes `.env.local` from the template's `.env.example`
4. **Manifest** — creates `.whop/config.json` tracking your project state
5. **Dependencies** — installs with your preferred package manager
6. **Git** — initializes a fresh repo

## License

MIT
