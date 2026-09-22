import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

// Drizzle Kit runs outside Next.js, so load the same local environment files.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Use Neon's direct endpoint for migrations; the app keeps the pooled URL.
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      "postgres://localhost:5432/cfb_money",
  },
});
