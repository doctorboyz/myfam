import { defineConfig } from "prisma/config";

// Load dotenv only in dev (not installed in production)
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { require("dotenv/config"); } catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"]!,
  },
});
