#!/usr/bin/env node
/**
 * Schema sync for the Vercel build (vercel-build).
 *
 * Runs `prisma db push`. Prisma asks for --accept-data-loss whenever a change
 * *could* lose data, e.g. adding a unique constraint to an existing table. We
 * only pass that flag while every table in the database is empty, which is the
 * case for a fresh (or half-built, never-used) database. As soon as any row
 * exists, the plain command runs and the build stops rather than risk data.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("db-sync: no DATABASE_URL_UNPOOLED or DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows: tables } = await client.query(
  `SELECT tablename FROM pg_tables
   WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
);
let total = 0;
for (const { tablename } of tables) {
  const safe = tablename.replace(/"/g, '""');
  const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM "${safe}") AS has`);
  if (rows[0].has) {
    total++;
    console.log(`db-sync: table "${tablename}" has data`);
  }
}
await client.end();

const empty = total === 0;
const args = ["prisma", "db", "push", ...(empty ? ["--accept-data-loss"] : [])];
console.log(
  empty
    ? `db-sync: all ${tables.length} tables are empty, allowing schema changes Prisma flags as lossy`
    : "db-sync: database has data, running plain db push",
);

const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
