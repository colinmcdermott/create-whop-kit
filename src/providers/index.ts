import { neonProvider } from "./neon.js";
import { supabaseProvider } from "./supabase.js";
import { prismaPostgresProvider } from "./prisma-postgres.js";
import type { DbProvider } from "./types.js";

export type { DbProvider, ProvisionResult } from "./types.js";

export const DB_PROVIDERS: Record<string, DbProvider> = {
  neon: neonProvider,
  supabase: supabaseProvider,
  "prisma-postgres": prismaPostgresProvider,
};
