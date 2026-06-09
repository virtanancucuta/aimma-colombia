# Email transaccional — PASO A PASO para Jorge (Tipo B, prerequisito)

Objetivo: dejar el dominio `send.aimma.com.co` **verificado** en Resend y la **API key guardada** como secret.
Cuando termines: avisame "dominio verificado + key guardada" y arranco a construir.
**Importante:** no se construye el envío hasta que el dominio esté verificado (si no, los correos caen en spam).

Tené dos pestañas abiertas: **Resend** y **Cloudflare**. Vas a copiar de Resend y pegar en Cloudflare.

> **Importante:** el DNS de aimma.com.co está en **Cloudflare** (nameservers `ram/sara.ns.cloudflare.com`), NO en Namecheap. Los registros van en Cloudflare. **No toques el DNS en Namecheap** (rompería el setup de Cloudflare del storefront).

---

## PARTE 1 — Crear cuenta en Resend (5 min)

1. Entrá a **https://resend.com** → botón **Sign Up**.
2. Registrate con Google o con email (el que prefieras; podés usar tu email de AIMMA).
3. Confirmá el email si te lo pide y entrás al panel (dashboard).

---

## PARTE 2 — Agregar el dominio de envío en Resend (5 min)

1. En el panel de Resend, menú izquierdo → **Domains**.
2. Botón **Add Domain**.
3. En el campo de dominio escribí EXACTO: `send.aimma.com.co`
   (es un **subdominio** a propósito — no escribas solo `aimma.com.co`).
4. Región: dejá la que viene por defecto (**us-east-1** está bien para Colombia).
5. **Add**.
6. Resend te muestra ahora una **tabla de registros DNS** que hay que crear. Vas a ver varias filas con columnas **Type / Name / Value** (y a veces **Priority** y **TTL**). Típicamente:
   - 1 fila **MX** (Name = algo con `send`, Value = `feedback-smtp...amazonses.com`, Priority = 10)
   - 1 fila **TXT** de SPF (Value que empieza con `v=spf1 ...`)
   - 1 o más filas **TXT/CNAME** de DKIM (Name que contiene `_domainkey`, Value largo)
   - a veces 1 fila **TXT** de DMARC (Name con `_dmarc`)

   **Dejá esta pestaña abierta.** Los valores son únicos de tu cuenta — vas a copiarlos uno por uno.

---

## PARTE 3 — Pegar esos registros en Cloudflare (15 min)

1. Entrá a **https://dash.cloudflare.com** → iniciá sesión.
2. En la lista de sitios (Websites), hacé clic en **aimma.com.co**.
3. Menú izquierdo → **DNS** → **Records**.
4. Botón **Add record**. Vas a agregar una fila por cada registro que te mostró Resend.

### Cómo traducir cada fila de Resend a Cloudflare (clave)

Cloudflare te pide por registro: **Type**, **Name**, **Content/Target/Mail server** (y **Priority/TTL/Proxy** según el tipo).

- **Type:** elegí el mismo que dice Resend (TXT, MX o CNAME).
- **Name (lo más importante):** Cloudflare **agrega solo** `.aimma.com.co` al final, así que en "Name" poné únicamente la parte de adelante:
  - Si Resend dice Name = `send.aimma.com.co` → en Name poné **`send`**
  - Si Resend dice Name = `resend._domainkey.send.aimma.com.co` → en Name poné **`resend._domainkey.send`**
  - Si Resend dice Name = `_dmarc.aimma.com.co` → en Name poné **`_dmarc`**
  - Regla simple: **copiá el Name de Resend y borrale `.aimma.com.co` del final.** Lo que queda va en Name.
  - (Si pegás el nombre completo, Cloudflare igual te recorta el `.aimma.com.co` solo — no pasa nada.)
- **Valor:** copiá y pegá EXACTO lo de Resend:
  - **TXT** → campo **Content** (pegá toda la cadena, aunque sea larga, en una línea).
  - **CNAME** → campo **Target**.
  - **MX** → campo **Mail server** + campo **Priority** (el número de Resend, normalmente **10**).
- **🟠 Proxy status (MUY IMPORTANTE):** en los registros **CNAME** vas a ver un interruptor con una **nube**. Tiene que quedar en **"DNS only" (nube GRIS)**, NUNCA en "Proxied" (nube naranja). Si lo dejás en naranja, Cloudflare oculta/modifica el registro y **Resend no verifica + el correo se rompe**. (Los TXT y MX no tienen nube — solo los CNAME.)
- **TTL:** dejá **Auto**.
- Clic en **Save** (Cloudflare guarda cada registro al instante; no hay un "guardar todo").

5. Repetí **Add record** hasta cargar **todas** las filas que mostró Resend, con los CNAME en **DNS only (gris)**.

### ⚠️ Cuidados (no rompas el storefront ni el correo actual)
- **NO cambies los nameservers** ni borres registros existentes. Los que ya están (los del storefront `tienda.aimma.com.co`, el dominio raíz, y los MX/SPF del correo actual que terminan en `registrar-servers.com`) **quedan igual**.
- Vos **solo AGREGÁS** lo nuevo del subdominio **`send`** (+ `_dmarc`). No borrás nada.
- Si Cloudflare avisa que ya existe un `_dmarc`, avisame antes de cambiarlo.
- Recordá: cualquier **CNAME** de Resend → **DNS only (nube gris)**.

---

## PARTE 4 — Verificar en Resend (espera de minutos)

1. Volvé a la pestaña de **Resend → Domains → send.aimma.com.co**.
2. Clic en **Verify DNS Records** (o se chequea solo).
3. Los registros pasan a **Verified** (verde) de a uno. Puede tardar de unos minutos hasta un par de horas (propagación DNS).
4. Cuando el dominio quede **Verified** (todo verde) → listo esta parte.
   - Si después de un par de horas algo sigue en rojo, mandame captura de la fila en rojo y la reviso.

---

## PARTE 5 — Crear y guardar la API key (5 min)

### 5.1 Crear la key en Resend
1. En Resend, menú izquierdo → **API Keys**.
2. **Create API Key**.
3. Name: `aimma-tiendas`. Permission: **Sending access** (envío). Domain: `send.aimma.com.co`.
4. **Add** → te muestra la key (empieza con `re_...`). **Copiala ya** — se ve UNA sola vez.

### 5.2 Guardarla como secret en Supabase
1. Entrá a **https://supabase.com** → tu proyecto de AIMMA.
2. Menú izquierdo → **Project Settings** (el engranaje) → **Edge Functions**.
3. Sección **Secrets** → **Add new secret**.
4. Name: `RESEND_API_KEY`  ·  Value: pegá la key `re_...`  → **Save**.
   - (Si no encontrás la sección Secrets ahí, está en **Edge Functions → Secrets / Manage secrets**.)

> Alternativa: si preferís, pasame la key por acá y la guardo yo por consola — pero lo más seguro es que la dejes vos en el dashboard (no queda en ningún chat ni archivo).

---

## Cuando termines
Avisame: **"dominio verificado + key guardada"**.
Ahí paso al plan detallado y construyo (EF de envío + plantillas + webhooks + checkout). No antes.
