// Focused regressions. Uses real browser default-font settings, not root CSS overrides.
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = process.env.HANDOUT_BROWSER || 'edge';
const investigate = process.env.HANDOUT_INVESTIGATE === '1';
const reportDir = process.env.HANDOUT_REPORT_DIR ? path.resolve(process.env.HANDOUT_REPORT_DIR)
  : path.join(__dirname, 'refinements', `${engine}-${investigate ? 'before' : 'after'}`);
fs.mkdirSync(reportDir, { recursive: true });
const root = path.resolve(__dirname, '..');
const choose = (page, name, value) => page.locator(`input[type="radio"][name="${name}"][value="${value}"]`).check();
const key = 'exp-2026-10-26.reading.v1';
const results = { engine, investigate, scaling: [], loading: [] };
const server = require('node:http').createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
const size = page => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main section p')).fontSize));

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit' ? { headless: true } : { channel: 'msedge', headless: true });
    results.version = browser.version();
    if (engine === 'edge') {
      for (const browserDefault of [16, 20, 24]) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Page.setFontSizes', { fontSizes: { standard: browserDefault } });
        await page.goto(url + 'baseline.html');
        const baseline = await size(page);
        const medium = await page.evaluate(() => {
          const probe = document.createElement('span');
          probe.style.fontSize = 'medium';
          document.body.append(probe);
          const measured = parseFloat(getComputedStyle(probe).fontSize);
          probe.remove();
          return measured;
        });
        assert.equal(medium, browserDefault, 'Browser default must actually change');
        await page.goto(url);
        await page.locator('summary').click();
        for (const percentage of [100, 85, 125, 150, 100]) {
          await page.locator('#reading-size').fill(String(percentage));
          await page.locator('#reading-size').dispatchEvent('change');
          const measured = await size(page);
          results.scaling.push({ browserDefault, medium, baseline, percentage, measured, ratio: measured / baseline });
          if (!investigate) assert(Math.abs(measured - baseline * percentage / 100) < 0.01, JSON.stringify(results.scaling.at(-1)));
        }
        // Saved size must remain relative to the original baseline on reload.
        await page.locator('#reading-size').fill('125');
        await page.locator('#reading-size').dispatchEvent('change');
        await page.reload();
        if (!investigate) assert(Math.abs(await size(page) - baseline * 1.25) < 0.01);
        if (!investigate) {
          await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
          assert.equal(await page.evaluate(() => visualViewport.scale), 2);
          assert(Math.abs(await size(page) - baseline * 1.25) < 0.01);
        }
        await context.close();
      }
    } else {
      results.defaultFontSettings = 'Native browser-default override is tested via Chromium CDP only; not simulated with CSS in WebKit.';
    }
    if (!investigate) {
      results.mobileTouch = [];
      for (const width of [375, 390]) {
        const context = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width, height: 844 } });
        const page = await context.newPage();
        await page.goto(url);
        const baseline = await size(page);
        await page.locator('summary').tap();
        // Tap the label face away from the small native radio itself.
        for (const [name, value] of Object.entries({ font: 'serif', appearance: 'dark', spacing: 'spacious', width: 'wide' })) {
          await page.locator(`input[name="${name}"][value="${value}"] + .reading-option-face`).tap();
          assert.equal(await page.locator(`input[name="${name}"]:checked`).inputValue(), value);
        }
        for (const percentage of [85, 125, 150]) {
          await page.locator('#reading-size').fill(String(percentage));
          await page.locator('#reading-size').dispatchEvent('change');
          assert(Math.abs(await size(page) - baseline * percentage / 100) < 0.01);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await page.reload();
        assert.equal(await page.locator('#reading-preferences').getAttribute('open'), null);
        await page.locator('summary').tap();
        assert.equal(await page.locator('#reading-size').inputValue(), '150');
        assert.equal(await page.locator('input[name="font"]:checked').inputValue(), 'serif');
        assert.equal(await page.locator('input[name="spacing"]:checked').inputValue(), 'spacious');
        assert.equal(await page.locator('input[name="width"]:checked').inputValue(), 'wide');
        assert.equal(await page.locator('input[name="appearance"]:checked').inputValue(), 'dark');
        await page.locator('summary').tap();
        assert.equal(await page.locator('#reading-preferences').getAttribute('open'), null);
        await page.screenshot({ path: path.join(reportDir, `mobile-touch-${width}.png`) });
        results.mobileTouch.push({ width, baseline, percentages: [85, 125, 150], overflow: false, reload: 'passed', disclosureTap: 'passed' });
        await context.close();
      }
    }

    // Delay only the existing deferred preferences script. Capture an actual
    // rendered frame while it is unavailable, then allow initialization.
    for (const scenario of [
      { name: 'saved-dark', system: 'light', saved: 'dark', expected: 'dark' },
      { name: 'system-dark', system: 'dark', saved: null, expected: 'dark' },
      { name: 'saved-light', system: 'dark', saved: 'light', expected: 'light' }
    ]) {
      const context = await browser.newContext({ colorScheme: scenario.system, viewport: { width: 390, height: 844 } });
      await context.addInitScript(({ key, saved }) => {
        if (saved) localStorage.setItem(key, JSON.stringify({ appearance: saved }));
      }, { key, saved: scenario.saved });
      const page = await context.newPage();
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/assets/reading.js', async route => { await gate; await route.continue(); });
      try {
        await page.goto(url, { waitUntil: 'commit' });
        await page.waitForFunction(() => document.querySelector('main section p'));
        await page.waitForTimeout(800);
        const early = await page.evaluate(() => ({
          theme: document.documentElement.dataset.bsTheme || null,
          background: getComputedStyle(document.body).backgroundColor,
          panelHidden: document.querySelector('#reading-preferences').hidden,
          paints: performance.getEntriesByType('paint').map(e => ({ name: e.name, time: e.startTime }))
        }));
        try {
          await page.screenshot({ path: path.join(reportDir, `${scenario.name}-before-deferred.png`), timeout: 3000 });
        } catch (error) {
          if (engine !== 'webkit') throw error;
          early.screenshotLimitation = error.message;
        }
        release();
        await page.waitForLoadState('load');
        await page.waitForSelector('#reading-preferences');
        const finalTheme = await page.locator('html').getAttribute('data-bs-theme');
        results.loading.push({ scenario: scenario.name, delayMs: 800, early, finalTheme });
        assert.equal(finalTheme, scenario.expected);
        if (!investigate) {
          assert.equal(early.theme, scenario.expected);
          assert.equal(early.background, scenario.expected === 'dark' ? 'rgb(33, 37, 41)' : 'rgb(255, 255, 255)');
          assert.equal(early.panelHidden, true, 'Deferred preference code must not have run');
        }
      } finally { release(); await context.close(); }
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    fs.writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify(results, null, 2));
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
