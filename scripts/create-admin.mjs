#!/usr/bin/env node
// Creates or resets an admin user.
//   node scripts/create-admin.mjs <email> <name> <password>
// Uses pg directly rather than Prisma so it works without a generated client.

import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const [email, name, password] = process.argv.slice(2);

if (!email || !name || !password) {
  console.error("usage: node scripts/create-admin.mjs <email> <name> <password>");
  process.exit(1);
}
if (password.length < 12) {
  console.error("password must be at least 12 characters");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const hash = await bcrypt.hash(password, 12);
const now = new Date();

const { rows } = await client.query(
  `INSERT INTO "AdminUser" (id, email, name, "passwordHash", role, "isActive", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, $4, 'OWNER', true, $5, $5)
   ON CONFLICT (email) DO UPDATE
     SET "passwordHash" = EXCLUDED."passwordHash",
         name           = EXCLUDED.name,
         "isActive"     = true,
         "updatedAt"    = EXCLUDED."updatedAt"
   RETURNING id, email, name, role`,
  [randomUUID(), email.toLowerCase(), name, hash, now],
);

console.log("admin ready:", rows[0]);
await client.end();
