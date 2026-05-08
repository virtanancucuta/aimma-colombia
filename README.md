# AIMMA Colombia · Sitio Web Oficial

Sitio web institucional de **AIMMA Colombia**, consultora de Inteligencia Artificial con enfoque financiero-comercial. Cúcuta, Norte de Santander.

> **Stack:** HTML5 + CSS3 vanilla + JavaScript ES6+ vanilla. Sin build step, sin frameworks. Funciona abriendo `index.html` directamente.

---

## Estructura

```
aimma-website/
├── index.html              # SPA con 5 tabs (Home, Inteligencia Comercial, Marketing Financiero, Compras, Tecnologia IA)
├── style.css               # Sistema de diseño dark-tech, variables CSS, responsive
├── app.js                  # Router de tabs, animaciones, formulario, agente IA con voz
├── supabase-config.js      # Cliente Supabase + función enviarDiagnostico()
├── assets/
│   ├── logo.png            # Logo principal (raster, alta resolución)
│   ├── logo.svg            # Logo vectorial (header, escalable)
│   └── favicon.svg         # Favicon
├── .gitignore
├── .env.example            # Plantilla de variables (referencia)
└── README.md
```

---

## Características

- **SPA estática con 5 secciones**: navegación por hash (`#home`, `#inteligencia-comercial`, etc.) sin recargar.
- **Hero animado**: canvas con red de partículas cian, título con fade-in escalonado.
- **Formulario wizard de 3 pasos** con validación, barra de progreso, envío real a Supabase y pantalla de éxito con CTA a WhatsApp.
- **Charts vanilla**: gráficos de líneas y barras dibujados con Canvas + SVG, sin dependencias.
- **Agente IA con voz**: orbe pulsante + Web Speech API (`speechSynthesis`) que recita un guion en español. Subtitulado palabra por palabra sincronizado con `onboundary`.
- **Mockups de WhatsApp**: dos celulares animados (cliente preguntando por stock; asesor enviando audio + PDF) que se reproducen en loop.
- **Responsive completo**: mobile-first, breakpoints en 560 / 900 / 1024 px. Hamburguesa con drawer en mobile.
- **SEO/Schema**: Open Graph, Twitter Card, schema.org `ProfessionalService`.
- **Accesibilidad**: ARIA labels, `prefers-reduced-motion`, contraste AAA, navegación por teclado.

---

## Cómo correr localmente

> **Importante**: Supabase requiere que el sitio se sirva por HTTP (no `file://`) para que el cliente JS funcione. Usa cualquiera de estos:

### Opción A — Python (preinstalado en macOS/Linux y Windows con Python)
```bash
python -m http.server 8000
# abre http://localhost:8000
```

### Opción B — Node.js
```bash
npx serve .
# o
npx http-server -p 8000
```

### Opción C — VS Code "Live Server" extension
Click derecho en `index.html` → "Open with Live Server".

---

## Conexión Supabase

**Proyecto:** `aimma` (Project ID: `rsmxklkxqsaptchcjszd`)

**Tabla:** `diagnostico_gratuito` con RLS activo. Política INSERT pública (anon), SELECT/UPDATE privadas.

**Credenciales** (publishable key, segura para frontend):
```javascript
const SUPABASE_URL = 'https://rsmxklkxqsaptchcjszd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VKKJmeQ6SVszVdD422h3qQ_KkDPeLH1';
```
Ya configuradas en `supabase-config.js`.

### Ver leads en tiempo real
Dashboard: https://supabase.com/dashboard/project/rsmxklkxqsaptchcjszd/editor

Cambia el campo `estado` (nuevo / contactado / en_proceso / ganado / perdido) para hacer seguimiento.

### Probar el envío
1. Levanta el sitio local
2. Llena el formulario en la sección Home
3. Verifica que la fila aparezca en la tabla `diagnostico_gratuito`

---

## Cómo actualizar contenido

| Qué cambiar | Dónde |
|---|---|
| Textos de secciones | `index.html` (busca el `<section>` correspondiente) |
| Colores / glow / espaciado | `style.css` → `:root { --... }` |
| Tipografías | `index.html` (link a Google Fonts) + `style.css` (`--font-display`, `--font-ui`, `--font-mono`) |
| Datos de contacto (WhatsApp, email, IG) | `index.html` (footer + botón flotante) |
| Discurso del agente IA | `app.js` → constante `AGENT_TEXT` |
| Datos del chart de ventas | `app.js` → arrays `ventas[]` y `rent[]` |
| Datos del chart de barras Ads | `app.js` → arrays `before[]` y `after[]` |
| KPIs (4.8x, +18%, 38%, etc.) | `index.html` → atributos `data-target`, `data-prefix`, `data-suffix` |
| Vendedores del seguimiento | `index.html` en el bloque `.sellers` |
| Logo | reemplazar `assets/logo.png` y `assets/logo.svg` |

---

## Deploy en Hostinger + EasyPanel

### Opción 1 — FTP simple
1. Sube todos los archivos de `aimma-website/` al directorio `public_html/` (o el root de tu hosting).
2. Asegura que el dominio `aimma.colombia.com` (o el final) apunte al hosting.
3. Activa SSL (Let's Encrypt) desde el panel.

### Opción 2 — EasyPanel + GitHub (recomendado)
1. Crea repo en GitHub: `git init && git add . && git commit -m "Initial AIMMA website"` → push.
2. En EasyPanel: nuevo servicio tipo **Static Site** → conecta el repo.
3. Build command: vacío (no hay build).
4. Publish directory: `/` (o `aimma-website/` si subes el repo padre).
5. Configura el dominio + SSL.
6. **Activa caché de assets estáticos** (1 año en cabeceras `Cache-Control: public, max-age=31536000` para `.svg`, `.png`, `.css`, `.js` con hash de versión).
7. Activa **compresión Brotli/Gzip** para `.html`, `.css`, `.js`.

### Variables de entorno
No requiere ninguna en runtime — el cliente Supabase usa la key pública embebida. Si en el futuro agregas Edge Functions o scripts, ver `.env.example`.

---

## Performance esperada

| Métrica | Target | Por qué se cumple |
|---|---|---|
| Lighthouse Performance | >90 | Sin frameworks, fuentes preloaded, animaciones con `transform`/`opacity`, lazy de secciones |
| Lighthouse Accessibility | >95 | ARIA, contraste AAA, labels, `prefers-reduced-motion` |
| Lighthouse SEO | >95 | Meta tags + schema.org + sitemap-friendly hash routing |
| First Contentful Paint | <1.5s | Solo CSS/JS local + 1 CDN (Supabase) |
| Total Blocking Time | <100ms | JS modular, init lazy por tab |

---

## Próximas mejoras sugeridas

- [ ] Reemplazar `alert()` de errores por toast estilizado
- [ ] Añadir captcha (hCaptcha o Cloudflare Turnstile) antes del INSERT a Supabase
- [ ] Edge Function de Supabase para enviar email de notificación a `aimma.colombia@gmail.com` en cada nuevo lead
- [ ] Página `/gracias` separada para tracking de conversión en Meta Pixel / Google Ads
- [ ] Blog con CMS headless (Sanity / Contentful) integrado vía fetch
- [ ] Modo claro opcional (mantener cyan accent)
- [ ] Convertir `logo.aimma.jpg` original en versión `.webp` optimizada (~80% menor peso)
- [ ] Analytics: Plausible o Umami self-hosted (más privacidad que GA4)

---

## Licencia y crédito

© 2025 AIMMA Colombia. Todos los derechos reservados.

Sitio desarrollado con Claude Code (Anthropic) siguiendo briefing de marca AIMMA.
