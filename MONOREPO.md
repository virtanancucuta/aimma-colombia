# AIMMA Monorepo

## Estructura

```
aimma-website/
├── apps/
│   └── storefront/        ← Astro 5 + Cloudflare Pages (multi-tenant)
├── packages/
│   └── database/          ← Tipos Supabase compartidos
│
├── (legacy en raiz — sigue desplegando en Easypanel intacto)
├── index.html             ← Home aimma.com.co
├── iapanel/               ← Panel IA admin (Tienda IA, Contenido IA)
├── dashboard/             ← Dashboard Financiero
├── supabase/functions/    ← Edge Functions
├── nginx.conf
└── Dockerfile
```

## Migracion progresiva

- **Fase 5 (actual):** agregamos `apps/storefront/` SIN tocar la estructura legacy. Easypanel sigue construyendo aimma.com.co como antes (Dockerfile + nginx.conf intactos).
- **Fase 6 (futura):** migrar `iapanel/`, `dashboard/`, HTMLs raiz → `apps/admin/`, `apps/dashboard/`, `apps/web/`. Ajustar Dockerfile para `COPY apps/web/dist/`.

## Tooling

- **Workspaces:** npm workspaces (Node 24, npm 11). Si en algun momento se quiere migrar a pnpm: `corepack enable && corepack prepare pnpm@latest --activate` (requiere admin en Windows) + `pnpm import` lee el package-lock.json existente.
- **Build pipeline storefront:** Cloudflare Pages con `Watch paths: apps/storefront/**`. NO se redeploya en push si solo cambian archivos legacy.
- **Easypanel pipeline (legacy):** sigue construyendo desde raiz, ignora `apps/` y `packages/` porque el Dockerfile no los referencia.

## Comandos rapidos

```bash
# Instalar deps de todo el monorepo
npm install

# Dev storefront (con HMR)
npm run storefront:dev

# Build storefront para producccion
npm run storefront:build

# Preview build storefront localmente
npm run storefront:preview
```

## Por que monorepo workspaces y no repos separados

AIMMA tiene target 10k tiendas y multiples apps (web, admin, dashboard, storefront, futuro panel cliente final). Monorepo workspaces da:

1. **Tipos Supabase compartidos** (`packages/database/`) — 1 sola fuente de verdad.
2. **Refactor cross-app** type-safe (admin agrega columna → storefront error tipo en build, no en runtime).
3. **Build cache** (Turborepo opcional) — CI 5-10x mas rapido al escalar.
4. **Onboarding nuevo dev** — 1 `git clone`, estructura estandar industria.
5. **Deploy independence** — cada app tiene su propio pipeline.

Es lo que usan Shopify, Vercel, Linear, Stripe a esa escala.
