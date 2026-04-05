import * as p from "@clack/prompts";
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "..", "templates");

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

interface Template {
  name: string;
  description: string;
  repo: string; // GitHub repo to clone
  available: boolean;
}

const TEMPLATES: Record<string, Template> = {
  nextjs: {
    name: "Next.js",
    description: "Full-stack React with App Router, SSR, and API routes",
    repo: "colinmcdermott/whop-saas-starter-v2",
    available: true,
  },
  astro: {
    name: "Astro",
    description: "Content-focused with islands architecture",
    repo: "",
    available: false,
  },
  tanstack: {
    name: "TanStack Start",
    description: "Full-stack React with TanStack Router",
    repo: "",
    available: false,
  },
  vite: {
    name: "Vite + React",
    description: "Lightweight SPA with Vite bundler",
    repo: "",
    available: false,
  },
};

// ---------------------------------------------------------------------------
// App type registry
// ---------------------------------------------------------------------------

interface AppType {
  name: string;
  description: string;
  available: boolean;
}

const APP_TYPES: Record<string, AppType> = {
  saas: {
    name: "SaaS",
    description: "Subscription tiers, dashboard, billing portal",
    available: true,
  },
  course: {
    name: "Course",
    description: "Lessons, progress tracking, drip content",
    available: false,
  },
  community: {
    name: "Community",
    description: "Member feeds, gated content, roles",
    available: false,
  },
  blank: {
    name: "Blank",
    description: "Just auth + payments, you build the rest",
    available: false,
  },
};

// ---------------------------------------------------------------------------
// Database options
// ---------------------------------------------------------------------------

interface DbOption {
  name: string;
  description: string;
  envVarHint: string;
}

const DB_OPTIONS: Record<string, DbOption> = {
  neon: {
    name: "Neon",
    description: "Serverless Postgres (recommended)",
    envVarHint: "postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require",
  },
  supabase: {
    name: "Supabase",
    description: "Open-source Firebase alternative",
    envVarHint: "postgresql://postgres.xxx:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
  },
  local: {
    name: "Local PostgreSQL",
    description: "Your own Postgres instance",
    envVarHint: "postgresql://postgres:postgres@localhost:5432/myapp",
  },
  later: {
    name: "Configure later",
    description: "Skip database setup for now",
    envVarHint: "",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, { cwd, stdio: "pipe", encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function hasCommand(cmd: string): boolean {
  return run(`which ${cmd}`) !== "";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const projectName = args[0];

  console.log("");
  p.intro("Create Whop Kit App");

  // Project name
  const name = projectName ?? await p.text({
    message: "Project name",
    placeholder: "my-whop-app",
    validate: (v) => {
      if (!v) return "Project name is required";
      if (existsSync(resolve(v))) return `Directory "${v}" already exists`;
    },
  });

  if (p.isCancel(name)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // What are you building?
  const appType = await p.select({
    message: "What are you building?",
    options: Object.entries(APP_TYPES).map(([value, { name, description, available }]) => ({
      value,
      label: available ? name : `${name} (coming soon)`,
      hint: description,
      disabled: !available,
    })),
  });

  if (p.isCancel(appType)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // Framework
  const framework = await p.select({
    message: "Which framework?",
    options: Object.entries(TEMPLATES).map(([value, { name, description, available }]) => ({
      value,
      label: available ? name : `${name} (coming soon)`,
      hint: description,
      disabled: !available,
    })),
  });

  if (p.isCancel(framework)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // Database
  const database = await p.select({
    message: "Which database?",
    options: Object.entries(DB_OPTIONS).map(([value, { name, description }]) => ({
      value,
      label: name,
      hint: description,
    })),
  });

  if (p.isCancel(database)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // Database URL (if not skipping)
  let databaseUrl = "";
  if (database !== "later") {
    const dbUrl = await p.text({
      message: "Database URL",
      placeholder: DB_OPTIONS[database as string].envVarHint,
      validate: (v) => {
        if (!v) return "Database URL is required (or go back and choose 'Configure later')";
      },
    });

    if (p.isCancel(dbUrl)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    databaseUrl = dbUrl;
  }

  // Scaffold
  const template = TEMPLATES[framework as string];
  const projectDir = resolve(name as string);

  const s = p.spinner();
  s.start("Cloning template...");

  // Clone from GitHub
  const cloneResult = run(
    `git clone --depth 1 https://github.com/${template.repo}.git "${projectDir}" 2>&1`,
  );

  if (!existsSync(projectDir)) {
    s.stop("Failed to clone template");
    p.log.error(cloneResult || "Git clone failed. Make sure git is installed.");
    process.exit(1);
  }

  // Remove .git so it's a fresh project
  run(`rm -rf "${join(projectDir, ".git")}"`);

  // Update package.json name
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    pkg.name = basename(name as string);
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  s.stop("Template cloned");

  // Write .env.local
  if (databaseUrl) {
    s.start("Configuring environment...");
    const envContent = `DATABASE_URL="${databaseUrl}"\n`;
    writeFileSync(join(projectDir, ".env.local"), envContent);
    s.stop("Environment configured");
  }

  // Install dependencies
  const packageManager = hasCommand("pnpm") ? "pnpm" : hasCommand("yarn") ? "yarn" : "npm";
  s.start(`Installing dependencies with ${packageManager}...`);
  run(`${packageManager} install`, projectDir);
  s.stop("Dependencies installed");

  // Init git
  run("git init", projectDir);
  run("git add -A", projectDir);
  run('git commit -m "initial: scaffolded with create-whop-kit"', projectDir);

  // Done
  const relativePath = name as string;

  p.note(
    [
      `cd ${relativePath}`,
      databaseUrl ? `${packageManager} run db:push` : `# Add DATABASE_URL to .env.local first`,
      `${packageManager} run dev`,
    ].join("\n"),
    "Next steps",
  );

  p.outro("Happy building!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
