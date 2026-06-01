// Deep scroll capture of index.html
const path = require('path');
const PLAYWRIGHT_PATH = 'C:/Users/Usuario/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/Usuario/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8765/index.html', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(1500);

  const sections = [0, 800, 1600, 2400, 3200, 4000, 4800, 5600, 6400, 7200];
  for (let i = 0; i < sections.length; i++) {
    await page.evaluate(y => window.scrollTo(0, y), sections[i]);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(__dirname, `index-scroll-${i}.png`), fullPage: false });
  }
  // Also fullpage
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'index-fullpage.png'), fullPage: true });

  await browser.close();
  console.log('Done scroll capture');
})();
