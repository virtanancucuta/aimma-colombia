-- Extensiones que usa la app, creadas ANTES del baseline para que sus objetos resuelvan.
-- pg_cron / pg_stat_statements / supabase_vault las administra Supabase (vienen en cualquier branch).
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists unaccent with schema public;
