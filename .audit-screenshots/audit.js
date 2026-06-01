// Audit script - uses globally installed playwright via @playwright/cli node_modules
const path = require('path');
const PLAYWRIGHT_PATH = 'C:/Users/Usuario/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const OUT_DIR = path.resolve(__dirname);

const urls = [
  ['index',                 'http://localhost:8765/index.html'],
  ['login',                 'http://localhost:8765/login.html'],
  ['signup',                'http://localhost:8765/signup.html'],
  ['mi-cuenta',             'http://localhost:8765/mi-cuenta.html'],
  ['upgrade-pro',           'http://localhost:8765/upgrade-pro.html'],
  ['iapanel-hub',           'http://localhost:8765/iapanel/index.html'],
  ['iapanel-estudio',       'http://localhost:8765/iapanel/estudio/index.html'],
  ['iapanel-estudio-recargas', 'http://localhost:8765/iapanel/estudio/recargas.html'],
  ['iapanel-estudio-admin', 'http://localhost:8765/iapanel/estudio/admin.html'],
  ['iapanel-tienda-admin',  'http://localhost:8765/iapanel/tienda/admin/index.html'],
  ['dashboard',             'http://localhost:8765/dashboard/index.html'],
  ['verificar',             'http://localhost:8765/verificar.html'],
  ['cuenta-cancelada',      'http://localhost:8765/cuenta-cancelada.html'],
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/Usuario/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleErrors = {};
  page.on('pageerror', e => {
    consoleErrors[page.url()] = (consoleErrors[page.url()] || []);
    consoleErrors[page.url()].push('PAGEERR: ' + e.message);
  });

  const results = [];

  for (const [name, url] of urls) {
    const errs = [];
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
    page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errs.push('CONSOLE_ERR: ' + msg.text().slice(0, 200));
    });

    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(800); // let CSS settle

      const file = path.join(OUT_DIR, name + '.png');
      await page.screenshot({ path: file, fullPage: false });

      // Heuristics: sample background colors from <body>, header, sidebar, main content
      const analysis = await page.evaluate(() => {
        function rgbToHsl(rgb) {
          const m = rgb.match(/\d+(\.\d+)?/g);
          if (!m) return null;
          const [r, g, b] = m.slice(0, 3).map(Number);
          return { r, g, b, a: m[3] !== undefined ? Number(m[3]) : 1 };
        }
        function lightness(rgb) {
          const c = rgbToHsl(rgb);
          if (!c) return null;
          return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
        }
        const body = document.body;
        const bodyBg = getComputedStyle(body).backgroundColor;
        const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
        const bodyColor = getComputedStyle(body).color;
        const bodyLight = lightness(bodyBg);
        const textLight = lightness(bodyColor);

        // Find common containers
        const queries = [
          'header', 'nav', '.sidebar', '.app-sidebar', '.topbar', '.app-topbar',
          '.hero', 'main', '.dashboard-main', '.panel', '.card', '.btn-primary',
          'button[type=submit]', '.cta', '.modal'
        ];
        const samples = [];
        const seen = new Set();
        for (const q of queries) {
          const els = document.querySelectorAll(q);
          els.forEach((el, i) => {
            if (i > 1) return;
            const key = q + '#' + i;
            if (seen.has(key)) return; seen.add(key);
            const cs = getComputedStyle(el);
            samples.push({
              q, bg: cs.backgroundColor, color: cs.color,
              bgL: lightness(cs.backgroundColor), txtL: lightness(cs.color),
              text: (el.innerText || '').slice(0, 40)
            });
          });
        }

        // Detect very dark backgrounds (legacy dark theme remnants)
        function isDark(rgb) {
          const c = rgbToHsl(rgb);
          if (!c) return false;
          if (c.a === 0) return false;
          const L = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
          return L < 0.2; // very dark
        }
        // Collect dark background elements that are not mockup-internals
        const allEls = Array.from(document.querySelectorAll('body *')).slice(0, 3000);
        const darkContainers = [];
        for (const el of allEls) {
          const cs = getComputedStyle(el);
          if (!isDark(cs.backgroundColor)) continue;
          // skip if inside a known mockup container
          const isInMockup = el.closest('.phone-mockup, .terminal, .device, .mockup, .screen-mockup, code, pre, .agent-bubble-dark, .dark-card, .video-thumb');
          if (isInMockup) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 80 || rect.height < 40) continue; // skip tiny
          const tag = el.tagName.toLowerCase();
          const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : '';
          darkContainers.push({ tag, cls, bg: cs.backgroundColor, w: Math.round(rect.width), h: Math.round(rect.height) });
          if (darkContainers.length > 8) break;
        }

        // Detect low-contrast text (light text on light bg)
        const lowContrast = [];
        const textEls = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,a,label,span,button,.btn,li')).slice(0, 1500);
        for (const el of textEls) {
          if (!el.innerText || !el.innerText.trim()) continue;
          const cs = getComputedStyle(el);
          const bgL = lightness(cs.backgroundColor);
          const txtL = lightness(cs.color);
          if (bgL === null || txtL === null) continue;
          // skip transparent bg
          const bgM = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
          let alpha = 1;
          if (bgM) {
            const parts = bgM[1].split(',').map(s => s.trim());
            if (parts.length === 4) alpha = parseFloat(parts[3]);
          }
          if (alpha < 0.1) continue;
          // both light (white text on white)
          if (bgL > 0.85 && txtL > 0.7) {
            lowContrast.push({
              tag: el.tagName.toLowerCase(),
              text: el.innerText.slice(0, 50),
              bg: cs.backgroundColor, color: cs.color
            });
          }
          // dark text on dark bg
          if (bgL < 0.25 && txtL < 0.3 && alpha > 0.5) {
            lowContrast.push({
              tag: el.tagName.toLowerCase(),
              text: el.innerText.slice(0, 50),
              bg: cs.backgroundColor, color: cs.color,
              kind: 'dark-on-dark'
            });
          }
          if (lowContrast.length > 6) break;
        }

        return {
          bodyBg, htmlBg, bodyColor, bodyLight, textLight,
          samples, darkContainers, lowContrast,
          title: document.title
        };
      });

      results.push({ name, url, status: resp ? resp.status() : null, errs, analysis });
      console.log(`OK ${name} -> ${resp ? resp.status() : '?'}`);
    } catch (e) {
      results.push({ name, url, error: e.message, errs });
      console.log(`ERR ${name} -> ${e.message}`);
    }
  }

  await browser.close();

  require('fs').writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(results, null, 2));
  console.log('Report saved to report.json');
})();
