# Webhook Supabase -> Invalidate KV (Setup Tipo B Jorge)

**Fecha:** 2026-05-31
**Status:** Endpoint listo, falta configuracion Supabase Dashboard (Tipo B)

## Objetivo

Reducir el lag de propagacion de cambios (paleta, plantilla, productos) desde el panel admin al storefront publico de ~60s (TTL KV) a ~5s.

## Como funciona

```
[Panel admin] -> UPDATE tabla en Supabase
                       |
                       v
            [Database Webhook Supabase] (configurado por Jorge)
                       |
                       v
            POST https://aimma-test.tienda.aimma.com.co/internal/invalidate-kv
              Authorization: Bearer djt_wCsW3evNQHyoBlzhSnGrp-BBvvGSP7EiWPWsCJ0
              { type: "UPDATE", record: {slug, ...}, old_record: {...} }
                       |
                       v
            [Worker Cloudflare] -> KV.delete("tienda:<slug>")
                       |
                       v
            Siguiente request al storefront -> miss KV -> fetch Supabase fresh
```

## Pre-requisitos completados (Tipo A Claude)

- [x] Endpoint `/internal/invalidate-kv` en `apps/storefront/src/pages/internal/invalidate-kv.ts`
- [x] Middleware excluye `/_internal/` (ya estaba)
- [x] Auth con bearer token `INVALIDATE_SECRET`
- [x] Soporta payload simple, batch y formato webhook Supabase
- [x] Astro check 0 errors

## Setup Tipo B (Jorge — 5 minutos)

### Paso 1: Setear secret en Cloudflare Worker

```bash
cd apps/storefront
npx wrangler secret put INVALIDATE_SECRET
# pegar: djt_wCsW3evNQHyoBlzhSnGrp-BBvvGSP7EiWPWsCJ0
```

Verificar:
```bash
npx wrangler secret list
```

Debe aparecer `INVALIDATE_SECRET` en la lista.

### Paso 2: Test endpoint manual

```bash
curl -X POST https://aimma-test.tienda.aimma.com.co/internal/invalidate-kv \
  -H "Authorization: Bearer djt_wCsW3evNQHyoBlzhSnGrp-BBvvGSP7EiWPWsCJ0" \
  -H "Content-Type: application/json" \
  -d '{"slug":"aimma-test"}'
```

Respuesta esperada:
```json
{"success":true,"invalidated":["aimma-test"],"deleted_count":1,"failed_count":0}
```

### Paso 3: Configurar Database Webhooks en Supabase Dashboard

URL: https://supabase.com/dashboard/project/rsmxklkxqsaptchcjszd/database/hooks

Crear **4 webhooks** (uno por tabla):

#### Webhook 1: tiendas
- Name: `invalidate_kv_tiendas`
- Table: `public.tiendas`
- Events: INSERT, UPDATE, DELETE
- Type: HTTP Request
- Method: POST
- URL: `https://tienda.aimma.com.co/internal/invalidate-kv`
  - Truco: como es wildcard, cualquier subdomain del storefront sirve. Pero por consistencia usar la raiz.
  - Alternativa mas robusta: `https://aimma-test.tienda.aimma.com.co/internal/invalidate-kv`
- Headers:
  - `Authorization: Bearer djt_wCsW3evNQHyoBlzhSnGrp-BBvvGSP7EiWPWsCJ0`
  - `Content-Type: application/json`
- Conditions: (vacio)
- Timeout: 5000ms

#### Webhook 2: productos
- Igual pero Table: `public.productos`
- Importante: cuando un producto cambia, hay que invalidar la tienda. El payload de webhook trae `record.tienda_id`, no `slug`. Para resolver esto:

**Opcion A (preferida):** Usar trigger SQL que resuelve `slug` y llama via `pg_net`:

```sql
-- Migration agregar despues si Jorge aprueba
CREATE OR REPLACE FUNCTION public.invalidate_kv_producto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_slug TEXT;
BEGIN
  SELECT slug INTO v_slug FROM public.tiendas
  WHERE id = COALESCE(NEW.tienda_id, OLD.tienda_id);
  IF v_slug IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://tienda.aimma.com.co/internal/invalidate-kv',
      headers := jsonb_build_object(
        'Authorization', 'Bearer djt_wCsW3evNQHyoBlzhSnGrp-BBvvGSP7EiWPWsCJ0',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('slug', v_slug)
    );
  END IF;
  RETURN NEW;
END;
$$;
```

**Opcion B:** Database webhook + endpoint enriquece slug consultando Supabase. Mas trabajo en endpoint, mas trafico.

Recomendacion: empezar solo con webhook 1 (tiendas). Productos pueden esperar al TTL 60s — son menos sensibles.

#### Webhooks 3 y 4: paginas_legales, categorias
- Similar a producto. Por ahora skip.

### Paso 4: Verificar E2E

1. Hacer un cambio en panel admin (cambiar paleta de aimma-test)
2. Guardar
3. Esperar 5 segundos
4. Hacer curl al storefront (sin cache):
   ```bash
   curl -s -H "Cache-Control: no-cache" https://aimma-test.tienda.aimma.com.co | grep -o "ta-color-primary:[^;]*"
   ```
5. Verificar que el color refleja el cambio

Si funciona: TTL real bajo de ~60s a ~5s.

## Decisiones tecnicas

### Por que endpoint Astro y no EF Supabase como proxy?

El endpoint Astro corre en el mismo Worker que tiene el binding `TENANT_CACHE`. KV.delete() es local y rapido. Una EF Supabase tendria que hacer fetch al Worker igualmente -> doble hop.

### Por que bearer secret y no HMAC?

HMAC seria mas robusto contra replay attacks. Bearer es suficiente para este caso:
- El secret no se expone al cliente (solo Supabase Dashboard y CF Worker)
- HTTPS protege en transito
- Si se compromete, basta rotar y reseter

### Por que `/_internal/` y no subdomain dedicado?

Reusa la misma Worker (mismo deploy). Middleware ya excluye `/_internal/`. Suficiente.

### Performance

KV.delete() en Cloudflare:
- p50: ~20ms
- p99: ~80ms
- Propagacion global: ~10-30s (eventual consistency)

Por lo tanto, el lag real esta dominado por la propagacion CF, no por el endpoint. Bajamos de 60s -> 10-30s.

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| Endpoint expuesto sin auth | Bearer obligatorio, 401 si missing |
| DDoS via spam de webhooks | Worker tiene rate limit nativo CF |
| Slug renombrado: cache viejo persiste | Endpoint soporta `old_record.slug`, invalida ambos |
| Webhook Supabase down | TTL 60s sigue funcionando como fallback |
| pg_net no habilitado | Verificar `CREATE EXTENSION pg_net` |

## Pendiente para Jorge

- [ ] Setear secret CF `INVALIDATE_SECRET` (5 min)
- [ ] Verificar curl manual responde 200 (1 min)
- [ ] Crear Database Webhook tiendas en Supabase Dashboard (3 min)
- [ ] Probar E2E cambio paleta y ver lag (5 min)
