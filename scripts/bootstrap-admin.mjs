#!/usr/bin/env node
/**
 * First-deploy admin. Runs in the Vercel build (vercel-build) and creates ONE
 * owner account from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD, but only
 * while the database has no admin at all. Once anyone exists it does nothing,
 * so later builds never reset a password. Without the two variables it skips.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!email || !password || !url) {
  console.log("bootstrap-admin: skipped (no BOOTSTRAP_ADMIN_* variables or no database)");
  process.exit(0);
}
if (password.length < 12) {
  console.error("bootstrap-admin: password must be at least 12 characters");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows } = await client.query(`SELECT count(*)::int AS n FROM "AdminUser"`);
if (rows[0].n > 0) {
  console.log("bootstrap-admin: an admin already exists, nothing to do");
} else {
  const now = new Date();
  await client.query(
    `INSERT INTO "AdminUser" (id, email, name, "passwordHash", role, "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'OWNER', true, $5, $5)`,
    [randomUUID(), email, "Br3thr", await bcrypt.hash(password, 12), now],
  );
  console.log(`bootstrap-admin: created owner ${email}`);
}
await client.end();
