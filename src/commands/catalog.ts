import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { FRAMEWORKS, APP_TYPES, TEMPLATES } from "../templates.js";

export default defineCommand({
  meta: {
    name: "catalog",
    description: "List available templates, frameworks, databases, and features",
  },
  async run() {
    console.log("");
    p.intro(`${pc.bgCyan(pc.black(" whop-kit catalog "))} Available services`);

    // App types
    console.log(`\n  ${pc.bold(pc.underline("App Types"))}\n`);
    for (const [key, type] of Object.entries(APP_TYPES)) {
      const status = type.available ? pc.green("available") : pc.dim("coming soon");
      console.log(`  ${pc.bold(key.padEnd(15))} ${type.description.padEnd(45)} ${status}`);
    }

    // Frameworks
    console.log(`\n  ${pc.bold(pc.underline("Frameworks"))}\n`);
    for (const [key, fw] of Object.entries(FRAMEWORKS)) {
      const status = fw.available ? pc.green("available") : pc.dim("coming soon");
      console.log(`  ${pc.bold(key.padEnd(15))} ${fw.description.padEnd(45)} ${status}`);
    }

    // Templates
    console.log(`\n  ${pc.bold(pc.underline("Templates"))}\n`);
    for (const [key, tmpl] of Object.entries(TEMPLATES)) {
      const status = tmpl.available ? pc.green("available") : pc.dim("coming soon");
      console.log(`  ${pc.bold(key.padEnd(20))} ${tmpl.description.padEnd(40)} ${status}`);
    }

    // Databases
    console.log(`\n  ${pc.bold(pc.underline("Database Providers"))}\n`);
    const dbProviders = [
      { key: "neon", name: "Neon", desc: "Serverless Postgres, auto-provisioned", status: "auto" },
      { key: "prisma-postgres", name: "Prisma Postgres", desc: "Instant database, no auth needed", status: "auto" },
      { key: "supabase", name: "Supabase", desc: "Open-source Firebase alternative", status: "guided" },
      { key: "manual", name: "Manual", desc: "Paste any PostgreSQL connection string", status: "manual" },
    ];
    for (const db of dbProviders) {
      const badge = db.status === "auto" ? pc.green("auto-provision")
        : db.status === "guided" ? pc.yellow("guided setup")
        : pc.dim("manual");
      console.log(`  ${pc.bold(db.key.padEnd(20))} ${db.desc.padEnd(40)} ${badge}`);
    }

    // Features (whop-kit add)
    console.log(`\n  ${pc.bold(pc.underline("Features (whop-kit add)"))}\n`);
    const features = [
      { key: "email", desc: "Transactional email", providers: "Resend, SendGrid" },
      { key: "analytics", desc: "Product analytics", providers: "PostHog, Google Analytics, Plausible" },
      { key: "webhook-event", desc: "Add webhook event handler", providers: "—" },
    ];
    for (const feat of features) {
      console.log(`  ${pc.bold(feat.key.padEnd(20))} ${feat.desc.padEnd(30)} ${pc.dim(feat.providers)}`);
    }

    // Agent skills
    console.log(`\n  ${pc.bold(pc.underline("Agent Skills (auto-installed)"))}\n`);
    const skills = [
      { provider: "Neon", skills: "neon-postgres, neon-serverless" },
      { provider: "Supabase", skills: "supabase-postgres-best-practices" },
      { provider: "Whop", skills: "whop-saas-starter, whop-dev" },
    ];
    for (const s of skills) {
      console.log(`  ${pc.bold(s.provider.padEnd(20))} ${pc.dim(s.skills)}`);
    }

    console.log("");
    p.outro(`Run ${pc.bold("npx create-whop-kit")} to get started`);
  },
});
