# AIMMA Editor PRO-MAX Plan 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar end-to-end el Editor PRO-MAX entregando la vista admin donde el dueño construye su home + 2 EFs (guardar-layout + form-submit) + 6to tab CRM Mensajes + storefront forms LIVE.

**Architecture:** Plan 3 implementa Fase 12.C.4 del spec maestro v2. El render-pipeline storefront (Plans 1+2 LIVE) ya soporta `pages.home` via BlockRenderer. Plan 3 agrega: (1) panel admin vanilla JS coherente con resto del SPA (SortableJS reorder vertical + GridStack drag elements grid 24-col + Inspector helpers compartidos + first-use híbrido Starter/Desde Cero + tour); (2) EF `tienda-guardar-layout` con Zod + locking optimista + KV invalidate; (3) EF `tienda-form-submit` público con CORS + honeypot + rate limit; (4) BD migration consolidada (form_submissions + notif queue + rate limit RPC + flags first-use); (5) 6to tab CRM Mensajes con badge + WhatsApp helper.

**Tech Stack:** Vanilla JS ES2020 (panel admin SPA) · SortableJS 13KB + GridStack 35KB vendored · Astro 5 SSR (storefront mod blocks) · Supabase Edge Functions Deno + Zod · PostgreSQL 15 + RLS · Cloudflare KV TENANT_CACHE · Playwright E2E.

**Estimado:** ~2 semanas (1 dev full-time) ejecutado con subagent-driven-development.

**Spec source:** `docs/SUPERPOWERS/specs/2026-06-02-editor-pro-max-plan3-design.md` HEAD `92312d4`.

---

## Estructura de archivos completa

### NEW

```
supabase/migrations/
└── 20260602000000_editor_promax_plan3.sql                          (BD migration)

supabase/functions/
├── _shared/
│   └── editor-schema.ts                                            (copia Deno-side Zod schemas)
├── tienda-guardar-layout/
│   └── index.ts                                                    (EF verify_jwt=true)
└── tienda-form-submit/
    └── index.ts                                                    (EF verify_jwt=false)

iapanel/tienda/admin/views/editor/
├── editor.js                                                       (entry, monta UI, auto-save)
├── editor-state.js                                                 (singleton state)
├── editor-toolbar.js                                               (top toolbar + atajos)
├── editor-sidebar.js                                               (Pages + Outline)
├── editor-canvas.js                                                (SortableJS + GridStack)
├── editor-inspector.js                                             (panel derecho contextual)
├── editor-modal-catalog.js                                         (modal 8 thumbnails)
├── editor-first-use.js                                             (modal + tour + starter JSON)
├── editor-controls.js                                              (6 helpers reusables)
├── editor-styles.css                                               (3 paneles + grid lines)
└── lib/
    ├── sortable.min.js                                             (vendored 13KB)
    ├── gridstack.min.js                                            (vendored 35KB)
    └── gridstack.min.css                                           (vendored grid lines)

iapanel/tienda/admin/views/
└── crm-mensajes.js                                                 (6to tab CRM)

apps/storefront/src/components/blocks/formulario/
└── _FormSubmitHandler.astro                                        (DRY script inline)

tests-e2e/
└── plan3-editor.spec.js                                            (suite Playwright 20 tests)
```

### MOD

```
iapanel/tienda/admin/admin.js                  (agregar ROUTE 'editor' + integracion editor.js)
iapanel/tienda/admin/admin.css                 (estilo nav item editor)
iapanel/tienda/admin/index.html                (nav item + script tags vendored + editor scripts)
iapanel/tienda/admin/views/crm.js              (6to tab mensajes en TABS)
apps/storefront/src/components/blocks/formulario/FormularioIndustrialClean.astro
apps/storefront/src/components/blocks/formulario/FormularioFashionBold.astro
apps/storefront/src/components/blocks/formulario/FormularioMinimalArtesanal.astro
apps/storefront/src/components/blocks/formulario/FormularioEditorialMagazine.astro
```

---

# FASE 1 — Foundation (BD + Zod copia Deno)

## Task 1: BD migration consolidada Plan 3

**Files:**
- Create: `supabase/migrations/20260602000000_editor_promax_plan3.sql`

**Dependencias:** ninguna (raíz).

- [ ] **Step 1: Crear archivo migration con SQL completo**

Contenido exacto del archivo:

```sql
-- supabase/migrations/20260602000000_editor_promax_plan3.sql
-- AIMMA Tienda IA · Editor PRO-MAX Plan 3
-- Agrega: form_submissions + notifs queue + rate limit RPC + flags first-use + notif_email

-- =========================================================
-- 1) Flags first-use editor en tiendas
-- =========================================================
ALTER TABLE tiendas
  ADD COLUMN IF NOT EXISTS editor_first_choice_at timestamptz,
  ADD COLUMN IF NOT EXISTS editor_tour_visto_at   timestamptz,
  ADD COLUMN IF NOT EXISTS notif_email            text;

COMMENT ON COLUMN tiendas.editor_first_choice_at IS
  'Plan 3: timestamp en que el dueno respondio el modal Starter/Desde Cero';
COMMENT ON COLUMN tiendas.editor_tour_visto_at IS
  'Plan 3: timestamp en que el dueno cerro el tour overlay';
COMMENT ON COLUMN tiendas.notif_email IS
  'Plan 3: email opcional para notificaciones de form submissions';

-- =========================================================
-- 2) form_submissions
-- =========================================================
CREATE TABLE form_submissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id   uuid NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  section_id  text NOT NULL,
  fields      jsonb NOT NULL,
  ip          text,
  user_agent  text,
  leido_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_submissions_tienda_created
  ON form_submissions(tienda_id, created_at DESC);

CREATE INDEX idx_form_submissions_unread
  ON form_submissions(tienda_id)
  WHERE leido_at IS NULL;

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_submissions"
  ON form_submissions FOR SELECT
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));

CREATE POLICY "owner_update_submissions"
  ON form_submissions FOR UPDATE
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));

-- INSERT solo via service_role (sin policy = denied a anon/authenticated)

-- =========================================================
-- 3) Cola notificaciones email (stub Plan 3, envio real Plan 5)
-- =========================================================
CREATE TABLE form_submission_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id     uuid NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES form_submissions(id) ON DELETE CASCADE,
  destino       text NOT NULL,
  asunto        text NOT NULL,
  cuerpo        text NOT NULL,
  estado        text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','enviado','fallido')),
  intentos      int NOT NULL DEFAULT 0,
  error_msg     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  enviado_at    timestamptz
);

CREATE INDEX idx_notif_pendientes
  ON form_submission_notifications(created_at)
  WHERE estado = 'pendiente';

ALTER TABLE form_submission_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_read_notifs"
  ON form_submission_notifications FOR SELECT
  USING (tienda_id IN (SELECT id FROM tiendas WHERE user_id = auth.uid()));

-- =========================================================
-- 4) Rate limit sliding window
-- =========================================================
CREATE TABLE form_submit_rate_limit (
  rate_key      text PRIMARY KEY,
  count         int NOT NULL,
  window_start  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_submit_rate_window
  ON form_submit_rate_limit(window_start);

CREATE OR REPLACE FUNCTION check_rate_limit_form_submit(
  p_key text,
  p_max int,
  p_window_minutes int
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_window_start timestamptz;
BEGIN
  SELECT count, window_start
    INTO v_count, v_window_start
    FROM form_submit_rate_limit
    WHERE rate_key = p_key
    FOR UPDATE;

  IF NOT FOUND OR v_window_start < now() - (p_window_minutes || ' minutes')::interval THEN
    INSERT INTO form_submit_rate_limit (rate_key, count, window_start)
    VALUES (p_key, 1, now())
    ON CONFLICT (rate_key) DO UPDATE
      SET count = 1, window_start = now();
    RETURN 1;
  END IF;

  UPDATE form_submit_rate_limit
    SET count = count + 1
    WHERE rate_key = p_key;
  RETURN v_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION check_rate_limit_form_submit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit_form_submit TO service_role;

CREATE OR REPLACE FUNCTION cleanup_form_submit_rate_limit() RETURNS int
LANGUAGE sql
SET search_path = public
AS $$
  WITH d AS (
    DELETE FROM form_submit_rate_limit
      WHERE window_start < now() - interval '24 hours'
      RETURNING 1
  )
  SELECT count(*)::int FROM d;
$$;

REVOKE ALL ON FUNCTION cleanup_form_submit_rate_limit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_form_submit_rate_limit TO service_role;
```

- [ ] **Step 2: Aplicar migration via MCP Supabase**

Run via Supabase MCP tool `apply_migration`:
- name: `editor_promax_plan3`
- query: (contenido completo del archivo step 1)

Expected: success, no errors.

- [ ] **Step 3: Verificar tablas + columnas creadas**

Run via Supabase MCP tool `execute_sql`:

```sql
SELECT
  (SELECT column_name FROM information_schema.columns
     WHERE table_name='tiendas' AND column_name='editor_first_choice_at') AS col1,
  (SELECT column_name FROM information_schema.columns
     WHERE table_name='tiendas' AND column_name='editor_tour_visto_at') AS col2,
  (SELECT column_name FROM information_schema.columns
     WHERE table_name='tiendas' AND column_name='notif_email') AS col3,
  (SELECT table_name FROM information_schema.tables
     WHERE table_name='form_submissions') AS t1,
  (SELECT table_name FROM information_schema.tables
     WHERE table_name='form_submission_notifications') AS t2,
  (SELECT table_name FROM information_schema.tables
     WHERE table_name='form_submit_rate_limit') AS t3,
  (SELECT routine_name FROM information_schema.routines
     WHERE routine_name='check_rate_limit_form_submit') AS r1;
```

Expected: 7 columnas/tablas/routines no-null.

- [ ] **Step 4: Verificar RLS habilitado**

Run via Supabase MCP tool `execute_sql`:

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('form_submissions','form_submission_notifications','form_submit_rate_limit')
ORDER BY tablename;
```

Expected: 3 rows, todas con `rowsecurity = true`.

- [ ] **Step 5: Test RPC con datos sintéticos**

Run via Supabase MCP tool `execute_sql`:

```sql
-- Primer call: count=1
SELECT check_rate_limit_form_submit('test:plan3:1', 10, 60);
-- Segundo call: count=2
SELECT check_rate_limit_form_submit('test:plan3:1', 10, 60);
-- Cleanup test
DELETE FROM form_submit_rate_limit WHERE rate_key='test:plan3:1';
```

Expected: primer call retorna 1, segundo retorna 2.

- [ ] **Step 6: Commit migration**

```powershell
git add supabase/migrations/20260602000000_editor_promax_plan3.sql
git commit -F .commit-msg-task1.tmp
```

`.commit-msg-task1.tmp` content:
```
feat(editor): BD migration Plan 3 Task 1 - form_submissions + rate limit RPC + flags first-use

- ALTER tiendas: editor_first_choice_at, editor_tour_visto_at, notif_email
- TABLE form_submissions con RLS owner_select + owner_update
- TABLE form_submission_notifications cola estado pendiente/enviado/fallido
- TABLE form_submit_rate_limit + RPC check_rate_limit_form_submit (sliding window)
- RPC cleanup_form_submit_rate_limit (DELETE > 24h)
- Grants restringidos a service_role only

Verificado LIVE: 7 objetos creados, 3 RLS habilitados, RPC retorna 1 then 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 2: Copia editor-schema.ts a supabase/functions/_shared/

**Files:**
- Read: `packages/database/src/editor-schema.ts` (existente, Plan 1 HEAD bd2b116)
- Create: `supabase/functions/_shared/editor-schema.ts`

**Dependencias:** Task 1 (BD lista para EFs que la consumirán).

- [ ] **Step 1: Verificar existencia de packages/database/src/editor-schema.ts**

```powershell
Test-Path 'packages/database/src/editor-schema.ts'
```

Expected: `True`.

- [ ] **Step 2: Crear carpeta _shared si no existe**

```powershell
if (-not (Test-Path 'supabase/functions/_shared')) {
  New-Item -ItemType Directory -Path 'supabase/functions/_shared'
}
```

- [ ] **Step 3: Copiar editor-schema.ts a Deno-side con import Deno-compatible**

El archivo `packages/database/src/editor-schema.ts` usa `import { z } from 'zod'`. En Deno EF necesitamos `import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'`.

Crear `supabase/functions/_shared/editor-schema.ts` con contenido idéntico a `packages/database/src/editor-schema.ts` cambiando solo la línea de import:

Cambio de import:
- Original: `import { z } from 'zod';`
- Deno: `import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';`

Resto del archivo: idéntico (schemas + regex + types + parsePersonalizaciones helper).

Comando concreto:

```powershell
$src = Get-Content 'packages/database/src/editor-schema.ts' -Raw
$denoVersion = $src -replace "import \{ z \} from 'zod';", "import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';"
Set-Content -Path 'supabase/functions/_shared/editor-schema.ts' -Value $denoVersion -Encoding UTF8
```

- [ ] **Step 4: Verificar archivo creado correctamente**

```powershell
$content = Get-Content 'supabase/functions/_shared/editor-schema.ts' -Raw
$content.Substring(0, 200)
```

Expected: contiene `import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';` en línea 5 aprox.

- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/_shared/editor-schema.ts
git commit -F .commit-msg-task2.tmp
```

`.commit-msg-task2.tmp` content:
```
feat(editor): Plan 3 Task 2 - copia Deno-side editor-schema.ts a _shared

Necesario para que las 2 EFs nuevas (tienda-guardar-layout y tienda-form-submit)
puedan importar PersonalizacionesSchema + SectionSchema + ElementSchema sin
duplicar codigo. Cambio unico vs Plan 1: import de zod desde deno.land/x/zod.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

# FASE 2 — EFs server-side

## Task 3: EF tienda-guardar-layout (escribir + deploy + verificar)

**Files:**
- Create: `supabase/functions/tienda-guardar-layout/index.ts`

**Dependencias:** Task 1 (BD), Task 2 (Zod copia).

- [ ] **Step 1: Crear EF tienda-guardar-layout/index.ts**

Contenido completo del archivo:

```typescript
// supabase/functions/tienda-guardar-layout/index.ts
// AIMMA Tienda IA · Editor PRO-MAX Plan 3
// Recibe pages.home edited desde panel admin y guarda en BD.
// Mode draft: guarda en pages.home_draft (auto-save 30s)
// Mode publish: promueve draft -> home + invalida KV via /internal/invalidate-kv

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { PersonalizacionesSchema } from '../_shared/editor-schema.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INVALIDATE_SECRET = Deno.env.get('INVALIDATE_SECRET') || '';

const CORS_ORIGIN = 'https://aimma.com.co';

const corsHeaders = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

const BodySchema = z.object({
  tienda_id: z.string().uuid(),
  page_id: z.literal('home'),
  mode: z.enum(['draft', 'publish']),
  personalizaciones: PersonalizacionesSchema,
  base_updated_at: z.string().datetime().nullable(),
});

const MAX_PAYLOAD_BYTES = 2_000_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function invalidateKV(slug: string) {
  if (!INVALIDATE_SECRET) return;
  const url = `https://${slug}.tienda.aimma.com.co/_internal/invalidate-kv`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + INVALIDATE_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: 'tenant:' + slug }),
    });
    if (!r.ok) {
      console.error('kv_invalidate_failed', { slug, status: r.status });
    }
  } catch (err) {
    console.error('kv_invalidate_error', { slug, err: String(err) });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // 1) Auth JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) {
    return json({ error: 'unauthorized' }, 401);
  }

  // 2) Body size guard
  const raw = await req.text();
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }

  // 3) Zod validate
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(JSON.parse(raw));
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.errors : String(e);
    return json({ error: 'invalid_body', detail }, 400);
  }

  // 4) Ownership check
  const supabaseSvc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: tienda, error: tErr } = await supabaseSvc
    .from('tiendas')
    .select('id, user_id, slug, subdominio, personalizaciones')
    .eq('id', body.tienda_id)
    .single();
  if (tErr || !tienda) {
    return json({ error: 'tienda_not_found' }, 404);
  }
  if (tienda.user_id !== user.id) {
    return json({ error: 'not_owner' }, 403);
  }

  // 5) Locking optimista
  const currentHome = (tienda.personalizaciones as any)?.pages?.home;
  if (currentHome && body.base_updated_at &&
      currentHome.updated_at > body.base_updated_at) {
    return json({
      error: 'stale_layout',
      server_updated_at: currentHome.updated_at,
      server_personalizaciones: tienda.personalizaciones,
    }, 409);
  }

  // 6) Construir nuevo JSON según mode
  const now = new Date().toISOString();
  const next: any = structuredClone(tienda.personalizaciones || { schema_version: 2, pages: {} });
  next.schema_version = 2;
  if (body.personalizaciones.theme) {
    next.theme = body.personalizaciones.theme;
  }

  const homeFromClient = body.personalizaciones.pages.home;
  if (body.mode === 'draft') {
    next.pages.home_draft = { ...homeFromClient, updated_at: now };
  } else {
    next.pages.home = { ...homeFromClient, updated_at: now };
    delete next.pages.home_draft;
  }

  // 7) Upsert
  const { error: uErr } = await supabaseSvc
    .from('tiendas')
    .update({ personalizaciones: next, updated_at: now })
    .eq('id', body.tienda_id);
  if (uErr) {
    console.error('upsert_failed', uErr);
    return json({ error: 'upsert_failed' }, 500);
  }

  // 8) Si publish, invalidate KV best-effort
  if (body.mode === 'publish' && tienda.subdominio) {
    invalidateKV(tienda.subdominio).catch((e) =>
      console.error('kv_invalidate_async_failed', String(e))
    );
  }

  return json({
    success: true,
    mode: body.mode,
    updated_at: now,
    home: body.mode === 'publish' ? next.pages.home : next.pages.home_draft,
  });
});
```

- [ ] **Step 2: Deploy EF via MCP Supabase**

Run via Supabase MCP tool `deploy_edge_function`:
- name: `tienda-guardar-layout`
- entrypoint_path: `index.ts`
- files: array con `{ name: 'index.ts', content: <contenido step 1> }` + `{ name: '_shared/editor-schema.ts', content: <Task 2 content> }`

Expected: success, no errors.

- [ ] **Step 3: Verificar EF está deployed**

Run via Supabase MCP tool `list_edge_functions`:

Expected: array que incluye `tienda-guardar-layout` con status active.

- [ ] **Step 4: Test smoke con curl (401 sin auth)**

```powershell
$r = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-guardar-layout' `
  -Method POST `
  -Headers @{ 'Content-Type'='application/json' } `
  -Body '{"tienda_id":"00000000-0000-0000-0000-000000000000","page_id":"home","mode":"draft","personalizaciones":{"schema_version":2,"pages":{"home":{"version":1,"updated_at":"2026-06-02T00:00:00.000Z","sections":[]}}},"base_updated_at":null}' `
  -SkipHttpErrorCheck
"STATUS: " + $r.StatusCode
$r.Content
```

Expected: `STATUS: 401` con body `{"error":"unauthorized"}`.

- [ ] **Step 5: Commit**

```powershell
git add supabase/functions/tienda-guardar-layout/index.ts
git commit -F .commit-msg-task3.tmp
```

`.commit-msg-task3.tmp` content:
```
feat(editor): Plan 3 Task 3 - EF tienda-guardar-layout LIVE

verify_jwt=true. POST /tienda-guardar-layout con:
- Zod validate body con PersonalizacionesSchema (Plan 1 schema)
- Ownership check via tiendas.user_id vs auth.uid
- Locking optimista via base_updated_at (409 stale_layout si conflict)
- Mode draft -> pages.home_draft (auto-save 30s en panel)
- Mode publish -> promueve draft a home + invalida KV best-effort
- Payload size cap 2MB
- CORS origin restringido a aimma.com.co

Verificado LIVE: deployed, smoke curl returns 401 sin auth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 4: Test E2E EF tienda-guardar-layout con JWT real

**Files:** ninguno (test manual con curl real).

**Dependencias:** Task 3 deployed.

- [ ] **Step 1: Obtener JWT de tienda aimma-test via login real**

Pre-requisito: Jorge tiene usuario admin con tienda aimma-test asociada.

```powershell
# Login con email/password aimma admin
$loginBody = @{
  email = 'jorge.admin@aimma.com.co'
  password = $env:AIMMA_ADMIN_PASS  # set localmente, no commitear
} | ConvertTo-Json

$r = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/auth/v1/token?grant_type=password' `
  -Method POST `
  -Headers @{
    'Content-Type'='application/json'
    'apikey'='sb_publishable_VKKJmeQ6SVszVdD422h3qQ_KkDPeLH1'
  } `
  -Body $loginBody

$jwt = ($r.Content | ConvertFrom-Json).access_token
"JWT length: " + $jwt.Length
```

Expected: JWT length > 200 chars.

- [ ] **Step 2: Query tienda_id de aimma-test**

Via Supabase MCP `execute_sql`:

```sql
SELECT id, slug, subdominio, user_id FROM tiendas WHERE slug = 'aimma-test';
```

Save the `id` as `$tienda_id`.

- [ ] **Step 3: POST con JWT real, mode=draft con personalizaciones mínima válida**

```powershell
$body = @{
  tienda_id = $tienda_id
  page_id = 'home'
  mode = 'draft'
  personalizaciones = @{
    schema_version = 2
    pages = @{
      home = @{
        version = 1
        updated_at = '2026-06-02T00:00:00.000Z'
        sections = @(
          @{
            id = 'sec_test01'
            tipo = 'hero'
            altura_filas = 5
            fondo = @{ tipo = 'transparente'; valor = '' }
            padding = 'md'
            elementos = @(
              @{
                id = 'el_titul1'
                tipo = 'texto'
                grid = @{ col_start = 1; col_end = 13; row_start = 1; row_end = 4 }
                estilo = @{
                  alineacion = 'left'
                  tamano = '3xl'
                  peso = 'bold'
                }
                props = @{ contenido = 'PLAN3-TASK4-TEST-MARKER' }
              }
            )
          }
        )
      }
    }
  }
  base_updated_at = $null
} | ConvertTo-Json -Depth 10

$r = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-guardar-layout' `
  -Method POST `
  -Headers @{
    'Authorization' = "Bearer $jwt"
    'Content-Type' = 'application/json'
  } `
  -Body $body
"STATUS: " + $r.StatusCode
$r.Content
```

Expected: STATUS 200, body `{"success":true,"mode":"draft","updated_at":"...","home":{...}}`.

- [ ] **Step 4: Verificar BD persistio el draft**

Via Supabase MCP `execute_sql`:

```sql
SELECT
  personalizaciones->'pages'->'home_draft'->>'updated_at' AS draft_updated_at,
  jsonb_array_length(personalizaciones->'pages'->'home_draft'->'sections') AS sections_count
FROM tiendas WHERE slug = 'aimma-test';
```

Expected: `draft_updated_at` reciente, `sections_count = 1`.

- [ ] **Step 5: POST mode=publish para promover draft → home**

Mismo body que step 3 pero cambiar `mode = 'publish'`.

```powershell
$body = $body -replace '"mode":"draft"', '"mode":"publish"'
$r = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-guardar-layout' `
  -Method POST `
  -Headers @{
    'Authorization' = "Bearer $jwt"
    'Content-Type' = 'application/json'
  } `
  -Body $body
"STATUS: " + $r.StatusCode
```

Expected: STATUS 200.

- [ ] **Step 6: Verificar home actualizado + draft eliminado + storefront LIVE refleja**

Via Supabase MCP `execute_sql`:

```sql
SELECT
  personalizaciones->'pages'->'home_draft' AS draft,
  personalizaciones->'pages'->'home'->>'updated_at' AS home_updated_at
FROM tiendas WHERE slug = 'aimma-test';
```

Expected: `draft` IS NULL, `home_updated_at` reciente.

```powershell
Start-Sleep 15  # KV TTL 60s pero invalidate fuerza fresh fetch
$s = Invoke-WebRequest 'https://aimma-test.tienda.aimma.com.co/' -UseBasicParsing
$s.Content | Select-String 'PLAN3-TASK4-TEST-MARKER'
```

Expected: marker encontrado en HTML LIVE.

- [ ] **Step 7: Limpiar estado test (restore aimma-test a su contenido original)**

Via Supabase MCP `execute_sql`:

```sql
-- Restore aimma-test home a fixture Plan 1/2 original
-- (esto vendra del fixture sql ya existente en docs/SUPERPOWERS/fixtures/)
-- O reset a NULL para que use fallback Fase 9
UPDATE tiendas SET personalizaciones = NULL WHERE slug = 'aimma-test';
```

Solo si Jorge confirma — restaurar a estado pre-test.

- [ ] **Step 8: No commit (test manual sin código nuevo). Solo log resultado en memoria si pass.**

---

## Task 5: EF tienda-form-submit (escribir + deploy + verificar)

**Files:**
- Create: `supabase/functions/tienda-form-submit/index.ts`

**Dependencias:** Task 1 (BD form_submissions + rate limit RPC).

- [ ] **Step 1: Crear EF tienda-form-submit/index.ts**

Contenido completo del archivo:

```typescript
// supabase/functions/tienda-form-submit/index.ts
// AIMMA Tienda IA · Editor PRO-MAX Plan 3
// Handler publico de submits del block Formulario en storefront.
// verify_jwt=false (cliente final no esta logueado en Supabase).
// CORS: solo subdominios *.tienda.aimma.com.co.
// Anti-spam: honeypot + rate limit 10/h por IP+tienda.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_FIELDS = 8;
const MAX_PAYLOAD_BYTES = 100_000;
const RATE_LIMIT_PER_HOUR = 10;

const ALLOWED_ORIGIN_RE = /^https:\/\/[a-z0-9-]{1,50}\.tienda\.aimma\.com\.co$/;

const BodySchema = z.object({
  tienda_slug: z.string().regex(/^[a-z0-9-]{3,50}$/),
  section_id: z.string().regex(/^sec_[a-z0-9]{4,}$/),
  fields: z.record(z.string(), z.string().max(10000)),
  honeypot: z.string().max(500),
});

function corsHeadersFor(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGIN_RE.test(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeadersFor(origin) },
  });
}

serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeadersFor(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  // 1) Validar Origin
  if (!origin || !ALLOWED_ORIGIN_RE.test(origin)) {
    return json({ error: 'origin_not_allowed' }, 403, origin);
  }

  // 2) Body size
  const raw = await req.text();
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return json({ error: 'payload_too_large' }, 413, origin);
  }

  // 3) Zod validate
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(JSON.parse(raw));
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.errors : String(e);
    return json({ error: 'invalid_body', detail }, 400, origin);
  }

  // 4) Honeypot — silent drop si tiene valor
  if (body.honeypot.trim() !== '') {
    // 200 success para que el bot crea que funciono
    return json({ success: true, message: 'Recibido' }, 200, origin);
  }

  // 5) Max fields
  if (Object.keys(body.fields).length > MAX_FIELDS) {
    return json({ error: 'too_many_fields' }, 400, origin);
  }

  // 6) IP rate limit
  const ip = req.headers.get('CF-Connecting-IP')
          || req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
          || 'unknown';
  const rateKey = 'form_submit:' + body.tienda_slug + ':' + ip;

  const supabaseSvc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: rateCount, error: rateErr } = await supabaseSvc.rpc(
    'check_rate_limit_form_submit',
    { p_key: rateKey, p_max: RATE_LIMIT_PER_HOUR, p_window_minutes: 60 }
  );
  if (rateErr) {
    console.error('rate_limit_error', rateErr);
    // No bloqueamos por error de rate limit, mejor permitir que mandar 500
  } else if (rateCount && rateCount > RATE_LIMIT_PER_HOUR) {
    return json({ error: 'rate_limited', retry_after: 3600 }, 429, origin);
  }

  // 7) Lookup tienda + verificar section_id es formulario
  const { data: tienda, error: tErr } = await supabaseSvc
    .from('tiendas')
    .select('id, slug, nombre_negocio, personalizaciones, notif_email')
    .eq('slug', body.tienda_slug)
    .single();
  if (tErr || !tienda) {
    return json({ error: 'tienda_not_found' }, 404, origin);
  }

  const home = (tienda.personalizaciones as any)?.pages?.home;
  const sectionDecl = home?.sections?.find((s: any) => s.id === body.section_id);
  if (!sectionDecl || sectionDecl.tipo !== 'formulario') {
    return json({ error: 'invalid_section' }, 400, origin);
  }

  // 8) Mapear field_N -> labels reales segun declaracion
  const formFields = sectionDecl.elementos
    .filter((el: any) => el.tipo === 'form_field')
    .map((el: any, idx: number) => ({
      idx,
      label: el.props.label as string,
      tipo: el.props.tipo_campo as string,
      requerido: !!el.props.requerido,
    }));

  const fieldsLabeled: Record<string, string> = {};
  for (const def of formFields) {
    const value = (body.fields['field_' + def.idx] || '').trim();
    if (def.requerido && !value) {
      return json({ error: 'missing_required_field', field: def.label }, 400, origin);
    }
    if (def.tipo === 'email' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      return json({ error: 'invalid_email', field: def.label }, 400, origin);
    }
    fieldsLabeled[def.label] = value;
  }

  // 9) Sanitizar anti-XSS basico
  const fieldsSafe: Record<string, string> = {};
  for (const [k, v] of Object.entries(fieldsLabeled)) {
    fieldsSafe[k] = v.replace(/[<>]/g, '');
  }

  // 10) Insert submission
  const { data: insertedSubmission, error: iErr } = await supabaseSvc
    .from('form_submissions')
    .insert({
      tienda_id: tienda.id,
      section_id: body.section_id,
      fields: fieldsSafe,
      ip,
      user_agent: req.headers.get('User-Agent')?.slice(0, 500) || null,
    })
    .select('id')
    .single();
  if (iErr) {
    console.error('insert_failed', iErr);
    return json({ error: 'insert_failed' }, 500, origin);
  }

  // 11) Cola notif email (stub Plan 3)
  if (tienda.notif_email) {
    const cuerpo = JSON.stringify(fieldsSafe, null, 2);
    await supabaseSvc.from('form_submission_notifications').insert({
      tienda_id: tienda.id,
      submission_id: insertedSubmission.id,
      destino: tienda.notif_email,
      asunto: 'Nuevo mensaje en ' + tienda.nombre_negocio,
      cuerpo,
    });
  }

  return json({
    success: true,
    message: 'Gracias! Recibimos tu mensaje. Te contactamos pronto.',
  }, 200, origin);
});
```

- [ ] **Step 2: Deploy EF via MCP Supabase**

Run via Supabase MCP tool `deploy_edge_function`:
- name: `tienda-form-submit`
- entrypoint_path: `index.ts`
- files: contenido step 1

**Importante:** debe configurarse con `verify_jwt: false` para que sea publico. En el dashboard de Supabase EF, ir a Settings > Function > tienda-form-submit y marcar "Enforce JWT Verification" como OFF. Si MCP no permite setearlo via API, dejar nota Tipo B para Jorge: "verify_jwt OFF en EF tienda-form-submit".

- [ ] **Step 3: Verificar EF deployed**

Run via Supabase MCP tool `list_edge_functions`:

Expected: `tienda-form-submit` en lista con status active.

- [ ] **Step 4: Test smoke origin invalid (403)**

```powershell
$r = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-form-submit' `
  -Method POST `
  -Headers @{
    'Content-Type' = 'application/json'
    'Origin' = 'https://evil.com'
  } `
  -Body '{"tienda_slug":"aimma-test","section_id":"sec_test01","fields":{},"honeypot":""}' `
  -SkipHttpErrorCheck
"STATUS: " + $r.StatusCode
$r.Content
```

Expected: STATUS 403 con `{"error":"origin_not_allowed"}`.

- [ ] **Step 5: Test smoke origin valid pero tienda no existe (404)**

```powershell
$r = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-form-submit' `
  -Method POST `
  -Headers @{
    'Content-Type' = 'application/json'
    'Origin' = 'https://aimma-test.tienda.aimma.com.co'
  } `
  -Body '{"tienda_slug":"tienda-que-no-existe","section_id":"sec_test01","fields":{},"honeypot":""}' `
  -SkipHttpErrorCheck
"STATUS: " + $r.StatusCode
$r.Content
```

Expected: STATUS 404 con `{"error":"tienda_not_found"}`.

- [ ] **Step 6: Commit**

```powershell
git add supabase/functions/tienda-form-submit/index.ts
git commit -F .commit-msg-task5.tmp
```

`.commit-msg-task5.tmp` content:
```
feat(editor): Plan 3 Task 5 - EF tienda-form-submit LIVE

verify_jwt=false (publico, cliente storefront no autenticado en Supabase).
CORS regex *.tienda.aimma.com.co. POST /tienda-form-submit con:
- Zod validate body (tienda_slug + section_id + fields + honeypot)
- Honeypot silent drop con 200 success (anti-bot)
- Rate limit 10/h IP+tienda via RPC check_rate_limit_form_submit
- Lookup tienda por slug + verificar section_id existe + es formulario
- Mapear field_N a labels reales por declaracion del Section
- Validar required + email format
- Sanitizar anti-XSS basico
- INSERT form_submissions + cola notif email si tienda.notif_email setado

Tipo B Jorge: verify_jwt OFF en EF settings dashboard.

Verificado LIVE: deployed, smoke origin invalid returns 403,
tienda no existe returns 404.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 6: Test E2E EF tienda-form-submit con fixture real

**Files:** ninguno (test con curl real + fixture BD).

**Dependencias:** Task 5 deployed.

- [ ] **Step 1: Insertar section formulario en aimma-test para test**

Via Supabase MCP `execute_sql`:

```sql
UPDATE tiendas SET personalizaciones = jsonb_build_object(
  'schema_version', 2,
  'pages', jsonb_build_object(
    'home', jsonb_build_object(
      'version', 1,
      'updated_at', now()::text,
      'sections', jsonb_build_array(
        jsonb_build_object(
          'id', 'sec_form01',
          'tipo', 'formulario',
          'altura_filas', 8,
          'fondo', jsonb_build_object('tipo', 'transparente', 'valor', ''),
          'padding', 'md',
          'elementos', jsonb_build_array(
            jsonb_build_object(
              'id', 'el_name01',
              'tipo', 'form_field',
              'grid', jsonb_build_object('col_start',1,'col_end',13,'row_start',1,'row_end',3),
              'estilo', jsonb_build_object('alineacion','left','tamano','md','peso','normal'),
              'props', jsonb_build_object(
                'tipo_campo', 'text',
                'label', 'Nombre',
                'requerido', true
              )
            ),
            jsonb_build_object(
              'id', 'el_email1',
              'tipo', 'form_field',
              'grid', jsonb_build_object('col_start',1,'col_end',13,'row_start',3,'row_end',5),
              'estilo', jsonb_build_object('alineacion','left','tamano','md','peso','normal'),
              'props', jsonb_build_object(
                'tipo_campo', 'email',
                'label', 'Email',
                'requerido', true
              )
            ),
            jsonb_build_object(
              'id', 'el_msg001',
              'tipo', 'form_field',
              'grid', jsonb_build_object('col_start',1,'col_end',13,'row_start',5,'row_end',8),
              'estilo', jsonb_build_object('alineacion','left','tamano','md','peso','normal'),
              'props', jsonb_build_object(
                'tipo_campo', 'textarea',
                'label', 'Mensaje',
                'requerido', false
              )
            )
          )
        )
      )
    )
  )
) WHERE slug = 'aimma-test';
```

Expected: 1 row updated.

- [ ] **Step 2: POST submit valido a EF**

```powershell
$body = @{
  tienda_slug = 'aimma-test'
  section_id = 'sec_form01'
  fields = @{
    field_0 = 'Camilo Test Plan3'
    field_1 = 'camilo@test.com'
    field_2 = 'Mensaje E2E Plan3 Task6'
  }
  honeypot = ''
} | ConvertTo-Json

$r = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-form-submit' `
  -Method POST `
  -Headers @{
    'Content-Type' = 'application/json'
    'Origin' = 'https://aimma-test.tienda.aimma.com.co'
  } `
  -Body $body
"STATUS: " + $r.StatusCode
$r.Content
```

Expected: STATUS 200 con `{"success":true,"message":"Gracias!..."}`.

- [ ] **Step 3: Verificar row insertada en form_submissions**

Via Supabase MCP `execute_sql`:

```sql
SELECT id, section_id, fields, created_at
FROM form_submissions
WHERE tienda_id = (SELECT id FROM tiendas WHERE slug = 'aimma-test')
ORDER BY created_at DESC LIMIT 1;
```

Expected: 1 row, `fields = {"Nombre":"Camilo Test Plan3","Email":"camilo@test.com","Mensaje":"Mensaje E2E Plan3 Task6"}`.

- [ ] **Step 4: Test honeypot silent drop**

```powershell
$body = @{
  tienda_slug = 'aimma-test'
  section_id = 'sec_form01'
  fields = @{
    field_0 = 'Bot Test'
    field_1 = 'bot@spam.com'
    field_2 = 'I am a bot'
  }
  honeypot = 'I AM A BOT'
} | ConvertTo-Json

$r = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-form-submit' `
  -Method POST `
  -Headers @{
    'Content-Type' = 'application/json'
    'Origin' = 'https://aimma-test.tienda.aimma.com.co'
  } `
  -Body $body
"STATUS: " + $r.StatusCode
$r.Content
```

Expected: STATUS 200 success (silent drop) PERO no debe insertar row.

Via Supabase MCP `execute_sql`:

```sql
SELECT count(*) FROM form_submissions
WHERE tienda_id = (SELECT id FROM tiendas WHERE slug = 'aimma-test')
  AND fields->>'Mensaje' = 'I am a bot';
```

Expected: count = 0.

- [ ] **Step 5: Test missing required field (400)**

```powershell
$body = @{
  tienda_slug = 'aimma-test'
  section_id = 'sec_form01'
  fields = @{
    field_0 = ''
    field_1 = 'a@b.c'
  }
  honeypot = ''
} | ConvertTo-Json

$r = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-form-submit' `
  -Method POST `
  -Headers @{
    'Content-Type' = 'application/json'
    'Origin' = 'https://aimma-test.tienda.aimma.com.co'
  } `
  -Body $body `
  -SkipHttpErrorCheck
"STATUS: " + $r.StatusCode
$r.Content
```

Expected: STATUS 400 con `{"error":"missing_required_field","field":"Nombre"}`.

- [ ] **Step 6: Test rate limit (loop 11 POSTs)**

```powershell
$body = @{
  tienda_slug = 'aimma-test'
  section_id = 'sec_form01'
  fields = @{ field_0='rate test'; field_1='rate@test.com'; field_2='loop' }
  honeypot = ''
} | ConvertTo-Json

for ($i = 1; $i -le 10; $i++) {
  $r = Invoke-WebRequest `
    -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-form-submit' `
    -Method POST `
    -Headers @{
      'Content-Type' = 'application/json'
      'Origin' = 'https://aimma-test.tienda.aimma.com.co'
    } `
    -Body $body `
    -SkipHttpErrorCheck
  Write-Host "Submit $i status: $($r.StatusCode)"
}

$r11 = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-form-submit' `
  -Method POST `
  -Headers @{
    'Content-Type' = 'application/json'
    'Origin' = 'https://aimma-test.tienda.aimma.com.co'
  } `
  -Body $body `
  -SkipHttpErrorCheck
"Submit 11 STATUS: " + $r11.StatusCode
$r11.Content
```

Expected: 10 submits con 200, el 11vo con 429 `{"error":"rate_limited","retry_after":3600}`.

- [ ] **Step 7: Cleanup test data**

Via Supabase MCP `execute_sql`:

```sql
DELETE FROM form_submissions
  WHERE tienda_id = (SELECT id FROM tiendas WHERE slug = 'aimma-test')
    AND fields->>'Mensaje' IN ('Mensaje E2E Plan3 Task6', 'loop');
DELETE FROM form_submit_rate_limit
  WHERE rate_key LIKE 'form_submit:aimma-test:%';
```

Expected: cleanup OK.

- [ ] **Step 8: No commit (test manual sin código nuevo).**

---

# FASE 3 — Storefront blocks Formulario MOD

## Task 7: Crear _FormSubmitHandler.astro (DRY script inline)

**Files:**
- Create: `apps/storefront/src/components/blocks/formulario/_FormSubmitHandler.astro`

**Dependencias:** Task 5 (EF deployed).

- [ ] **Step 1: Crear archivo _FormSubmitHandler.astro**

Contenido completo del archivo:

```astro
---
// _FormSubmitHandler.astro
// AIMMA Editor PRO-MAX Plan 3
// Script inline DRY que las 4 variants de Formulario importan.
// Captura submit de cualquier form con data-form-section-id,
// hace fetch a EF tienda-form-submit, muestra success/error inline.
---

<script is:inline>
(function() {
  'use strict';

  const EF_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-form-submit';

  function init() {
    const forms = document.querySelectorAll('form[data-form-section-id]');
    if (!forms.length) return;

    forms.forEach((form) => {
      if (form.dataset.handlerBound === '1') return;
      form.dataset.handlerBound = '1';
      form.addEventListener('submit', onSubmit);
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');
    const msgEl = form.querySelector('.form-message');

    if (msgEl) {
      msgEl.hidden = true;
      msgEl.className = 'form-message';
    }

    const fd = new FormData(form);
    const fields = {};
    let honeypot = '';
    for (const [k, v] of fd.entries()) {
      if (k === 'honeypot') { honeypot = String(v); continue; }
      fields[k] = String(v);
    }

    const body = {
      tienda_slug: form.dataset.tiendaSlug,
      section_id: form.dataset.formSectionId,
      fields: fields,
      honeypot: honeypot,
    };

    if (submitBtn) submitBtn.disabled = true;

    try {
      const r = await fetch(EF_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));

      if (r.ok && data.success) {
        form.reset();
        if (msgEl) {
          msgEl.textContent = data.message || 'Mensaje enviado correctamente.';
          msgEl.className = 'form-message form-message--success';
          msgEl.hidden = false;
        }
      } else {
        const errMsg = (data.error === 'rate_limited')
          ? 'Demasiados envios. Esperá un momento e intentá de nuevo.'
          : (data.error === 'missing_required_field')
            ? 'Falta completar: ' + (data.field || 'un campo requerido') + '.'
            : (data.error === 'invalid_email')
              ? 'El email no es valido.'
              : 'No pudimos enviar tu mensaje. Intentá de nuevo en unos minutos.';
        if (msgEl) {
          msgEl.textContent = errMsg;
          msgEl.className = 'form-message form-message--error';
          msgEl.hidden = false;
        }
      }
    } catch (err) {
      console.error('form_submit_network_error', err);
      if (msgEl) {
        msgEl.textContent = 'Error de conexion. Verificá tu internet.';
        msgEl.className = 'form-message form-message--error';
        msgEl.hidden = false;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>
```

- [ ] **Step 2: Verificar Astro syntax valid**

```powershell
cd apps/storefront
pnpm astro check --watch:false 2>&1 | Select-String -Pattern '(_FormSubmitHandler|error|Error)'
```

Expected: NO errors mencionando `_FormSubmitHandler`.

- [ ] **Step 3: Commit (parcial — sin uso aún)**

```powershell
cd ../..  # volver a root
git add apps/storefront/src/components/blocks/formulario/_FormSubmitHandler.astro
git commit -F .commit-msg-task7.tmp
```

`.commit-msg-task7.tmp` content:
```
feat(editor): Plan 3 Task 7 - _FormSubmitHandler.astro DRY script inline

Script unico que los 4 Formulario*.astro importaran (Task 8). Captura
submit, fetch a EF tienda-form-submit, maneja success/error con messages
en espanol natural. Honeypot extraido aparte. Boton disabled durante
request. Listener idempotente via dataset.handlerBound flag.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 8: MOD 4 Formulario*.astro (action 404 → fetch EF)

**Files:**
- Modify: `apps/storefront/src/components/blocks/formulario/FormularioIndustrialClean.astro`
- Modify: `apps/storefront/src/components/blocks/formulario/FormularioFashionBold.astro`
- Modify: `apps/storefront/src/components/blocks/formulario/FormularioMinimalArtesanal.astro`
- Modify: `apps/storefront/src/components/blocks/formulario/FormularioEditorialMagazine.astro`

**Dependencias:** Task 7 (_FormSubmitHandler creado).

- [ ] **Step 1: Read FormularioIndustrialClean.astro y identificar punto de MOD**

```powershell
Get-Content 'apps/storefront/src/components/blocks/formulario/FormularioIndustrialClean.astro' -TotalCount 80
```

Verificar: línea `<form ... method="POST" action="/internal/form-submit" data-form-id={section.id}>`.

- [ ] **Step 2: MOD FormularioIndustrialClean.astro — 4 cambios atómicos**

Cambios exactos en el archivo:

**Cambio 1 — eliminar comment placeholder Plan 1:**

Old:
```astro
// NOTA: el handler de submit es Plan 3 (necesita EF tienda-form-submit).
// Por ahora el form renderea pero submit hace POST a /internal/form-submit
// que devuelve 404 — eso es OK para Plan 1.
```

New:
```astro
// Plan 3: submit handler en _FormSubmitHandler.astro (importado abajo).
// Fetch a EF tienda-form-submit con honeypot + section_id + tienda_slug.
```

**Cambio 2 — agregar import Astro de tienda al frontmatter (si no existe):**

En el frontmatter `---` superior, después del `import type { Section, Element }`:

```astro
import _FormSubmitHandler from './_FormSubmitHandler.astro';

const tiendaSlug = Astro.locals.tienda?.slug || '';
```

**Cambio 3 — MOD el `<form>` tag:**

Old:
```astro
<form
  class="ic-form-inner"
  style="grid-column:1 / -1;"
  method="POST"
  action="/internal/form-submit"
  data-form-id={section.id}
>
```

New:
```astro
<form
  class="ic-form-inner"
  style="grid-column:1 / -1;"
  novalidate
  data-form-section-id={section.id}
  data-tienda-slug={tiendaSlug}
>
  {/* Honeypot anti-spam (hidden) */}
  <input
    type="text"
    name="honeypot"
    tabindex="-1"
    autocomplete="off"
    aria-hidden="true"
    style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0"
  />
```

**Cambio 4 — agregar `<p class="form-message" hidden>` después del botón submit dentro del form:**

Pegado justo antes del cierre del `</form>`:

```astro
  <p class="form-message" hidden role="status" aria-live="polite"></p>
</form>

<_FormSubmitHandler />
```

(El `<_FormSubmitHandler />` debe ir DESPUÉS del `</form>` cierre, fuera del form.)

**Cambio 5 — CSS scoped agregar estilos para .form-message:**

Dentro del `<style>` scoped al final del archivo, agregar:

```css
.form-message {
  margin-top: 1rem;
  padding: 0.875rem 1.125rem;
  border-radius: 0.375rem;
  font-size: 0.9375rem;
  font-weight: 500;
}
.form-message--success {
  background: rgba(16, 185, 129, 0.1);
  color: rgb(6, 95, 70);
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.form-message--error {
  background: rgba(239, 68, 68, 0.1);
  color: rgb(127, 29, 29);
  border: 1px solid rgba(239, 68, 68, 0.3);
}
```

- [ ] **Step 3: Repetir Step 2 para FormularioFashionBold.astro**

Mismos 5 cambios. Único delta: el prefix scoped class es `fb-` no `ic-`. El form tag tiene `class="fb-form-inner"`. Resto idéntico.

Ajuste color de form-message para coherencia con paleta Fashion Bold (border 0, uppercase tracking):

```css
.form-message {
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 0;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.form-message--success {
  background: var(--ta-color-success-bg, rgba(16, 185, 129, 0.08));
  color: var(--ta-color-success-fg, rgb(6, 95, 70));
}
.form-message--error {
  background: var(--ta-color-error-bg, rgba(239, 68, 68, 0.08));
  color: var(--ta-color-error-fg, rgb(127, 29, 29));
}
```

- [ ] **Step 4: Repetir Step 2 para FormularioMinimalArtesanal.astro**

Mismos 5 cambios. Prefix `ma-`. Class `ma-form-inner`. Estilo form-message con pill 999px coherente con plantilla:

```css
.form-message {
  margin-top: 1.25rem;
  padding: 0.875rem 1.5rem;
  border-radius: 999px;
  font-size: 0.9375rem;
  font-family: var(--ta-font-body, inherit);
  font-style: italic;
  text-align: center;
}
.form-message--success { background: rgba(16,185,129,0.08); color: rgb(6,95,70); }
.form-message--error   { background: rgba(239,68,68,0.08); color: rgb(127,29,29); }
```

- [ ] **Step 5: Repetir Step 2 para FormularioEditorialMagazine.astro**

Mismos 5 cambios. Prefix `em-`. Class `em-form-inner`. Estilo form-message con accent serif:

```css
.form-message {
  margin-top: 1rem;
  padding: 0.875rem 1.25rem;
  border-radius: 0;
  font-size: 0.9375rem;
  font-family: var(--ta-font-display, inherit);
  font-weight: 300;
  border-left: 2px solid currentColor;
}
.form-message--success { color: rgb(6,95,70); background: rgba(16,185,129,0.05); }
.form-message--error   { color: rgb(127,29,29); background: rgba(239,68,68,0.05); }
```

- [ ] **Step 6: Verificar `Astro.locals.tienda` está tipado en env.d.ts**

```powershell
Get-Content 'apps/storefront/src/env.d.ts' -Raw | Select-String -Pattern 'tienda'
```

Expected output: debe existir `tienda` en el interface `Locals`. Si no, agregar:

```typescript
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    tienda: {
      id: string;
      slug: string;
      nombre_negocio: string;
      // ...resto de campos
    } | null;
  }
}
```

Si necesita MOD, aplicar.

- [ ] **Step 7: Astro check sin errores**

```powershell
cd apps/storefront
pnpm astro check --watch:false 2>&1 | Select-String -Pattern 'error' -CaseSensitive:$false
cd ../..
```

Expected: 0 errors.

- [ ] **Step 8: Local dev server smoke test**

```powershell
cd apps/storefront
$dev = Start-Process pnpm -ArgumentList 'astro','dev' -PassThru -NoNewWindow -RedirectStandardOutput astro-dev.log
Start-Sleep 8
# Test que el HTML del formulario carga sin errores
$r = Invoke-WebRequest 'http://localhost:4321/' -UseBasicParsing -ErrorAction SilentlyContinue
$r.Content | Select-String 'data-form-section-id'
Stop-Process -Id $dev.Id -Force
Remove-Item astro-dev.log -ErrorAction SilentlyContinue
cd ../..
```

Expected: HTML contiene `data-form-section-id` attribute (significa el form renderea con MOD aplicado).

NOTA: este step requiere fixture aimma-test home con section formulario (Task 6 Step 1 dejó eso). Si fue limpiado, re-poblar.

- [ ] **Step 9: Commit**

```powershell
git add apps/storefront/src/components/blocks/formulario/*.astro
git add apps/storefront/src/env.d.ts  # solo si modificado
git commit -F .commit-msg-task8.tmp
```

`.commit-msg-task8.tmp` content:
```
feat(editor): Plan 3 Task 8 - MOD 4 Formulario*.astro fetch EF + honeypot

Reemplaza action=/internal/form-submit (404) por dataset data-form-section-id
+ data-tienda-slug + honeypot oculto + p.form-message para feedback inline.
Importa _FormSubmitHandler.astro (Task 7) en cada uno - DRY single source.

CSS por plantilla con tokens coherentes:
- IC: border-radius 0.375rem (clean)
- FB: border 0 + uppercase tracked (bold)
- MA: pill 999px + italic Fraunces (artesanal)
- EM: border-left 2px accent + Fraunces 300 (editorial)

Astro.locals.tienda tipado en env.d.ts (si no estaba).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 9: Deploy storefront + E2E submit desde browser real

**Files:** ninguno.

**Dependencias:** Task 7 + 8 commited a main.

- [ ] **Step 1: Push commits a origin/main**

```powershell
git push origin main
git log --oneline -5
```

Expected: HEAD remoto sincronizado.

- [ ] **Step 2: Build local storefront para validar producción**

```powershell
cd apps/storefront
pnpm build 2>&1 | Select-String -Pattern 'error|complete' -Context 0,2
cd ../..
```

Expected: build complete sin errors.

- [ ] **Step 3: Deploy Cloudflare Worker storefront**

```powershell
cd apps/storefront
pnpm wrangler deploy 2>&1 | Select-String -Pattern 'Deployed|error'
cd ../..
```

Expected: "Deployed aimma-storefront..." con URL.

NOTA: si wrangler requiere auth, Tipo B Jorge ejecuta. Step se marca pending.

- [ ] **Step 4: Test E2E submit real desde aimma-test storefront**

```powershell
# 1) Verificar storefront LIVE renderea form
$r = Invoke-WebRequest 'https://aimma-test.tienda.aimma.com.co/' -UseBasicParsing
$r.Content | Select-String 'data-form-section-id="sec_form01"'
# Expected: line matched

# 2) Test submit via POST manual con Origin
$body = @{
  tienda_slug = 'aimma-test'
  section_id = 'sec_form01'
  fields = @{
    field_0 = 'E2E Task 9 Live'
    field_1 = 'task9@plan3.com'
    field_2 = 'Mensaje desde browser real Plan 3 Task 9'
  }
  honeypot = ''
} | ConvertTo-Json

$ef = Invoke-WebRequest `
  -Uri 'https://rsmxklkxqsaptchcjszd.supabase.co/functions/v1/tienda-form-submit' `
  -Method POST `
  -Headers @{
    'Content-Type' = 'application/json'
    'Origin' = 'https://aimma-test.tienda.aimma.com.co'
  } `
  -Body $body
"EF STATUS: " + $ef.StatusCode
```

Expected: EF STATUS 200.

- [ ] **Step 5: Verificar BD insert**

Via Supabase MCP `execute_sql`:

```sql
SELECT id, fields, created_at FROM form_submissions
WHERE fields->>'Mensaje' = 'Mensaje desde browser real Plan 3 Task 9'
ORDER BY created_at DESC LIMIT 1;
```

Expected: 1 row.

- [ ] **Step 6: Cleanup**

Via Supabase MCP `execute_sql`:

```sql
DELETE FROM form_submissions WHERE fields->>'Mensaje' LIKE 'Mensaje desde browser real Plan 3%';
DELETE FROM form_submit_rate_limit WHERE rate_key LIKE 'form_submit:aimma-test:%';
```

- [ ] **Step 7: No commit (sin código nuevo).**

---

# FASE 4 — Editor UI vanilla JS (10 archivos)

## Task 10: Vendor SortableJS + GridStack libs

**Files:**
- Create: `iapanel/tienda/admin/views/editor/lib/sortable.min.js`
- Create: `iapanel/tienda/admin/views/editor/lib/gridstack.min.js`
- Create: `iapanel/tienda/admin/views/editor/lib/gridstack.min.css`

**Dependencias:** Task 1 (BD) — todas las tasks UI editor las necesitan.

- [ ] **Step 1: Crear carpeta lib**

```powershell
New-Item -ItemType Directory -Path 'iapanel/tienda/admin/views/editor/lib' -Force
```

- [ ] **Step 2: Descargar SortableJS 1.15.6 minified**

```powershell
$url = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js'
Invoke-WebRequest $url -OutFile 'iapanel/tienda/admin/views/editor/lib/sortable.min.js' -UseBasicParsing
(Get-Item 'iapanel/tienda/admin/views/editor/lib/sortable.min.js').Length
```

Expected: file size 40-45 KB (13KB gzip).

- [ ] **Step 3: Descargar GridStack 11.5.0 minified JS + CSS**

```powershell
$urlJS = 'https://cdn.jsdelivr.net/npm/gridstack@11.5.0/dist/gridstack-all.js'
Invoke-WebRequest $urlJS -OutFile 'iapanel/tienda/admin/views/editor/lib/gridstack.min.js' -UseBasicParsing

$urlCSS = 'https://cdn.jsdelivr.net/npm/gridstack@11.5.0/dist/gridstack.min.css'
Invoke-WebRequest $urlCSS -OutFile 'iapanel/tienda/admin/views/editor/lib/gridstack.min.css' -UseBasicParsing

(Get-Item 'iapanel/tienda/admin/views/editor/lib/gridstack.min.js').Length
(Get-Item 'iapanel/tienda/admin/views/editor/lib/gridstack.min.css').Length
```

Expected: JS 90-100 KB (35KB gzip), CSS 20-25 KB.

- [ ] **Step 4: Verificar contenido (no HTML error pages)**

```powershell
Get-Content 'iapanel/tienda/admin/views/editor/lib/sortable.min.js' -TotalCount 1 |
  Select-String -Pattern '(SortableJS|Sortable\.|function\(e,t\))'
Get-Content 'iapanel/tienda/admin/views/editor/lib/gridstack.min.js' -TotalCount 1 |
  Select-String -Pattern '(GridStack|gridstack)'
```

Expected: matches en ambos.

- [ ] **Step 5: Commit libs vendored**

```powershell
git add iapanel/tienda/admin/views/editor/lib/
git commit -F .commit-msg-task10.tmp
```

`.commit-msg-task10.tmp` content:
```
feat(editor): Plan 3 Task 10 - vendor SortableJS 1.15.6 + GridStack 11.5.0

Libs vendored en iapanel/tienda/admin/views/editor/lib/:
- sortable.min.js (13KB gzip) - reorder vertical de sections
- gridstack.min.js (35KB gzip) - drag/resize elements en grid 24-col
- gridstack.min.css - grid lines + handles styling

Coherente con patron panel admin vanilla JS sin bundler.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 11: editor-state.js (singleton state + snapshots)

**Files:**
- Create: `iapanel/tienda/admin/views/editor/editor-state.js`

**Dependencias:** Task 10 (libs vendored).

- [ ] **Step 1: Crear editor-state.js**

Contenido completo (450 líneas aprox):

```javascript
/* AIMMA Tienda IA · Editor PRO-MAX Plan 3 · editor-state.js v1
 * Singleton state. Maneja: sections + theme + selection + dirty + snapshots.
 * Observer pattern para listeners de cambios.
 */

(function(window) {
  'use strict';

  const MAX_SNAPSHOTS = 20;
  const DEBOUNCE_TYPING_MS = 1000;

  const state = {
    tienda_id: null,
    sections: [],
    theme: {},
    selection: null,        // { tipo: 'section'|'element', id }
    dirty: false,
    saving: false,
    lastDraftSavedAt: null,
    lastPublishedAt: null,
    base_updated_at: null,
    snapshots: [],
    snapshotIdx: -1,
    _listeners: { sections: [], selection: [], dirty: [], saving: [] },
    _typingTimers: {},
  };

  // ============================================================
  // NanoID minimo (4 chars)
  // ============================================================
  function nanoid4() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  }

  // ============================================================
  // Observer pattern
  // ============================================================
  function subscribe(channel, fn) {
    if (!state._listeners[channel]) return () => {};
    state._listeners[channel].push(fn);
    return () => {
      state._listeners[channel] = state._listeners[channel].filter(f => f !== fn);
    };
  }

  function notify(channel) {
    (state._listeners[channel] || []).forEach(fn => {
      try { fn(state[channel === 'sections' ? 'sections' :
                       channel === 'selection' ? 'selection' :
                       channel === 'dirty' ? 'dirty' :
                       channel === 'saving' ? 'saving' : null]); }
      catch (err) { console.error('editor-state listener error', err); }
    });
  }

  // ============================================================
  // Init
  // ============================================================
  function init(personalizaciones, tienda_id) {
    state.tienda_id = tienda_id;
    const pers = personalizaciones || {};
    const home = pers.pages?.home || pers.pages?.home_draft || null;
    state.sections = home?.sections ? structuredClone(home.sections) : [];
    state.theme = pers.theme ? structuredClone(pers.theme) : {};
    state.base_updated_at = home?.updated_at || null;
    state.selection = null;
    state.dirty = false;
    state.snapshots = [];
    state.snapshotIdx = -1;
    pushSnapshot(); // baseline
    notify('sections');
    notify('selection');
    notify('dirty');
  }

  // ============================================================
  // Section factories
  // ============================================================
  function createSectionDefault(tipo) {
    const id = 'sec_' + nanoid4();
    const base = {
      id,
      tipo,
      altura_filas: 5,
      fondo: { tipo: 'transparente', valor: '' },
      padding: 'md',
      elementos: [],
    };

    switch (tipo) {
      case 'hero':
        base.altura_filas = 10;
        base.padding = 'lg';
        base.elementos = [
          {
            id: 'el_' + nanoid4(),
            tipo: 'texto',
            grid: { col_start: 1, col_end: 17, row_start: 3, row_end: 6 },
            estilo: { alineacion: 'left', tamaño: '3xl', peso: 'bold' },
            props: { contenido: '[Tu título aquí]' },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'boton',
            grid: { col_start: 1, col_end: 7, row_start: 8, row_end: 10 },
            estilo: { alineacion: 'left', tamaño: 'lg', peso: 'semibold' },
            props: {
              texto: 'Ver productos', url: '#productos',
              estilo_visual: 'primary', target: '_self'
            },
          },
        ];
        break;

      case 'texto':
        base.altura_filas = 5;
        base.elementos = [{
          id: 'el_' + nanoid4(),
          tipo: 'texto',
          grid: { col_start: 4, col_end: 22, row_start: 2, row_end: 5 },
          estilo: { alineacion: 'left', tamaño: 'md', peso: 'normal' },
          props: { contenido: '[Escribí tu texto aquí]' },
        }];
        break;

      case 'imagen':
        base.altura_filas = 7;
        base.elementos = [{
          id: 'el_' + nanoid4(),
          tipo: 'imagen',
          grid: { col_start: 1, col_end: 25, row_start: 1, row_end: 7 },
          estilo: { alineacion: 'center', tamaño: 'md', peso: 'normal' },
          props: {
            src: 'https://placehold.co/1200x600',
            alt: 'Imagen banner',
            objeto: 'cover',
          },
        }];
        break;

      case 'botones':
        base.altura_filas = 3;
        base.elementos = [
          {
            id: 'el_' + nanoid4(),
            tipo: 'boton',
            grid: { col_start: 7, col_end: 13, row_start: 1, row_end: 3 },
            estilo: { alineacion: 'center', tamaño: 'md', peso: 'semibold' },
            props: {
              texto: 'WhatsApp', url: 'https://wa.me/57XXXXXXXXXX',
              estilo_visual: 'primary', target: '_blank', icono: 'whatsapp'
            },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'boton',
            grid: { col_start: 13, col_end: 19, row_start: 1, row_end: 3 },
            estilo: { alineacion: 'center', tamaño: 'md', peso: 'semibold' },
            props: {
              texto: 'Ubicación', url: 'https://maps.google.com',
              estilo_visual: 'secondary', target: '_blank', icono: 'location'
            },
          },
        ];
        break;

      case 'productos':
        base.altura_filas = 10;
        base.elementos = [{
          id: 'el_' + nanoid4(),
          tipo: 'productos',
          grid: { col_start: 1, col_end: 25, row_start: 1, row_end: 10 },
          estilo: { alineacion: 'center', tamaño: 'md', peso: 'normal' },
          props: {
            categoria_id: null, limite: 8, orden: 'recientes',
            columnas: 'auto', mostrar_precio: true,
          },
        }];
        break;

      case 'galeria':
        base.altura_filas = 8;
        base.elementos = [{
          id: 'el_' + nanoid4(),
          tipo: 'galeria',
          grid: { col_start: 1, col_end: 25, row_start: 1, row_end: 8 },
          estilo: { alineacion: 'center', tamaño: 'md', peso: 'normal' },
          props: {
            imagenes: [
              { src: 'https://placehold.co/800x800/eee/666?text=1', alt: 'Imagen 1' },
              { src: 'https://placehold.co/800x800/eee/666?text=2', alt: 'Imagen 2' },
              { src: 'https://placehold.co/800x800/eee/666?text=3', alt: 'Imagen 3' },
            ],
            layout: 'grid', gap: 'normal',
          },
        }];
        break;

      case 'espaciador':
        base.altura_filas = 2;
        base.elementos = [];
        break;

      case 'formulario':
        base.altura_filas = 8;
        base.elementos = [
          {
            id: 'el_' + nanoid4(),
            tipo: 'texto',
            grid: { col_start: 1, col_end: 25, row_start: 1, row_end: 2 },
            estilo: { alineacion: 'center', tamaño: 'xl', peso: 'semibold' },
            props: { contenido: 'Escribinos' },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'form_field',
            grid: { col_start: 7, col_end: 19, row_start: 2, row_end: 3 },
            estilo: { alineacion: 'left', tamaño: 'md', peso: 'normal' },
            props: { tipo_campo: 'text', label: 'Nombre', requerido: true },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'form_field',
            grid: { col_start: 7, col_end: 19, row_start: 3, row_end: 4 },
            estilo: { alineacion: 'left', tamaño: 'md', peso: 'normal' },
            props: { tipo_campo: 'email', label: 'Email', requerido: true },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'form_field',
            grid: { col_start: 7, col_end: 19, row_start: 4, row_end: 7 },
            estilo: { alineacion: 'left', tamaño: 'md', peso: 'normal' },
            props: { tipo_campo: 'textarea', label: 'Mensaje', requerido: false },
          },
          {
            id: 'el_' + nanoid4(),
            tipo: 'boton',
            grid: { col_start: 9, col_end: 17, row_start: 7, row_end: 8 },
            estilo: { alineacion: 'center', tamaño: 'md', peso: 'semibold' },
            props: { texto: 'Enviar', url: '#submit', estilo_visual: 'primary', target: '_self' },
          },
        ];
        break;
    }
    return base;
  }

  function createElementDefault(tipo, gridDefault) {
    const id = 'el_' + nanoid4();
    const grid = gridDefault || { col_start: 1, col_end: 13, row_start: 1, row_end: 4 };
    const baseEstilo = { alineacion: 'left', tamaño: 'md', peso: 'normal' };

    const map = {
      texto: { props: { contenido: 'Nuevo texto' } },
      imagen: { props: { src: 'https://placehold.co/800x600', alt: '', objeto: 'cover' } },
      boton: { props: { texto: 'Botón', url: '#', estilo_visual: 'primary', target: '_self' } },
      productos: { props: { categoria_id: null, limite: 8, orden: 'recientes', columnas: 'auto', mostrar_precio: true } },
      galeria: { props: { imagenes: [{ src: 'https://placehold.co/600x600', alt: '' }], layout: 'grid', gap: 'normal' } },
      form_field: { props: { tipo_campo: 'text', label: 'Campo', requerido: false } },
      embed: { props: { html: '', aspect_ratio: '16/9' } },
      divisor: { props: { estilo: 'linea' } },
    };

    return { id, tipo, grid, estilo: baseEstilo, ...(map[tipo] || {}) };
  }

  // ============================================================
  // Section operations
  // ============================================================
  function insertSection(tipo, atIndex) {
    const section = createSectionDefault(tipo);
    if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= state.sections.length) {
      state.sections.splice(atIndex, 0, section);
    } else {
      state.sections.push(section);
    }
    pushSnapshot();
    markDirty();
    notify('sections');
    return section.id;
  }

  function removeSection(sectionId) {
    state.sections = state.sections.filter(s => s.id !== sectionId);
    if (state.selection?.id === sectionId) state.selection = null;
    pushSnapshot();
    markDirty();
    notify('sections');
    notify('selection');
  }

  function reorderSections(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const [moved] = state.sections.splice(fromIdx, 1);
    state.sections.splice(toIdx, 0, moved);
    pushSnapshot();
    markDirty();
    notify('sections');
  }

  function duplicateSection(sectionId) {
    const idx = state.sections.findIndex(s => s.id === sectionId);
    if (idx < 0) return;
    const copy = structuredClone(state.sections[idx]);
    copy.id = 'sec_' + nanoid4();
    copy.elementos = copy.elementos.map(el => ({ ...el, id: 'el_' + nanoid4() }));
    state.sections.splice(idx + 1, 0, copy);
    pushSnapshot();
    markDirty();
    notify('sections');
    return copy.id;
  }

  function updateSectionProp(sectionId, key, value) {
    const sec = state.sections.find(s => s.id === sectionId);
    if (!sec) return;
    sec[key] = value;
    debouncedSnapshot(sectionId + ':' + key);
    markDirty();
    notify('sections');
  }

  // ============================================================
  // Element operations
  // ============================================================
  function insertElement(sectionId, tipo, gridDefault) {
    const sec = state.sections.find(s => s.id === sectionId);
    if (!sec) return null;
    const el = createElementDefault(tipo, gridDefault);
    sec.elementos.push(el);
    pushSnapshot();
    markDirty();
    notify('sections');
    return el.id;
  }

  function removeElement(elementId) {
    let removed = false;
    state.sections.forEach(sec => {
      const before = sec.elementos.length;
      sec.elementos = sec.elementos.filter(e => e.id !== elementId);
      if (sec.elementos.length !== before) removed = true;
    });
    if (state.selection?.id === elementId) state.selection = null;
    if (removed) {
      pushSnapshot();
      markDirty();
      notify('sections');
      notify('selection');
    }
  }

  function updateElementGrid(sectionId, elementId, grid) {
    const sec = state.sections.find(s => s.id === sectionId);
    if (!sec) return;
    const el = sec.elementos.find(e => e.id === elementId);
    if (!el) return;
    el.grid = { ...el.grid, ...grid };
    pushSnapshot();
    markDirty();
    notify('sections');
  }

  function updateElementProp(elementId, key, value) {
    const el = findElement(elementId);
    if (!el) return;
    el.props[key] = value;
    debouncedSnapshot(elementId + ':props:' + key);
    markDirty();
    notify('sections');
  }

  function updateElementStyle(elementId, key, value) {
    const el = findElement(elementId);
    if (!el) return;
    el.estilo[key] = value;
    debouncedSnapshot(elementId + ':estilo:' + key);
    markDirty();
    notify('sections');
  }

  function findElement(elementId) {
    for (const sec of state.sections) {
      const el = sec.elementos.find(e => e.id === elementId);
      if (el) return el;
    }
    return null;
  }

  function findSection(sectionId) {
    return state.sections.find(s => s.id === sectionId) || null;
  }

  // ============================================================
  // Selection
  // ============================================================
  function select(tipo, id) {
    state.selection = { tipo, id };
    notify('selection');
  }

  function deselect() {
    state.selection = null;
    notify('selection');
  }

  // ============================================================
  // Snapshots (undo/redo)
  // ============================================================
  function pushSnapshot() {
    state.snapshots = state.snapshots.slice(0, state.snapshotIdx + 1);
    const snap = {
      sections: structuredClone(state.sections),
      theme: structuredClone(state.theme),
    };
    state.snapshots.push(snap);
    state.snapshotIdx = state.snapshots.length - 1;
    if (state.snapshots.length > MAX_SNAPSHOTS) {
      state.snapshots.shift();
      state.snapshotIdx--;
    }
  }

  function debouncedSnapshot(key) {
    clearTimeout(state._typingTimers[key]);
    state._typingTimers[key] = setTimeout(() => {
      pushSnapshot();
      delete state._typingTimers[key];
    }, DEBOUNCE_TYPING_MS);
  }

  function undo() {
    if (state.snapshotIdx <= 0) return false;
    state.snapshotIdx--;
    restoreFromSnapshot();
    return true;
  }

  function redo() {
    if (state.snapshotIdx >= state.snapshots.length - 1) return false;
    state.snapshotIdx++;
    restoreFromSnapshot();
    return true;
  }

  function restoreFromSnapshot() {
    const snap = state.snapshots[state.snapshotIdx];
    state.sections = structuredClone(snap.sections);
    state.theme = structuredClone(snap.theme);
    state.selection = null;
    state.dirty = true;
    notify('sections');
    notify('selection');
    notify('dirty');
  }

  function canUndo() { return state.snapshotIdx > 0; }
  function canRedo() { return state.snapshotIdx < state.snapshots.length - 1; }

  // ============================================================
  // Dirty + serialize
  // ============================================================
  function markDirty() {
    if (!state.dirty) {
      state.dirty = true;
      notify('dirty');
    }
  }

  function markClean(updated_at) {
    state.dirty = false;
    state.base_updated_at = updated_at;
    state.lastPublishedAt = new Date();
    notify('dirty');
  }

  function markSaving(saving) {
    state.saving = saving;
    notify('saving');
  }

  function serialize() {
    return {
      schema_version: 2,
      theme: state.theme,
      pages: {
        home: {
          version: 1,
          updated_at: new Date().toISOString(),
          sections: structuredClone(state.sections),
        },
      },
    };
  }

  // ============================================================
  // Export public API
  // ============================================================
  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorState = {
    init, subscribe,
    get sections() { return state.sections; },
    get theme() { return state.theme; },
    get selection() { return state.selection; },
    get dirty() { return state.dirty; },
    get saving() { return state.saving; },
    get tienda_id() { return state.tienda_id; },
    get base_updated_at() { return state.base_updated_at; },
    get lastDraftSavedAt() { return state.lastDraftSavedAt; },
    setLastDraftSavedAt(d) { state.lastDraftSavedAt = d; },
    findSection, findElement,
    insertSection, removeSection, reorderSections, duplicateSection, updateSectionProp,
    insertElement, removeElement, updateElementGrid, updateElementProp, updateElementStyle,
    select, deselect,
    undo, redo, canUndo, canRedo, pushSnapshot,
    markDirty, markClean, markSaving,
    serialize,
  };
})(window);
```

- [ ] **Step 2: Syntax check (smoke en Node)**

```powershell
node -c iapanel/tienda/admin/views/editor/editor-state.js
```

Expected: no syntax errors.

- [ ] **Step 3: Commit**

```powershell
git add iapanel/tienda/admin/views/editor/editor-state.js
git commit -F .commit-msg-task11.tmp
```

`.commit-msg-task11.tmp` content:
```
feat(editor): Plan 3 Task 11 - editor-state.js singleton + snapshots

Singleton state vanilla JS (no React/Vue) coherente con resto del panel:
- sections + theme + selection + dirty + saving + base_updated_at
- Observer pattern subscribe/notify por canal
- Section + Element factories con defaults exhaustivos por tipo (8 tipos)
- Insert/Remove/Reorder/Duplicate operations
- Undo/Redo 20 snapshots structuredClone + debounce 1000ms typing
- Serialize a PersonalizacionesSchema completo para EF
- Granularidad snapshots: edicion atomica vs typing debounced

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Task 12: editor-controls.js (6 helpers reusables)

**Files:**
- Create: `iapanel/tienda/admin/views/editor/editor-controls.js`

**Dependencias:** Task 11.

- [ ] **Step 1: Crear editor-controls.js**

Contenido completo (350 líneas):

```javascript
/* AIMMA Tienda IA · Editor PRO-MAX Plan 3 · editor-controls.js v1
 * Helpers reusables para inspector forms.
 * Cada helper devuelve un HTMLElement listo para insertar.
 * Debounce 200ms interno para no spammear state updates.
 */

(function(window) {
  'use strict';

  const DEBOUNCE_MS = 200;
  const URL_REGEX = /^(https:\/\/|mailto:|tel:|wa\.me\/|#|\/).+/i;
  const COLOR_HEX_REGEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

  function debounce(fn, ms) {
    let t;
    return function(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function el(tag, props, children) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') e.className = v;
        else if (k === 'style') e.setAttribute('style', v);
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) e.setAttribute(k, '');
        else if (v === false || v == null) { /* skip */ }
        else e.setAttribute(k, String(v));
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }

  function fieldWrapper(label, control, errorEl) {
    return el('div', { class: 'ed-ctrl' }, [
      el('label', { class: 'ed-ctrl__label' }, label),
      control,
      errorEl,
    ]);
  }

  // ============================================================
  // textInput
  // ============================================================
  function textInput(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const input = el('input', {
      type: opts.type || 'text',
      class: 'ed-ctrl__input',
      value: value || '',
      maxlength: opts.maxLength,
      placeholder: opts.placeholder || '',
    });

    const fire = debounce(v => {
      onChange(v);
      errorEl.hidden = true;
    }, DEBOUNCE_MS);

    input.addEventListener('input', e => fire(e.target.value));
    return fieldWrapper(label, input, errorEl);
  }

  // ============================================================
  // textarea
  // ============================================================
  function textarea(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const ta = el('textarea', {
      class: 'ed-ctrl__textarea',
      rows: opts.rows || 4,
      maxlength: opts.maxLength,
      placeholder: opts.placeholder || '',
    });
    ta.value = value || '';

    const fire = debounce(v => { onChange(v); }, DEBOUNCE_MS);
    ta.addEventListener('input', e => fire(e.target.value));
    return fieldWrapper(label, ta, errorEl);
  }

  // ============================================================
  // urlInput
  // ============================================================
  function urlInput(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const input = el('input', {
      type: 'text',
      class: 'ed-ctrl__input',
      value: value || '',
      placeholder: opts.placeholder || 'https://...',
    });

    const fire = debounce(v => {
      if (v && !URL_REGEX.test(v)) {
        errorEl.textContent = 'URL no válida (https / mailto / tel / wa.me / # / / )';
        errorEl.hidden = false;
      } else {
        errorEl.hidden = true;
      }
      onChange(v);
    }, DEBOUNCE_MS);

    input.addEventListener('input', e => fire(e.target.value));
    return fieldWrapper(label, input, errorEl);
  }

  // ============================================================
  // select
  // ============================================================
  function selectCtrl(label, value, options, onChange) {
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const sel = el('select', { class: 'ed-ctrl__select' });
    options.forEach(opt => {
      const o = el('option', { value: String(opt.v) }, opt.l);
      if (String(opt.v) === String(value)) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', e => {
      const v = e.target.value;
      // Cast number si la option original era numero
      const opt = options.find(o => String(o.v) === v);
      onChange(opt && typeof opt.v === 'number' ? Number(v) : v);
    });
    return fieldWrapper(label, sel, errorEl);
  }

  // ============================================================
  // colorPicker
  // ============================================================
  function colorPicker(label, value, onChange, opts) {
    opts = opts || {};
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const wrap = el('div', { class: 'ed-ctrl__color-wrap' });
    const pick = el('input', {
      type: 'color',
      class: 'ed-ctrl__color',
      value: (value && COLOR_HEX_REGEX.test(value)) ? value.slice(0, 7) : '#000000',
    });
    const hex = el('input', {
      type: 'text',
      class: 'ed-ctrl__input ed-ctrl__color-hex',
      value: value || '',
      placeholder: '#RRGGBB',
      maxlength: 9,
    });

    const fire = debounce(v => {
      if (v && !COLOR_HEX_REGEX.test(v)) {
        errorEl.textContent = 'Color hex inválido (#RRGGBB)';
        errorEl.hidden = false;
      } else {
        errorEl.hidden = true;
        if (v) pick.value = v.slice(0, 7);
      }
      onChange(v);
    }, DEBOUNCE_MS);

    pick.addEventListener('input', e => {
      hex.value = e.target.value;
      fire(e.target.value);
    });
    hex.addEventListener('input', e => fire(e.target.value));

    wrap.appendChild(pick);
    wrap.appendChild(hex);
    return fieldWrapper(label, wrap, errorEl);
  }

  // ============================================================
  // slider
  // ============================================================
  function slider(label, value, min, max, step, onChange) {
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const wrap = el('div', { class: 'ed-ctrl__slider-wrap' });
    const range = el('input', {
      type: 'range',
      class: 'ed-ctrl__range',
      min, max, step,
      value: value,
    });
    const num = el('span', { class: 'ed-ctrl__slider-num' }, String(value));

    const fire = debounce(v => { onChange(Number(v)); }, DEBOUNCE_MS);
    range.addEventListener('input', e => {
      num.textContent = e.target.value;
      fire(e.target.value);
    });

    wrap.appendChild(range);
    wrap.appendChild(num);
    return fieldWrapper(label, wrap, errorEl);
  }

  // ============================================================
  // switch (toggle bool)
  // ============================================================
  function switchCtrl(label, value, onChange) {
    const errorEl = el('p', { class: 'ed-ctrl__error', hidden: true });
    const wrap = el('label', { class: 'ed-ctrl__switch' });
    const input = el('input', { type: 'checkbox' });
    if (value) input.checked = true;
    const slider = el('span', { class: 'ed-ctrl__switch-slider' });
    wrap.appendChild(input);
    wrap.appendChild(slider);
    input.addEventListener('change', e => onChange(e.target.checked));
    return el('div', { class: 'ed-ctrl ed-ctrl--switch' }, [
      el('label', { class: 'ed-ctrl__label' }, label),
      wrap,
      errorEl,
    ]);
  }

  // ============================================================
  // Helpers UI extra: header label, danger button, collapsible
  // ============================================================
  function headerLabel(text) {
    return el('h4', { class: 'ed-inspector__header' }, text);
  }

  function primaryButton(text, onClick) {
    return el('button', {
      type: 'button',
      class: 'ed-btn ed-btn--primary',
      onClick,
    }, text);
  }

  function dangerButton(text, onClick) {
    return el('button', {
      type: 'button',
      class: 'ed-btn ed-btn--danger',
      onClick,
    }, text);
  }

  function collapsibleSection(title, children) {
    const wrap = el('details', { class: 'ed-collapse' });
    const sum = el('summary', { class: 'ed-collapse__summary' }, title);
    const body = el('div', { class: 'ed-collapse__body' }, children);
    wrap.appendChild(sum);
    wrap.appendChild(body);
    return wrap;
  }

  function infoBox(text) {
    return el('div', { class: 'ed-inspector__info' }, text);
  }

  // ============================================================
  // Common controls factories
  // ============================================================
  const SIZE_OPTIONS = [
    { v: 'xs', l: 'Extra pequeño' }, { v: 'sm', l: 'Pequeño' },
    { v: 'md', l: 'Mediano' }, { v: 'lg', l: 'Grande' },
    { v: 'xl', l: 'Extra grande' }, { v: '2xl', l: '2x grande' },
    { v: '3xl', l: '3x grande' },
  ];

  const WEIGHT_OPTIONS = [
    { v: 'normal', l: 'Normal' }, { v: 'medium', l: 'Media' },
    { v: 'semibold', l: 'Semi negrita' }, { v: 'bold', l: 'Negrita' },
  ];

  const ALIGN_OPTIONS = [
    { v: 'left', l: 'Izquierda' },
    { v: 'center', l: 'Centro' },
    { v: 'right', l: 'Derecha' },
  ];

  function commonStyleControls(el_, onUpdate) {
    return [
      selectCtrl('Tamaño', el_.estilo.tamaño || el_.estilo.tamano || 'md', SIZE_OPTIONS,
        v => onUpdate('tamaño', v)),
      selectCtrl('Peso', el_.estilo.peso || 'normal', WEIGHT_OPTIONS,
        v => onUpdate('peso', v)),
      selectCtrl('Alineación', el_.estilo.alineacion || 'left', ALIGN_OPTIONS,
        v => onUpdate('alineacion', v)),
      colorPicker('Color texto', el_.estilo.color_texto || '',
        v => onUpdate('color_texto', v || null)),
    ];
  }

  function commonGridControls(el_, onUpdate) {
    return [
      slider('Columna inicio', el_.grid.col_start || 1, 1, 24, 1,
        v => onUpdate({ col_start: v })),
      slider('Columna fin', el_.grid.col_end || 13, 2, 25, 1,
        v => onUpdate({ col_end: v })),
      slider('Fila inicio', el_.grid.row_start || 1, 1, 50, 1,
        v => onUpdate({ row_start: v })),
      slider('Fila fin', el_.grid.row_end || 4, 2, 51, 1,
        v => onUpdate({ row_end: v })),
    ];
  }

  // ============================================================
  // Export
  // ============================================================
  window.TiendaIA = window.TiendaIA || {};
  window.TiendaIA.editorControls = {
    textInput, textarea, urlInput,
    select: selectCtrl,
    colorPicker, slider,
    switch: switchCtrl,
    headerLabel, primaryButton, dangerButton, collapsibleSection, infoBox,
    commonStyleControls, commonGridControls,
    SIZE_OPTIONS, WEIGHT_OPTIONS, ALIGN_OPTIONS,
    el, // expose helper para inspector
  };
})(window);
```

- [ ] **Step 2: Syntax check**

```powershell
node -c iapanel/tienda/admin/views/editor/editor-controls.js
```

- [ ] **Step 3: Commit**

```powershell
git add iapanel/tienda/admin/views/editor/editor-controls.js
git commit -F .commit-msg-task12.tmp
```

`.commit-msg-task12.tmp` content:
```
feat(editor): Plan 3 Task 12 - editor-controls.js 6 helpers reusables

Libreria interna de controles para el Inspector:
- textInput / textarea / urlInput (con validacion regex inline)
- select (con cast number si opt.v es number)
- colorPicker (input color + hex text sincronizados, error si invalid)
- slider (range + numero label)
- switch (toggle bool)
- Extras: headerLabel, primaryButton, dangerButton, collapsibleSection
- Factories: commonStyleControls + commonGridControls
- Debounce 200ms en todos los inputs

Coherente con design: helpers compartidos + hand-coded compose por tipo
(decision aprobada Jorge).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

> **Plan continúa en parte 2** (Tasks 13-32) → ver `2026-06-02-editor-pro-max-plan3-part2.md`.
>
> Por límite de tamaño de archivo, el plan se divide. Cada parte es ejecutable independiente respetando dependencias declaradas.
>
> Tasks restantes:
> - Task 13: editor-styles.css
> - Task 14: editor-toolbar.js
> - Task 15: editor-sidebar.js
> - Task 16: editor-modal-catalog.js
> - Task 17: editor-canvas.js
> - Task 18: editor-inspector.js
> - Task 19: editor-first-use.js
> - Task 20: editor.js (entry)
> - Task 21: MOD admin.js
> - Task 22: MOD index.html
> - Task 23: MOD admin.css
> - Task 24: Deploy + smoke #/editor LIVE
> - Task 25: crm-mensajes.js
> - Task 26: MOD crm.js
> - Task 27: MOD admin.js refresh badge interval
> - Task 28: Deploy CRM tab + test E2E
> - Task 29: Playwright suite E2E 20 tests
> - Task 30: code-reviewer agent audit
> - Task 31: Verificación empírica LIVE final
> - Task 32: Push + memoria + cierre Plan 3
