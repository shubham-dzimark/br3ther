# Br3thr

Storefront and admin for the Br3thr shop. Next.js 16 (App Router), Prisma 7,
PostgreSQL.

## Local setup (Windows)

Requirements: Node 22+, PostgreSQL 18 (the local install listens on port **5433**).

1. Create the database (once):

   ```bash
   psql -h 127.0.0.1 -p 5433 -U postgres -c "CREATE ROLE br3thr LOGIN PASSWORD 'br3thr' CREATEDB;"
   psql -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE br3thr OWNER br3thr;"
   psql -h 127.0.0.1 -p 5433 -U br3thr -d br3thr -f database.sql
   ```

   `database.sql` is the production dump and still contains the old brand name.
   For the local DB a copy with every "godfather" replaced by "br3thr" was
   loaded instead.

2. `.env` (local values; the server's original file is kept as `.env.server`):

   ```
   DATABASE_URL=postgresql://br3thr:br3thr@127.0.0.1:5433/br3thr
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

   plus `CRON_SECRET`, the `VAPID_*` keys, `BACKUP_DIR` and `PUBLISH_DIR`. See `.env.example`.

3. Install, migrate, run:

   ```bash
   npm ci
   npx prisma migrate deploy
   npx prisma generate
   npm run dev        # http://localhost:3000, admin at /admin/login
   ```

   `npm run dev` uses webpack (`next dev --webpack`). Turbopack fails on Windows
   with `next/font/google queries have exactly one entry`.

4. Admin login: the dump's owner account is `help@br3thr.com`. To set a
   password you know:

   ```bash
   node scripts/create-admin.mjs help@br3thr.com "Br3thr" "<password, 12+ chars>"
   ```

## Tests

```bash
npm test
```

## Production

See `RESTORE.md` and `deploy/`.
