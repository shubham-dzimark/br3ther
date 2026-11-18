# Restoring br3thr-backup-2026-11-17-04-26.tar.gz

This archive is a complete copy of the shop: application code, uploaded media
and the full database. It does NOT contain node_modules or the .next build -
both are regenerated below - and it does not contain the real .env unless the
backup was created with secrets included.

## 1. Put the files in place

    mkdir -p /var/www/br3thr
    tar xzf br3thr-backup-2026-11-17-04-26.tar.gz -C /var/www/br3thr

## 2. Create the database and load the dump

    sudo -u postgres createdb br3thr
    sudo -u postgres psql -d br3thr -f /var/www/br3thr/database.sql

## 3. Environment

Copy .env.example to .env and fill in every value:

  DATABASE_URL              postgres connection string for the new server
  NEXT_PUBLIC_SITE_URL      the public URL, e.g. https://example.com
  CRON_SECRET               any long random string
  VAPID_PUBLIC_KEY          push keys - regenerate with: npx web-push generate-vapid-keys
  NEXT_PUBLIC_VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY
  VAPID_SUBJECT             mailto: address

## 4. Build and run

    cd /var/www/br3thr
    npm ci
    npx prisma generate
    npx prisma migrate deploy
    npm run build
    npm start

## 5. Also needed on the new server

- A web server in front (Apache/nginx) terminating TLS and proxying to the app
- A systemd unit so it restarts on boot
- A crontab entry for the backup and the two existing cron endpoints

Store settings, products, orders, customers and media all travel inside the
database dump and the uploads folder, so the shop comes back configured.
