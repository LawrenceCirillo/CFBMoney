import { randomBytes } from "node:crypto";
import { mkdtempSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("No test port");
  return address.port;
}

/** Every test receives a fresh database and can only use a local test service. */
export async function startTestPostgres(label: string): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const serviceUrl = process.env.TEST_DATABASE_URL;
  if (serviceUrl) {
    const parsed = new URL(serviceUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL");
    }
    if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
        parsed.pathname !== "/cfb_test") {
      throw new Error("TEST_DATABASE_URL must target a local cfb_test database");
    }
    const name = `cfb_test_${randomBytes(8).toString("hex")}`;
    const admin = new Pool({ connectionString: serviceUrl, max: 1 });
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
    const testUrl = new URL(serviceUrl);
    testUrl.pathname = `/${name}`;
    return {
      url: testUrl.toString(),
      async close() {
        const cleanup = new Pool({ connectionString: serviceUrl, max: 1 });
        try {
          await cleanup.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        } finally {
          await cleanup.end();
        }
      },
    };
  }

  const databaseDir = realpathSync(mkdtempSync(join(tmpdir(), `cfb-${label}-`)));
  if (realpathSync(join(databaseDir, "..")) !== realpathSync(tmpdir())) {
    throw new Error("Test database directory escaped OS temp");
  }
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir, port, user: "cfbtest", password: "cfbtest", persistent: false,
  });
  await pg.initialise();
  await pg.start();
  return {
    url: `postgres://cfbtest:cfbtest@127.0.0.1:${port}/postgres`,
    close: () => pg.stop(),
  };
}
