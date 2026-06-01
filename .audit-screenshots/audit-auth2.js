// Stage 2 v2: intercept auth.js + supabase-config.v2.js to bypass auth
const path = require('path');
const fs = require('fs');
const PLAYWRIGHT_PATH = 'C:/Users/Usuario/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const OUT_DIR = path.resolve(__dirname);
const ROOT = path.resolve(__dirname, '..');

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

  // Intercept module-level auth helpers in estudio/tienda/dashboard to neutralise their own requireAuth/redirectToLogin
  async function patchScript(route, relPath) {
    const p = path.join(ROOT, relPath);
    if (!fs.existsSync(p)) return route.continue();
    let body = fs.readFileSync(p, 'utf8');
    // Neutralise redirectToLogin function bodies
    body = body.replace(
      /function redirectToLogin\(\)\s*\{[^}]*\}/g,
      `function redirectToLogin() { console.log('[STUB] redirectToLogin blocked'); }`
    );
    // Replace 'window.location.href = LOGIN_URL...' style direct redirects too
    body = body.replace(/window\.location\.href\s*=\s*LOGIN_URL[^;]*;/g, `console.log('[STUB] login redirect blocked');`);
    body = body.replace(/window\.location\.replace\(\s*['"]\/login\.html[^)]*\)/g, `console.log('[STUB] login replace blocked')`);
    // Force requireAuth in modules to always return a user-like object
    body = body.replace(
      /async function requireAuth\(\)\s*\{[\s\S]*?return data\.session\.user;\s*\}[\s\S]*?\}/,
      `async function requireAuth() { return { id:'aud-fake', email:'audit@aimma.test', user_metadata:{ full_name:'Audit' } }; }`
    );
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
  }

  // Regex route — catches .js with or without ?v= query suffix
  await context.route(/\/iapanel\/estudio\/estudio\.js/, r => patchScript(r, 'iapanel/estudio/estudio.js'));
  await context.route(/\/iapanel\/estudio\/recargas\.js/, r => patchScript(r, 'iapanel/estudio/recargas.js'));
  await context.route(/\/iapanel\/estudio\/admin\.js/, r => patchScript(r, 'iapanel/estudio/admin.js'));
  await context.route(/\/iapanel\/tienda\/admin\/admin\.js/, r => patchScript(r, 'iapanel/tienda/admin/admin.js'));
  await context.route(/\/app\.v\d+\.js/, r => patchScript(r, 'app.v3.js'));
  await context.route(/\/dashboard\/.*\.js/, async (route) => {
    const url = new URL(route.request().url());
    const rel = 'dashboard' + url.pathname.split('/dashboard')[1];
    return patchScript(route, rel);
  });

  // Patch inline scripts inside HTML pages by intercepting HTML responses too
  async function patchHtml(route, relPath) {
    const p = path.join(ROOT, relPath);
    if (!fs.existsSync(p)) return route.continue();
    let body = fs.readFileSync(p, 'utf8');
    // Neutralise inline location.replace('/login.html...') calls
    body = body.replace(/window\.location\.replace\(\s*['"]\/login\.html[^)]*\)/g, '/* stubbed */');
    body = body.replace(/window\.location\.replace\(\s*['"]\/upgrade-pro\.html[^)]*\)/g, '/* stubbed */');
    body = body.replace(/window\.location\.href\s*=\s*['"]\/login\.html[^;]*/g, '/* stubbed */');
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  }
  await context.route(/\/dashboard\/index\.html/, r => patchHtml(r, 'dashboard/index.html'));
  await context.route(/\/iapanel\/estudio\/recargas\.html/, r => patchHtml(r, 'iapanel/estudio/recargas.html'));
  await context.route(/\/iapanel\/estudio\/admin\.html/, r => patchHtml(r, 'iapanel/estudio/admin.html'));

  // Block any subsequent navigation to /login.html by aborting it
  await context.route(/\/login\.html/, async (route) => {
    const req = route.request();
    // Allow the very first explicit visit to login (for the login URL itself in stage 1) - here we always block
    if (req.isNavigationRequest()) {
      console.log('[STUB] blocked navigation to', req.url());
      return route.abort('aborted');
    }
    return route.continue();
  });

  // Intercept auth.js — replace requireAuth body to return fake user with no redirect
  await context.route('**/auth.js', async (route) => {
    try {
      const authPath = path.join(ROOT, 'auth.js');
      let body = fs.readFileSync(authPath, 'utf8');
      // Patch requireAuth — neutralise all redirects, return fake
      body = body.replace(
        /async function requireAuth\(opts = \{\}\)\s*\{[\s\S]*?return \{ user, profile, session \};\s*\}/,
        `async function requireAuth(opts = {}) {
          const fakeUser = { id: 'aud-fake', email: 'audit@aimma.test', user_metadata: { full_name: 'Audit User' } };
          const fakeProfile = { id: 'aud-fake', email: 'audit@aimma.test', nombre_completo: 'Audit User', email_aimma_verificado: true, perfil_completo: true, cuenta_cancelada_at: null, plan: 'pro', estudio_tokens: 999, rol: 'admin' };
          const fakeSession = { access_token: 'fake', refresh_token: 'fake', user: fakeUser };
          return { user: fakeUser, profile: fakeProfile, session: fakeSession };
        }`
      );
      // Patch requireGuest to no-op
      body = body.replace(
        /async function requireGuest\(\)\s*\{[\s\S]*?\}\s*\}/,
        `async function requireGuest() { return null; }`
      );
      // Patch getCurrentUser
      body = body.replace(
        /async function getCurrentUser\(\)\s*\{[\s\S]*?return \{ user, profile \};\s*\}/,
        `async function getCurrentUser() {
          return { user: { id:'aud-fake', email:'audit@aimma.test', user_metadata: { full_name: 'Audit' } }, profile: { id:'aud-fake', nombre_completo:'Audit', email:'audit@aimma.test', email_aimma_verificado:true, perfil_completo:true, cuenta_cancelada_at:null, plan:'pro', estudio_tokens:999, rol:'admin' } };
        }`
      );
      await route.fulfill({ status: 200, contentType: 'application/javascript', body });
    } catch (e) {
      console.log('route err', e.message);
      await route.continue();
    }
  });

  // Block redirects on init too (belt + suspenders)
  await context.addInitScript(() => {
    const noop = (url) => { console.log('[STUB] blocked redirect ->', url); };
    try { Object.defineProperty(window.location, 'replace', { value: noop, writable: true, configurable: true }); } catch(_){}
    try { Object.defineProperty(window.location, 'assign',  { value: noop, writable: true, configurable: true }); } catch(_){}
    // Block hard navigation via .href = ... (best-effort)
    const origLocation = window.location;
    // We can't fully override location.href in modern Chromium; the auth.js redirect is now stubbed at source, so this is just extra protection for inline scripts.
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
      let resp = null;
      try {
        resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      } catch (gotoErr) {
        console.log(`  goto warn: ${gotoErr.message.split('\n')[0]}`);
      }
      // Wait for hydration regardless
      await page.waitForTimeout(3500);

      const file = path.join(OUT_DIR, name + '-auth.png');
      await page.screenshot({ path: file, fullPage: false });

      const analysis = await page.evaluate(() => {
        function lightness(rgb) {
          const m = rgb && rgb.match(/\d+(\.\d+)?/g);
          if (!m) return null;
          const [r,g,b] = m.slice(0,3).map(Number);
          return (0.299*r + 0.587*g + 0.114*b) / 255;
        }
        const body = document.body;
        const bodyBg = getComputedStyle(body).backgroundColor;
        const bodyColor = getComputedStyle(body).color;

        // Dark containers (legacy navy remnants)
        const isDark = (rgb) => {
          const m = rgb.match(/\d+(\.\d+)?/g);
          if (!m) return false;
          const [r,g,b] = m.slice(0,3).map(Number);
          const a = m[3] !== undefined ? Number(m[3]) : 1;
          if (a < 0.4) return false;
          return ((0.299*r + 0.587*g + 0.114*b) / 255) < 0.2;
        };
        const allEls = Array.from(document.querySelectorAll('body *')).slice(0, 4000);
        const darkContainers = [];
        for (const el of allEls) {
          const cs = getComputedStyle(el);
          if (!isDark(cs.backgroundColor)) continue;
          // Allow legit mockups
          const isInMockup = el.closest('.phone-mockup, .terminal, .device, .mockup, .screen-mockup, code, pre, .agent-bubble-dark, .dark-card, .video-thumb, .console, .terminal-card, .preview-mockup');
          if (isInMockup) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 100 || rect.height < 40) continue;
          if (rect.bottom < 0 || rect.top > 800) continue;
          const tag = el.tagName.toLowerCase();
          const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 100) : '';
          const id = el.id || '';
          darkContainers.push({ tag, id, cls, bg: cs.backgroundColor, w: Math.round(rect.width), h: Math.round(rect.height), text: (el.innerText||'').slice(0,40) });
          if (darkContainers.length > 15) break;
        }

        // Low contrast text
        const lowContrast = [];
        const textEls = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,a,label,span,button,.btn,li,td,th,strong')).slice(0, 2500);
        for (const el of textEls) {
          if (!el.innerText || !el.innerText.trim()) continue;
          const rect = el.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > 800) continue;
          if (rect.width < 30) continue;
          const cs = getComputedStyle(el);
          const bgM = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
          let alpha = 1;
          if (bgM) { const p = bgM[1].split(',').map(s=>s.trim()); if (p.length===4) alpha=parseFloat(p[3]); }
          if (alpha < 0.3) continue;
          const bgL = lightness(cs.backgroundColor);
          const txtL = lightness(cs.color);
          if (bgL === null || txtL === null) continue;
          if (bgL > 0.88 && txtL > 0.82) {
            lowContrast.push({ tag: el.tagName.toLowerCase(), text: el.innerText.slice(0,60), bg: cs.backgroundColor, color: cs.color, kind:'light-on-light' });
          }
          if (bgL < 0.22 && txtL < 0.30) {
            lowContrast.push({ tag: el.tagName.toLowerCase(), text: el.innerText.slice(0,60), bg: cs.backgroundColor, color: cs.color, kind:'dark-on-dark' });
          }
          if (lowContrast.length > 10) break;
        }

        // Inputs missing visible border (light bg + no border on light page)
        const invisibleInputs = [];
        const inputs = Array.from(document.querySelectorAll('input[type=text],input[type=email],input[type=password],input[type=tel],input[type=search],input[type=number],select,textarea')).slice(0, 60);
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
          if (bgL > 0.9 && bw < 1 && alpha > 0.5) {
            invisibleInputs.push({ type: el.type || el.tagName.toLowerCase(), bg: cs.backgroundColor, border: cs.border });
          }
        }

        return { bodyBg, bodyColor, darkContainers, lowContrast, invisibleInputs, title: document.title, location: window.location.pathname };
      });

      results.push({ name, url, status: resp ? resp.status() : null, errs, analysis });
      console.log(`OK ${name} -> ${resp ? resp.status() : '?'} title="${analysis.title.slice(0,60)}" path=${analysis.location} dark=${analysis.darkContainers.length} lowC=${analysis.lowContrast.length} ghostInp=${analysis.invisibleInputs.length}`);
    } catch (e) {
      results.push({ name, url, error: e.message, errs });
      console.log(`ERR ${name} -> ${e.message}`);
    }
  }

  await browser.close();
  require('fs').writeFileSync(path.join(OUT_DIR, 'report-auth.json'), JSON.stringify(results, null, 2));
  console.log('Report saved to report-auth.json');
})();
