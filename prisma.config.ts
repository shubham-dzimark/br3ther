import path from "node:path";
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 moved the connection URL out of schema.prisma into this file.
// `datasource.url` is what the migration engine uses. The runtime client
// connects through the pg driver adapter instead - see src/lib/prisma.ts.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // Migrations need a direct connection; Neon on Vercel provides it as
    // DATABASE_URL_UNPOOLED (the pooled DATABASE_URL is for the app).
    url: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL) as string,
  },
});
