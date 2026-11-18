-- WooCommerce-style order statuses (On hold, Failed). Idempotent: already applied by hand on 2026-11-08.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD' AFTER 'PROCESSING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'FAILED';
