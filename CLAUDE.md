# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`create-whop-kit` is a CLI tool that scaffolds, deploys, and manages Whop-powered apps. It ships two commands:
- **`create-whop-kit`** — interactive project scaffolding wizard (entry: `src/cli-create.ts`)
- **`whop-kit`** — post-scaffold project management with subcommands (entry: `src/cli-kit.ts`)

Both use **citty** for CLI routing and **@clack/prompts** for interactive terminal UI.

## Build & Dev

```bash
npm run build      # tsup → dist/cli-create.js + dist/cli-kit.js
npm run dev        # tsup --watch
```

No test suite exists. To test locally, run `node dist/cli-create.js` or `node dist/cli-kit.js`.

The build produces ESM-only output targeting Node 18+. tsup adds the shebang automatically via `banner`.

## Architecture

### CLI Entry Points
- `src/cli-create.ts` → `runMain(init)` — single command, the scaffolding wizard
- `src/cli-kit.ts` → `runMain(main)` with subCommands: `add`, `status`, `env`, `catalog`, `deploy`, `open`, `upgrade`

### Source Organization (`src/`)
- **`commands/`** — CLI command definitions using `defineCommand()`. `init.ts` (439 LOC) is the main wizard; the rest are `whop-kit` subcommands.
- **`deploy/`** — Multi-phase deployment pipeline orchestrating GitHub (via `gh` CLI), Vercel (via `vercel` CLI), and Whop (via REST API). `index.ts` contains `runDeployPipeline()` which runs 7 phases: setup mode → GitHub → Vercel → Whop app creation → webhook → pricing plans → env push + redeploy.
- **`providers/`** — Database provisioning abstraction. Each provider (neon, supabase, prisma-postgres) implements `DbProvider` interface with `isInstalled()`, `install()`, and `provision()` methods.
- **`scaffolding/`** — Template cloning (`clone.ts`), manifest CRUD at `.whop/config.json` (`manifest.ts`), `.env.local` management (`env-file.ts`), AI skill installation (`skills.ts`).
- **`features/`** — Post-scaffold add-ons: plans, email, analytics, webhook-event. Each is invoked via `whop-kit add <feature>`.
- **`utils/`** — `exec.ts` (three exec variants: silent, interactive, stdin-piped), `checks.ts` (pre-flight validation), `cleanup.ts`.
- **`templates.ts`** — Registry of templates keyed by `"{appType}:{framework}"`, plus `FRAMEWORKS`, `APP_TYPES`, and `DB_OPTIONS` constants.

### Template System
Templates are external GitHub repos cloned at scaffold time (not embedded). The key is `"{appType}:{framework}"` — e.g., `"saas:nextjs"` maps to `whopio/whop-saas-starter`.

### Framework-Aware Logic
The `framework` value (`"nextjs"`, `"astro"`, `"tanstack"`) affects:
- **Env var naming**: Next.js uses `NEXT_PUBLIC_` prefix for client-side vars; Astro and TanStack use `WHOP_APP_ID` / `APP_URL` without prefix
- **OAuth callback path**: TanStack uses `/auth/callback`; Next.js and Astro use `/api/auth/callback`

### Manifest
Every scaffolded project gets `.whop/config.json` tracking framework, appType, database, features, and templateVersion. The `whop-kit` subcommands read this to understand project context.

### External CLI Dependencies
The tool orchestrates several external CLIs: `git`, `gh` (GitHub), `vercel`, `neonctl`, `supabase`. It auto-installs missing ones with user confirmation.

## Key Patterns

- All user prompts use `@clack/prompts` — always check `p.isCancel()` on prompt results
- `exec()` in `utils/exec.ts` returns `{ stdout, stderr, success }` — never throws
- `execInteractive()` uses `stdio: "inherit"` for commands needing user interaction (browser auth flows, org selection)
- Colors via `picocolors` (aliased as `pc`), not chalk
