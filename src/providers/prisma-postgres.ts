import * as p from "@clack/prompts";
import pc from "picocolors";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../utils/exec.js";
import type { DbProvider, ProvisionResult } from "./types.js";

export const prismaPostgresProvider: DbProvider = {
  name: "Prisma Postgres",
  description: "Instant Postgres — no auth needed, free tier",

  isInstalled() {
    // npx create-db works without global install
    return true;
  },

  async install() {
    // No installation needed — uses npx
    return true;
  },

  async provision(projectName) {
    const region = await p.select({
      message: "Prisma Postgres region",
      options: [
        { value: "us-east-1", label: "US East (Virginia)", hint: "default" },
        { value: "us-west-1", label: "US West (Oregon)" },
        { value: "eu-central-1", label: "EU Central (Frankfurt)" },
        { value: "eu-west-3", label: "EU West (Paris)" },
        { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
        { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
      ],
    });
    if (p.isCancel(region)) return null;

    const s = p.spinner();
    s.start("Creating Prisma Postgres database...");

    // create-db outputs the connection string and writes to .env
    const result = exec(`npx create-db@latest --region ${region} --json`);

    if (!result.success) {
      // Fallback: try without --json
      const fallback = exec(`npx -y create-db@latest --region ${region}`);
      if (!fallback.success) {
        s.stop("Failed to create database");
        p.log.error("Try manually: " + pc.bold("npx create-db@latest"));
        return null;
      }

      // Parse connection string from output
      const match = fallback.stdout.match(/postgresql:\/\/[^\s"]+/);
      if (match) {
        s.stop("Prisma Postgres database created");
        return {
          connectionString: match[0],
          provider: "prisma-postgres",
          note: "This is a temporary database (24h). Claim it via the link in the output to make it permanent.",
        };
      }
    }

    // Try to parse JSON output
    try {
      const data = JSON.parse(result.stdout);
      if (data.connectionString || data.url) {
        s.stop("Prisma Postgres database created");
        return {
          connectionString: data.connectionString || data.url,
          provider: "prisma-postgres",
          note: "This is a temporary database (24h). Claim it to make it permanent.",
        };
      }
    } catch {
      // Try regex fallback on stdout
      const match = result.stdout.match(/postgresql:\/\/[^\s"]+/);
      if (match) {
        s.stop("Prisma Postgres database created");
        return {
          connectionString: match[0],
          provider: "prisma-postgres",
          note: "This is a temporary database (24h). Claim it to make it permanent.",
        };
      }
    }

    // Last resort: check if .env was written
    if (existsSync(".env")) {
      const envContent = readFileSync(".env", "utf-8");
      const match = envContent.match(/DATABASE_URL="?(postgresql:\/\/[^\s"]+)"?/);
      if (match) {
        s.stop("Prisma Postgres database created");
        return {
          connectionString: match[1],
          provider: "prisma-postgres",
          note: "This is a temporary database (24h). Claim it to make it permanent.",
        };
      }
    }

    s.stop("Database created but could not extract connection string");
    p.log.warning("Check the output above for your DATABASE_URL, or visit https://console.prisma.io");
    return null;
  },
};
