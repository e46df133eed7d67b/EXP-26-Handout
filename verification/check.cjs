// Local browser verification. Requires Playwright only for development/testing.
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = process.env.HANDOUT_BROWSER || 'edge';
const reportDir = process.env.HANDOUT_REPORT_DIR ? path.resolve(process.env.HANDOUT_REPORT_DIR) : __dirname;
fs.mkdirSync(reportDir, { recursive: true });
let url = process.env.HANDOUT_URL;
const choose = (page, name, value) => page.locator(`input[type="radio"][name="${name}"][value="${value}"]`).check();
const key = 'exp-2026-10-26.reading.v1';
const results = [];
// Quarto's own ResizeObserver can emit this WebKit layout diagnostic during
// rapid resize/font changes. Keep it visible in evidence; do not treat it as an
// annotation exception or suppress any other error.
const resizeDiagnostic = message => message.endsWith('ResizeObserver loop completed with undelivered notifications.');
const record = (name, data = 'passed') => { results.push({ name, result: data }); console.log(name, JSON.stringify(data)); };
const metrics = page => page.evaluate(() => {
  const main = document.querySelector('main');
  const p = main.querySelector('section p');
  const s = getComputedStyle(p);
  return { font: s.fontFamily, size: s.fontSize, line: s.lineHeight, color: s.color,
    background: getComputedStyle(document.body).backgroundColor,
    width: main.getBoundingClientRect().width,
    scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth };
});
const content = page => page.evaluate(() => ({
  sections: [...document.querySelectorAll('main > section')].map(s => ({ id: s.id, text: s.textContent })),
  links: [...document.querySelectorAll('main > section a:not(.anchorjs-link)')].map(a => a.getAttribute('href')),
  toc: [...document.querySelectorAll('#TOC a')].map(a => a.getAttribute('href'))
}));

(async () => {
  // Serve inside the test process so browser and server share the same sandbox.
  const root = path.resolve(__dirname, '..');
  const server = require('node:http').createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/' + (process.env.HANDOUT_TEST_HTML || 'index.html') : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  if (!url) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/`;
  }
  const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit' ? { headless: true } : { channel: 'msedge', headless: true });
  record('Browser', { engine, version: browser.version() });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => requests.push(r.url()));
    await page.goto(url + 'baseline.html');
    const baseline = await metrics(page);
    let original = await content(page);
    // A caller may choose the current rendered source as the content reference
    // when the historical typography fixture predates an author's text edit.
    // Read it without JS, so this still detects any runtime text/link mutation.
    if (process.env.HANDOUT_CONTENT_REFERENCE) {
      const plainContext = await browser.newContext({ javaScriptEnabled: false });
      const plain = await plainContext.newPage();
      await plain.goto(url + process.env.HANDOUT_CONTENT_REFERENCE);
      original = await content(plain);
      await plainContext.close();
      record('Content reference (without JavaScript)', process.env.HANDOUT_CONTENT_REFERENCE);
    }
    await page.screenshot({ path: path.join(reportDir, 'baseline-desktop.png') });
    await page.goto(url);
    await page.waitForSelector('#reading-preferences');
    assert.deepEqual(await content(page), original);
    assert.deepEqual(await metrics(page), baseline);
    assert.equal(await page.locator('#reading-preferences').getAttribute('open'), null);
    assert.equal(requests.filter(r => /\.ttf/.test(r)).length, 0);
    record('Original text, links, TOC, default typography and width preserved', baseline);
    await page.screenshot({ path: path.join(reportDir, 'desktop-default.png') });

    await page.locator('#reading-preferences summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#reading-preferences').getAttribute('open'), '');
    await page.evaluate(() => document.fonts.load('1em "Atkinson Hyperlegible"'));
    assert(requests.some(r => r.endsWith('AtkinsonHyperlegible-Regular.ttf')));
    assert(await page.locator('.reading-sample-atkinson').evaluate(el => getComputedStyle(el).fontFamily.includes('Atkinson Hyperlegible')));
    record('Atkinson preview loads on expansion; no font fetched while initially collapsed');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#reading-preferences').getAttribute('open'), null);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reading-size');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#reading-size').inputValue(), '105');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reading-font-sans');
    record('Keyboard expansion, slider, and focus order');
    await choose(page, 'font', 'serif');
    await choose(page, 'spacing', 'spacious');
    await choose(page, 'width', 'narrow');
    await choose(page, 'appearance', 'dark');
    const personalized = await metrics(page);
    assert(personalized.font.includes('Georgia'));
    assert(parseFloat(personalized.line) / parseFloat(personalized.size) > 1.79);
    assert.equal(personalized.background, 'rgb(33, 37, 41)');
    await page.reload();
    assert.deepEqual(await metrics(page), personalized);
    assert.equal(await page.locator('#reading-preferences').getAttribute('open'), null);
    record('All preferences persist across refresh', personalized);
    await page.locator('#reading-preferences > summary').click();
    await choose(page, 'font', 'atkinson');
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.fonts.check('17px "Atkinson Hyperlegible"')));
    assert(requests.some(r => r.endsWith('AtkinsonHyperlegible-Regular.ttf')));
    record('Atkinson body and preview use the local font', requests.filter(r => /\.ttf/.test(r)));
    await page.locator('#reading-reset').click();
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), null);
    assert.deepEqual(await metrics(page), baseline);
    for (const [spacing, ratio] of [['compact', 1.35], ['normal', 1.5], ['spacious', 1.8]]) {
      await choose(page, 'spacing', spacing);
      const m = await metrics(page);
      assert(Math.abs(parseFloat(m.line) / parseFloat(m.size) - ratio) < 0.01);
    }
    await page.locator('#reading-reset').click();
    record('All line-spacing choices');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.bsTheme === 'dark');
    assert.equal(await page.locator('html').getAttribute('data-bs-theme'), 'dark');
    await choose(page, 'appearance', 'light');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await page.locator('html').getAttribute('data-bs-theme'), 'light');
    await page.locator('#reading-reset').click();
    assert.equal(await page.locator('html').getAttribute('data-bs-theme'), 'dark');
    record('Reset, live system appearance, and explicit override');

    const layouts = [];
    for (const width of [320, 375, 390, 768, 820, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      for (const size of [85, 100, 150]) {
        const widths = {};
        await page.locator('#reading-size').fill(String(size));
        await page.locator('#reading-size').dispatchEvent('change');
        for (const measure of ['narrow', 'standard', 'wide']) {
          await choose(page, 'width', measure);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const m = await metrics(page);
          layouts.push({ width, size, measure, main: m.width, scroll: m.scrollWidth });
          widths[measure] = m.width;
          assert(m.scrollWidth <= width + 1, `Overflow: ${JSON.stringify(layouts.at(-1))}`);
          const clipped = await page.locator('.reading-option-face').evaluateAll(options => options.some(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1));
          assert.equal(clipped, false, 'Option labels/previews must not clip');
          const overlap = await page.locator('.reading-option').evaluateAll(options => options.some(option => {
            const radio = option.querySelector('input').getBoundingClientRect();
            const preview = option.querySelector('.reading-preview').getBoundingClientRect();
            return radio.bottom > preview.top + 0.5;
          }));
          assert.equal(overlap, false, 'Native radio dots must stay above the preview area');
        }
        if (width >= 768) {
          assert(widths.narrow < widths.standard, `Narrow must reduce width: ${JSON.stringify(widths)}`);
          assert(widths.wide >= widths.standard, `Wide must increase available width: ${JSON.stringify(widths)}`);
        }
      }
    }
    record('Responsive matrix (63 combinations)', layouts);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(reportDir, 'mobile-large-dark.png'), fullPage: true });
    await page.locator('#reading-preferences > summary').click();
    await page.screenshot({ path: path.join(reportDir, 'mobile-collapsed.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#reading-preferences > summary').click();
    await page.screenshot({ path: path.join(reportDir, 'desktop-preferences-dark.png') });
    const aria = await page.locator('#reading-preferences').ariaSnapshot();
    fs.writeFileSync(path.join(reportDir, 'preferences-accessibility.txt'), aria);
    record('Accessibility tree', aria);
    if (engine !== 'webkit') {
      const cdp = await context.newCDPSession(page);
      const dom = await cdp.send('DOM.getDocument');
      const summary = await cdp.send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '#reading-preferences summary' });
      const ax = await cdp.send('Accessibility.getPartialAXTree', { nodeId: summary.nodeId });
      record('Native disclosure accessibility', ax.nodes.map(n => ({ role: n.role?.value, name: n.name?.value, ignored: n.ignored, properties: n.properties })));
    }
    await page.addScriptTag({ path: path.join(process.env.LOCALAPPDATA, 'Programs/Quarto/share/formats/html/axe/axe.min.js') });
    for (const mode of ['light', 'dark']) {
      await choose(page, 'appearance', mode);
      const audit = await page.evaluate(() => axe.run('#reading-preferences', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
      fs.writeFileSync(path.join(reportDir, `accessibility-${mode}.json`), JSON.stringify(audit, null, 2));
      assert.deepEqual(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
      record(`Automated accessibility audit (${mode}, expanded panel)`, { violations: audit.violations.length, passes: audit.passes.length, manualReview: audit.incomplete.length });
    }
    assert.deepEqual(await content(page), original);
    assert.equal(requests.filter(r => !r.startsWith(url)).length, 0);
    assert.deepEqual(errors.filter(message => !resizeDiagnostic(message)), []);
    record('No external page requests or runtime exceptions', { resizeObserverDiagnostics: errors.filter(resizeDiagnostic).length });

    // The old preference schema must restore both styles and native selections.
    const legacy = { size: 125, font: 'serif', appearance: 'dark', spacing: 'spacious', width: 'wide' };
    await page.evaluate(({ key, legacy }) => localStorage.setItem(key, JSON.stringify(legacy)), { key, legacy });
    await page.reload();
    assert.equal(await page.locator('#reading-size').inputValue(), '125');
    for (const name of ['font', 'appearance', 'spacing', 'width']) {
      assert.equal(await page.locator(`input[name="${name}"]:checked`).inputValue(), legacy[name]);
    }
    await page.locator('#reading-preferences > summary').click();
    for (const [name, values] of Object.entries({ font: ['sans', 'serif', 'atkinson'], appearance: ['system', 'light', 'dark'], spacing: ['compact', 'normal', 'spacious'], width: ['narrow', 'standard', 'wide'] })) {
      for (const value of values) {
        await choose(page, name, value);
        await page.reload();
        assert.equal(await page.locator(`input[name="${name}"]:checked`).inputValue(), value);
        assert.equal(await page.evaluate(({ key, name }) => JSON.parse(localStorage.getItem(key))[name], { key, name }), value);
        await page.locator('#reading-preferences > summary').click();
      }
    }
    await page.locator('#reading-reset').click();
    for (const [name, value] of Object.entries({ font: 'sans', appearance: 'system', spacing: 'normal', width: 'standard' })) {
      assert.equal(await page.locator(`input[name="${name}"]:checked`).inputValue(), value);
      const current = page.locator(`input[name="${name}"]:checked`);
      await current.focus();
      await page.keyboard.press('ArrowRight');
      assert.notEqual(await page.locator(`input[name="${name}"]:checked`).inputValue(), value);
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator(`input[name="${name}"]:checked`).inputValue(), value);
      assert.notEqual(await current.locator('..').locator('.reading-option-face').evaluate(el => getComputedStyle(el).outlineStyle), 'none', JSON.stringify(await page.evaluate(() => ({ active: document.activeElement.id, focused: [...document.querySelectorAll('input[type="radio"]:focus')].map(el => ({ id: el.id, visible: el.matches(':focus-visible') })) }))));
    }
    record('Legacy saved choices, every radio option persists, visual reset, and native arrow navigation');

    for (const mode of ['light', 'dark']) {
      await choose(page, 'appearance', mode);
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.locator('#reading-preferences').screenshot({ path: path.join(reportDir, `panel-${mode}-desktop.png`) });
      for (const width of [320, 375, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.locator('#reading-size').fill('150');
        await page.locator('#reading-size').dispatchEvent('change');
        await page.locator('#reading-preferences').screenshot({ path: path.join(reportDir, `panel-${mode}-${width}-150.png`) });
      }
      await page.locator('#reading-size').fill('100');
      await page.locator('#reading-size').dispatchEvent('change');
    }
    const diagrams = await page.locator('input[name="spacing"], input[name="width"]').evaluateAll(inputs => inputs.map(input => ({
      group: input.name, value: input.value,
      lines: [...input.nextElementSibling.querySelectorAll('line')].map(line => ['x1', 'x2', 'y1', 'y2'].map(a => Number(line.getAttribute(a))))
    })));
    assert(diagrams.every(d => d.lines.length === 3));
    assert(diagrams.filter(d => d.group === 'spacing').every(d => d.lines.every(([x1, x2]) => x1 === 8 && x2 === 56)));
    assert(diagrams.filter(d => d.group === 'width').every(d => d.lines.map(l => l[2]).join(',') === '11,20,29'));
    record('Each spacing/width diagram has exactly three lines with the requested invariant geometry', diagrams);

    // Disabled scripts leave a normal, fully readable Quarto handout.
    const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const plain = await noJS.newPage();
    await plain.goto(url);
    assert.deepEqual(await content(plain), original);
    assert.equal(await plain.locator('#reading-preferences').isVisible(), false);
    const plainMetrics = await metrics(plain);
    assert(plainMetrics.scrollWidth <= plainMetrics.viewport);
    await plain.screenshot({ path: path.join(reportDir, 'mobile-no-javascript.png') });
    record('No JavaScript: full content, TOC and links preserved');

    for (const failure of ['denied', 'quota', 'malformed']) {
      const restricted = await browser.newContext();
      await restricted.addInitScript(({ failure, key }) => {
        if (failure === 'denied') Object.defineProperty(window, 'localStorage', { get() { throw Object.assign(new Error('Denied'), { name: 'SecurityError' }); } });
        if (failure === 'quota') Storage.prototype.setItem = () => { throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' }); };
        if (failure === 'malformed') localStorage.setItem(key, '{broken');
      }, { failure, key });
      const test = await restricted.newPage();
      const failures = [];
      test.on('pageerror', e => failures.push(e.stack || e.name + ': ' + e.message));
      await test.goto(url + 'baseline.html');
      await test.waitForLoadState('networkidle');
      const inherited = failures.splice(0);
      await test.goto(url);
      await test.waitForLoadState('networkidle');
      await test.locator('#reading-preferences > summary').click();
      await choose(test, 'appearance', 'dark');
      await choose(test, 'font', 'serif');
      assert.equal(await test.locator('html').getAttribute('data-bs-theme'), 'dark');
      assert((await metrics(test)).font.includes('Georgia'));
      const runtimeFailures = failures.filter(message => !resizeDiagnostic(message));
      if (runtimeFailures.length) assert(inherited.length > 0, 'Errors must also occur in original Quarto page');
      assert(runtimeFailures.every(stack => stack.includes('/index_files/libs/quarto-html/') && stack.includes(failure === 'quota' ? 'Full' : 'Denied')), JSON.stringify({ inherited, failures }));
      if (failure !== 'malformed') assert((await test.locator('#reading-storage').innerText()).includes('unavailable'));
      await restricted.close();
      record(`Storage ${failure}: preferences still usable`, { preferenceErrors: 0, originalQuartoErrors: inherited.length, quartoErrorsAfterInteraction: runtimeFailures.length, resizeObserverDiagnostics: failures.filter(resizeDiagnostic).length });
    }
    await page.emulateMedia({ forcedColors: 'active' });
    await page.locator('#reading-preferences > summary').focus();
    await page.keyboard.press('Tab');
    assert.notEqual(await page.locator('#reading-size').evaluate(e => getComputedStyle(e).outlineStyle), 'none');
    record('Forced colors retains keyboard focus outline');
    await page.locator('input[name="font"]:checked').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('input[name="font"]:checked + .reading-option-face').evaluate(el => getComputedStyle(el).borderStyle), 'double');
    await page.locator('#reading-preferences').screenshot({ path: path.join(reportDir, 'panel-forced-colors.png') });
    record('Radio selected state and focus in forced colors');
    fs.writeFileSync(path.join(reportDir, 'browser-results.json'), JSON.stringify(results, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
