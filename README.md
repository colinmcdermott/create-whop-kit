# create-whop-kit

Scaffold a new [Whop](https://whop.com)-powered app with [whop-kit](https://www.npmjs.com/package/whop-kit).

## Usage

```bash
npx create-whop-kit my-app
```

You'll be prompted to choose:

1. **What you're building** — SaaS, Course, Community, or Blank
2. **Framework** — Next.js (more coming soon)
3. **Database** — Neon, Supabase, Local PostgreSQL, or configure later

The CLI clones the template, installs dependencies, configures your `.env.local`, and initializes a git repo.

## Options

```bash
# Provide the project name as an argument
npx create-whop-kit my-app

# Or run interactively
npx create-whop-kit
```

## Templates

| Template | Framework | Status |
|----------|-----------|--------|
| SaaS | Next.js | Available |
| SaaS | Astro | Coming soon |
| SaaS | TanStack Start | Coming soon |
| Course | — | Coming soon |
| Community | — | Coming soon |
| Blank | — | Coming soon |

## License

MIT
