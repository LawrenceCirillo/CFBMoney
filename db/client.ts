import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

let _db: Db | null = null;
let _pool: Pool | null = null;

/** True when a Postgres connection string is configured. */
export function dbEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * Lazily-created shared drizzle client. Throws if DATABASE_URL is missing —
 * callers should check dbEnabled() first and degrade gracefully.
 */
export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _pool = new Pool({ connectionString: url, max: 5 });
  _db = drizzle(_pool, { schema });
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
