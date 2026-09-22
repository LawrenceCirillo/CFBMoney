import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type PgDb = NodePgDatabase<typeof schema>;
type NeonDb = NeonHttpDatabase<typeof schema>;
type Db = PgDb | NeonDb;

let _db: Db | null = null;
let _pool: Pool | null = null;

/** True when a Postgres connection string is configured. */
export function dbEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

function usesNeon(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

/**
 * Lazily-created shared drizzle client. Throws if DATABASE_URL is missing —
 * callers should check dbEnabled() first and degrade gracefully.
 * Neon hosts use the HTTP driver so a serverless function does not hold a
 * pooled connection open. Any other Postgres URL keeps the node-postgres pool.
 */
export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (usesNeon(url)) {
    _db = drizzleNeon(neon(url), { schema });
    return _db;
  }
  _pool = new Pool({ connectionString: url, max: 5 });
  _db = drizzlePg(_pool, { schema });
  return _db;
}

/** Test hook: inject a prebuilt db (e.g. pg-mem) instead of a live Pool. */
export function setDb(db: Db): void {
  _db = db;
}

/** Test hook: drop the cached client. */
export function resetDb(): void {
  _db = null;
  _pool = null;
}
