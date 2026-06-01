// Stage 2: visit auth-guarded pages after stubbing Supabase auth
const path = require('path');
const PLAYWRIGHT_PATH = 'C:/Users/Usuario/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const OUT_DIR = path.resolve(__dirname);

const urls = [
  ['mi-cuenta',              'http://localhost:8765/mi-cuenta.html'],
  ['upgrade-pro',            'http://localhost:8765/upgrade-pro.html'],
  ['iapanel-hub',            'http://localhost:8765/iapanel/index.html'],
  ['iapanel-estudio',        'http://localhost:8765/iapanel/estudio/index.html'],
  ['iapanel-estudio-recargas','http://localhost:8765/iapanel/estudio/recargas.html'],
  ['iapanel-estudio-admin',  'http://localhost:8765/iapanel/estudio/admin.html'],
  ['iapanel-tienda-admin',   'http://localhost:8765/iapanel/tienda/admin/index.html'],
  ['dashboard',              'http://localhost:8765/dashboard/index.html'],
  ['cuenta-cancelada',       'http://localhost:8765/cuenta-cancelada.html'],
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/Usuario/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // Stub: prevent auth-redirect by neutralizing window.location.replace to a noop
  // and faking a Supabase session so requireAuth returns a fake user.
  await context.addInitScript(() => {
    // Block redirects
    const orig = window.location.replace.bind(window.location);
    Object.defineProperty(window.location, 'replace', {
      value: (url) => { console.log('[STUB] blocked replace ->', url); },
      writable: true, configurable: true
    });
    const origHref = Object.getOwnPropertyDescriptor(window.location, 'href');
    // Also block hard navigations triggered by setting href to login/cuenta-cancelada/verificar
    try {
      Object.defineProperty(window.location, 'href', {
        get: () => 'http://localhost:8765/' + (window.__currentPath || ''),
        set: (v) => { console.log('[STUB] blocked href set ->', v); },
        configurable: true
      });
    } catch (e) { /* fine */ }

    // Patch supabase.auth.getSession to return a fake session
    const fakeSession = {
      access_token: 'fake', refresh_token: 'fake',
      user: { id: 'aud-fake-uuid', email: 'audit@aimma.test' }
    };
    const fakeUser = { id: 'aud-fake-uuid', email: 'audit@aimma.test' };
    const fakeProfile = {
      id: 'aud-fake-uuid', email: 'audit@aimma.test', nombre: 'Audit',
      email_aimma_verificado: true, cuenta_cancelada_at: null,
      plan: 'pro', estudio_tokens: 999
    };

    // Intercept when AIMMA_AUTH gets defined
    let _A = undefined;
    Object.defineProperty(window, 'AIMMA_AUTH', {
      configurable: true,
      get() { return _A; },
      set(v) {
        if (v && typeof v === 'object') {
          v.requireAuth = async () => ({ user: fakeUser, profile: fakeProfile, session: fakeSession });
          v.getCurrentUser = async () => ({ user: fakeUser, profile: fakeProfile });
          v.requireGuest = async () => true;
        }
        _A = v;
      }
    });

    // Also stub supabaseClient.auth.getSession  pre-emptively
    let _sc;
    Object.defineProperty(window, 'supabaseClient', {
      configurable: true,
      get() { return _sc; },
      set(v) {
        if (v && v.auth) {
          const origGet = v.auth.getSession.bind(v.auth);
          v.auth.getSession = async () => ({ data: { session: fakeSession }, error: null });
          v.auth.getUser = async () => ({ data: { user: fakeUser }, error: null });
        }
        _sc = v;
      }
    });
  });

  const page = await context.newPage();
  const results = [];

  for (const [name, url] of urls) {
    const errs = [];
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
    page.on('pageerror', e => errs.push('PAGEERR: ' + e.message.slice(0, 200)));
    page.on('console', msg => {
      const t = msg.text();
      if (msg.type() === 'error') errs.push('CONSOLE_ERR: ' + t.slice(0, 200));
    });

    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(2500); // give SPA time to render auth-passed content

      const file = path.join(OUT_DIR, name + '-auth.png');
      await page.screenshot({ path: file, fullPage: false });

      const analysis = await page.evaluate(() => {
        function lightness(rgb) {
          const m = rgb && rgb.match(/\d+(\.\d+)?/g);
          if (!m) return null;
          const [r, g, b] = m.slice(0, 3).map(Number);
          return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        }
        const body = document.body;
        const bodyBg = getComputedStyle(body).backgroundColor;
        const bodyColor = getComputedStyle(body).color;

        const queries = ['header','nav','.sidebar','.app-sidebar','.topbar','.app-topbar','.hero','main','.dashboard-main','.panel','.card','.btn-primary','.cta','.modal','.tab','.tab-active','aside'];
        const samples = [];
        for (const q of queries) {
          const els = document.querySelectorAll(q);
          els.forEach((el, i) => {
            if (i > 1) return;
            const cs = getComputedStyle(el);
            samples.push({
              q, bg: cs.backgroundColor, color: cs.color,
              bgL: lightness(cs.backgroundColor), txtL: lightness(cs.color),
              text: (el.innerText || '').slice(0, 40)
            });
          });
        }

        // Dark containers
        const isDark = (rgb) => {
          const m = rgb.match(/\d+(\.\d+)?/g);
          if (!m) return false;
          const [r, g, b] = m.slice(0,3).map(Number);
          const a = m[3] !== undefined ? Number(m[3]) : 1;
          if (a < 0.4) return false;
          return ((0.299*r + 0.587*g + 0.114*b) / 255) < 0.2;
        };
        const allEls = Array.from(document.querySelectorAll('body *')).slice(0, 3500);
        const darkContainers = [];
        for (const el of allEls) {
          const cs = getComputedStyle(el);
          if (!isDark(cs.backgroundColor)) continue;
          const isInMockup = el.closest('.phone-mockup, .terminal, .device, .mockup, .screen-mockup, code, pre, .agent-bubble-dark, .dark-card, .video-thumb, .console, .terminal-card');
          if (isInMockup) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 80 || rect.height < 40) continue;
          if (rect.bottom < 0 || rect.top > 800) continue; // offscreen
          const tag = el.tagName.toLowerCase();
          const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 100) : '';
          const id = el.id || '';
          darkContainers.push({ tag, id, cls, bg: cs.backgroundColor, w: Math.round(rect.width), h: Math.round(rect.height), text: (el.innerText||'').slice(0,40) });
          if (darkContainers.length > 12) break;
        }

        // Low contrast
        const lowContrast = [];
        const textEls = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,a,label,span,button,.btn,li,td,th')).slice(0, 2000);
        for (const el of textEls) {
          if (!el.innerText || !el.innerText.trim()) continue;
          const rect = el.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > 800) continue;
          const cs = getComputedStyle(el);
          const bgM = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
          let alpha = 1;
          if (bgM) {
            const parts = bgM[1].split(',').map(s => s.trim());
            if (parts.length === 4) alpha = parseFloat(parts[3]);
          }
          if (alpha < 0.2) continue;
          const bgL = lightness(cs.backgroundColor);
          const txtL = lightness(cs.color);
          if (bgL === null || txtL === null) continue;
          if (bgL > 0.85 && txtL > 0.75) {
            lowContrast.push({ tag: el.tagName.toLowerCase(), text: el.innerText.slice(0,60), bg: cs.backgroundColor, color: cs.color, kind:'light-on-light' });
          }
          if (bgL < 0.25 && txtL < 0.3) {
            lowContrast.push({ tag: el.tagName.toLowerCase(), text: el.innerText.slice(0,60), bg: cs.backgroundColor, color: cs.color, kind:'dark-on-dark' });
          }
          if (lowContrast.length > 8) break;
        }

        // Inputs missing visible border
        const inputs = Array.from(document.querySelectorAll('input,select,textarea')).slice(0, 50);
        const invisibleInputs = [];
        for (const el of inputs) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 30 || rect.height < 10) continue;
          if (rect.bottom < 0 || rect.top > 800) continue;
          const cs = getComputedStyle(el);
          const bgL = lightness(cs.backgroundColor);
          const bw = parseFloat(cs.borderTopWidth) || 0;
          const bgM = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
          let alpha = 1;
          if (bgM) { const p = bgM[1].split(',').map(s=>s.trim()); if (p.length===4) alpha=parseFloat(p[3]); }
          // input white on white body with no border
          if (bgL > 0.9 && bw < 1 && alpha > 0.2) {
            invisibleInputs.push({ type: el.type || el.tagName.toLowerCase(), bg: cs.backgroundColor, border: cs.border });
          }
        }

        return { bodyBg, bodyColor, samples, darkContainers, lowContrast, invisibleInputs, title: document.title, location: window.location.pathname };
      });

      results.push({ name, url, status: resp ? resp.status() : null, errs, analysis });
      console.log(`OK ${name} -> ${resp ? resp.status() : '?'} title="${analysis.title}" path=${analysis.location} dark=${analysis.darkContainers.length} lowC=${analysis.lowContrast.length}`);
    } catch (e) {
      results.push({ name, url, error: e.message, errs });
      console.log(`ERR ${name} -> ${e.message}`);
    }
  }

  await browser.close();
  require('fs').writeFileSync(path.join(OUT_DIR, 'report-auth.json'), JSON.stringify(results, null, 2));
  console.log('Report saved to report-auth.json');
})();
