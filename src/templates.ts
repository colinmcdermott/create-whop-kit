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

export const TEMPLATES: Record<string, Template> = {
  nextjs: {
    name: "Next.js",
    description: "Full-stack React with App Router, SSR, and API routes",
    repo: "colinmcdermott/whop-saas-starter-v2",
    available: true,
  },
  astro: {
    name: "Astro",
    description: "Content-focused with islands architecture",
    repo: "colinmcdermott/whop-astro-starter",
    available: true,
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

export const APP_TYPES: Record<string, AppType> = {
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
