export interface Template {
  name: string;
  description: string;
  repo: string;
  available: boolean;
}

export interface AppType {
  name: string;
  description: string;
  available: boolean;
}

export interface DbOption {
  name: string;
  description: string;
  envVarHint: string;
}

export const FRAMEWORKS: Record<string, { name: string; description: string; available: boolean }> = {
  nextjs: {
    name: "Next.js",
    description: "Full-stack React with App Router, SSR, and API routes",
    available: true,
  },
  astro: {
    name: "Astro",
    description: "Content-focused with islands architecture",
    available: true,
  },
  tanstack: {
    name: "TanStack Start",
    description: "Full-stack React with TanStack Router",
    available: false,
  },
  vite: {
    name: "Vite + React",
    description: "Lightweight SPA with Vite bundler",
    available: false,
  },
};

/**
 * Template registry keyed by "{appType}:{framework}".
 * Falls back to "{appType}:nextjs" if the specific combo doesn't exist.
 */
export const TEMPLATES: Record<string, Template> = {
  "saas:nextjs": {
    name: "Next.js SaaS",
    description: "Full SaaS with dashboard, pricing, billing, and docs",
    repo: "whopio/whop-saas-starter",
    available: true,
  },
  "saas:astro": {
    name: "Astro SaaS",
    description: "Full SaaS with dashboard, pricing, and Tailwind",
    repo: "colinmcdermott/whop-astro-starter",
    available: true,
  },
  "blank:nextjs": {
    name: "Next.js Blank",
    description: "Just auth + webhooks — build anything",
    repo: "colinmcdermott/whop-blank-starter",
    available: true,
  },
};

export function getTemplate(appType: string, framework: string): Template | null {
  return TEMPLATES[`${appType}:${framework}`] ?? null;
}

export const APP_TYPES: Record<string, AppType> = {
  saas: {
    name: "SaaS",
    description: "Subscription tiers, dashboard, billing portal",
    available: true,
  },
  blank: {
    name: "Blank",
    description: "Just auth + payments, you build the rest",
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
};

export const DB_OPTIONS: Record<string, DbOption> = {
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
