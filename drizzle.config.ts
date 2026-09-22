import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Only needed for `drizzle-kit migrate` / studio, not for generate.
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/cfb_money",
  },
});
