// Real Range/Selection integration with assisted mobile selections. No test
// below claims to reproduce native phone handles, menus, or software keyboards.
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), engine = process.env.HANDOUT_BROWSER || 'edge';
const out = path.join(__dirname, 'unified', engine); fs.mkdirSync(out, { recursive: true });
const key = 'exp-2026-10-26.annotations.v1', results = [];
const record = (name, detail = 'passed') => { results.push({ name, detail }); console.log(name, JSON.stringify(detail)); };
const server = require('node:http').createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => { if (err) return res.writeHead(404).end(); res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream'); res.end(data); });
});
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const markCount = page => page.evaluate(() => CSS.highlights.get('handout-highlights').size);
const p = '#introductory > p:first-of-type';
async function select(page, start = 1, end = 35, selector = p, block = 'center') {
  await page.locator(selector).evaluate((el, block) => el.scrollIntoView({ block }), block);
  await page.evaluate(() => { document.activeElement.blur(); getSelection().removeAllRanges(); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
  const beforeY = await page.evaluate(() => scrollY);
  await page.evaluate(({ selector, start, end }) => {
    const point = offset => { const walker = document.createTreeWalker(document.querySelector(selector), NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode())) { if (offset <= node.length) return [node, offset]; offset -= node.length; } throw Error('range offset'); };
    const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(end)); getSelection().addRange(range);
  }, { selector, start, end });
  await page.locator('#annotation-actions').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => scrollY), beforeY, 'Toolbar appearance scrolled the page');
}
const act = (page, action) => page.locator(`#annotation-actions [data-action="${action}"]`).click();
const save = async (page, text) => { await page.locator('#annotation-comment').fill(text); await page.getByRole('button', { name: 'Save Note', exact: true }).click(); await page.waitForFunction(() => !document.getElementById('annotation-editor').open); };
const cancel = async page => { await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.waitForFunction(() => !document.getElementById('annotation-editor').open); };
const counters = page => page.evaluate(() => ({ builds: window.testBuilds || 0, resolves: window.testResolves || 0, rects: window.testRects || 0 }));
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
  try {
    browser = await (engine === 'edge' ? chromium : webkit).launch(engine === 'edge' ? { channel: 'msedge', headless: true } : { headless: true });
    record('Browser', browser.version());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/assets/annotation-anchors.js', route => {
      const code = fs.readFileSync(path.join(root, 'assets/annotation-anchors.js'), 'utf8').replace('export async function buildIndex(main) {', 'export async function buildIndex(main) { globalThis.testBuilds = (globalThis.testBuilds || 0) + 1;').replace('export function resolveAnchor(index, anchor) {', 'export function resolveAnchor(index, anchor) { globalThis.testResolves = (globalThis.testResolves || 0) + 1;');
      return route.fulfill({ contentType: 'application/javascript', body: code });
    });
    await context.addInitScript(() => { const original = Range.prototype.getClientRects; Range.prototype.getClientRects = function() { window.testRects = (window.testRects || 0) + 1; return original.call(this); }; });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url); await page.waitForSelector('#annotation-ui');
    await select(page); await act(page, 'highlight');
    const first = (await saved(page)).annotations[0]; assert(first.highlighted && !first.comment);
    await select(page, 45, 75); await act(page, 'note');
    assert.equal(await markCount(page), 2); assert.equal((await saved(page)).annotations.length, 1);
    await cancel(page); await page.waitForFunction(() => CSS.highlights.get('handout-highlights').size === 1);
    await select(page, 45, 75); await act(page, 'note'); await save(page, '');
    let data = await saved(page), second = data.annotations[1]; assert(second.highlighted && !second.comment);
    await select(page, 45, 75); await act(page, 'note'); await save(page, 'Attached comment');
    data = await saved(page); assert.equal(data.annotations.length, 2); assert.equal(data.annotations[1].id, second.id);
    await select(page, 45, 75); await act(page, 'note'); await page.locator('#annotation-comment').fill('Cancelled replacement'); await cancel(page);
    assert.equal((await saved(page)).annotations[1].comment, 'Attached comment');
    await select(page, 45, 75); await act(page, 'note'); page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Delete Note' }).click();
    assert.equal((await saved(page)).annotations[1].comment, ''); assert.equal(await markCount(page), 2);
    await select(page, 45, 75); await act(page, 'note'); await save(page, 'Reattached comment');
    await page.locator('#annotation-summary').click();
    const item = page.locator(`#annotation-${second.id}`);
    page.once('dialog', d => d.dismiss()); await item.getByRole('button', { name: 'Remove Highlight' }).click();
    assert.equal((await saved(page)).annotations[1].comment, 'Reattached comment');
    page.once('dialog', d => d.accept()); await item.getByRole('button', { name: 'Remove Highlight' }).click();
    assert.equal((await saved(page)).annotations.length, 1);
    await page.locator(`#annotation-${first.id}`).getByRole('button', { name: 'Remove Highlight' }).click();
    assert.equal((await saved(page)).annotations.length, 0);
    record('Highlight-first creation, preview/cancel, optional empty note, reuse, comment removal and protected highlight deletion');

    const legacy = { ...first, highlighted: false, comment: 'Legacy note-only comment' };
    const orphan = { ...legacy, id: legacy.id + '-orphan', anchor: structuredClone(legacy.anchor) }; orphan.anchor.quote.exact = 'Z'.repeat(orphan.anchor.quote.exact.length);
    const legacyRaw = JSON.stringify({ version: 1, documentId: 'exp-handout-2026-10-26', annotations: [legacy, orphan] });
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: legacyRaw });
    await page.reload(); await page.waitForSelector('#annotation-ui');
    assert.equal(await markCount(page), 1); assert.equal(await page.evaluate(key => localStorage.getItem(key), key), legacyRaw);
    assert.equal(await page.evaluate(() => CSS.highlights.has('handout-notes')), false);
    await page.locator('#annotation-summary').click(); assert((await page.locator('#annotation-list').textContent()).includes('Unanchored'));
    assert(!(await page.locator('#annotation-list').textContent()).includes('Not highlighted'));
    await select(page); await act(page, 'note'); assert.equal(await page.locator('#annotation-comment').inputValue(), legacy.comment); await save(page, 'Legacy comment edited');
    data = await saved(page); assert.equal(data.version, 1); assert.equal(data.annotations.length, 2);
    assert.equal(data.annotations[0].id, legacy.id); assert.deepEqual(data.annotations[0].anchor, legacy.anchor); assert.equal(data.annotations[0].created, legacy.created);
    assert(data.annotations.every(a => a.highlighted)); assert.equal(data.annotations[1].comment, orphan.comment); assert.equal(data.annotations[1].modified, orphan.modified);
    await page.reload(); await page.waitForSelector('#annotation-ui'); assert.equal(await markCount(page), 1);
    record('Legacy note-only records: no write on load, same schema/IDs/anchors/metadata, comment preserved, safe explicit persistence and unanchored retention');
    await select(page, 40, 65); await page.evaluate(() => getSelection().removeAllRanges()); await page.waitForTimeout(200);
    assert.equal(await page.locator('#annotation-actions').isVisible(), false);
    record('Ended selection hides the toolbar; action/editor focus retains captured ranges');

    // 200 real passage anchors, generated through the unchanged public module.
    await page.evaluate(async key => {
      const { buildIndex, rangeForPositions, anchorForRange } = await import('/assets/annotation-anchors.js');
      const index = await buildIndex(document.querySelector('main')), annotations = [];
      const stride = Math.floor(index.text.length / 201), now = new Date().toISOString();
      for (let i = 0; i < 200; i++) { const start = i * stride + 1; annotations.push({ id: `performance-${i}`, created: now, modified: now, highlighted: true, comment: i % 4 ? '' : 'Saved note', anchor: anchorForRange(index, rangeForPositions(index, start, start + 25)) }); }
      localStorage.setItem(key, JSON.stringify({ version: 1, documentId: 'exp-handout-2026-10-26', annotations }));
    }, key);
    await page.reload(); await page.waitForSelector('#annotation-ui'); assert.equal(await markCount(page), 200);
    const before = await counters(page), started = Date.now();
    await select(page, 5, 22); const selected = await counters(page);
    await act(page, 'note'); await cancel(page); const editor = await counters(page);
    assert.equal(editor.builds, before.builds); assert(selected.resolves - before.resolves <= 2); assert(editor.resolves - before.resolves <= 6);
    await select(page, 5, 22); const beforeScroll = await counters(page);
    await page.evaluate(() => scrollBy(0, 180)); await page.waitForTimeout(250);
    assert.equal(await page.locator('#annotation-actions').isVisible(), false);
    const afterScroll = await counters(page); assert.deepEqual(afterScroll, beforeScroll);
    record('200 saved highlights: cached anchors on selection/editor, no index/anchor/Range measurements during ordinary scroll', { before, selected, editor, beforeScroll, afterScroll, assistedSelectionAndEditorMs: Date.now() - started });

    const sizes = {}, beforeFiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'unified-before.json'), 'utf8'));
    for (const [file, previous] of Object.entries(beforeFiles)) {
      const content = fs.readFileSync(path.join(root, file)), hash = crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
      if (!['assets/annotations.js', 'assets/annotations.css', 'assets/annotations-panel.html'].includes(file)) assert.equal(hash, previous.sha256, file + ' changed');
      sizes[file] = { before: previous.bytes, after: content.length, delta: content.length - previous.bytes };
    }
    record('Asset sizes and unchanged source/reading/anchoring hashes', sizes);
    assert(requests.every(r => r.startsWith(url)));
    record('Annotation asset requests remain local', [...new Set(requests.filter(r => /assets\/(annotations\.(js|css)|annotation-anchors\.js)/.test(r)).map(r => new URL(r).pathname))]);
    await context.close();

    // Placement uses genuine selected text. Offsets are chosen dynamically from
    // a real line; no handout content or artificial Range rectangles are used.
    for (const width of [320, 375, 390, 1440]) {
      const mobile = width < 1000;
      const c = await browser.newContext({ viewport: { width, height: 844 }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
      const t = await c.newPage(); t.on('pageerror', e => errors.push(e.message));
      await t.goto(url); await t.waitForSelector('#annotation-ui');
      const offsets = await t.locator(p).evaluate(el => {
        const node = el.firstChild, range = document.createRange(), lines = [];
        for (let i = 0; i < Math.min(node.length, 160); i++) { range.setStart(node, i); range.setEnd(node, i + 1); const r = range.getBoundingClientRect(); let line = lines.find(l => Math.abs(l.y - r.y) < 2); if (!line) lines.push(line = { y: r.y, start: i, end: i + 1 }); line.end = i + 1; }
        return lines;
      });
      const line = offsets[0];
      const cases = { right: [line.start + 1, line.start + 4], left: [Math.max(line.start + 1, line.end - 6), line.end - 1], bottom: [line.start, offsets[Math.min(3, offsets.length - 1)].end] };
      for (const [wanted, [start, end]] of Object.entries(cases)) {
        await select(t, start, end);
        const box = await t.locator('#annotation-actions').boundingBox(), placement = await t.locator('#annotation-actions').getAttribute('data-placement');
        assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 844, JSON.stringify({ width, wanted, box }));
        if (mobile) assert.equal(placement, wanted);
        const targets = await t.locator('#annotation-actions button').evaluateAll(elements => elements.map(el => ({ name: el.getAttribute('aria-label'), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
        assert(targets.every(e => e.name && e.width >= 44 && e.height >= 44));
        assert(await t.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await t.screenshot({ path: path.join(out, `toolbar-${width}-${wanted}.png`) });
        if (mobile && width === 320 && wanted === 'bottom') {
          await t.addScriptTag({ path: path.join(process.env.LOCALAPPDATA, 'Programs/Quarto/share/formats/html/axe/axe.min.js') });
          const audit = await t.evaluate(() => axe.run('#annotation-actions', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
          assert.deepEqual(audit.violations.map(v => v.id), []); fs.writeFileSync(path.join(out, 'toolbar-accessibility.json'), JSON.stringify(audit, null, 2));
        }
        await act(t, 'dismiss'); record(`Placement ${width}px ${wanted}`, { placement, box, targets });
      }
      if (mobile) {
        const p2 = '#introductory > p:nth-of-type(2)', length = (await t.locator(p2).textContent()).length;
        for (const [edge, selector, start, end, block] of [['top', p, 1, 4, 'start'], ['bottom', p2, length - 6, length - 1, 'end']]) {
          await select(t, start, end, selector, block);
          const box = await t.locator('#annotation-actions').boundingBox();
          assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 844);
          await t.screenshot({ path: path.join(out, `toolbar-${width}-${edge}-edge.png`) });
          await t.evaluate(() => scrollBy(0, 50)); await t.waitForTimeout(200); assert.equal(await t.locator('#annotation-actions').isVisible(), false);
        }
        record(`Screen edges and ordinary touch-scroll dismissal ${width}px`);
      }
      if (width === 320) {
        await t.locator('#reading-preferences > summary').click();
        await t.locator('#reading-size').fill('150'); await t.locator('#reading-size').dispatchEvent('change');
        await t.locator('input[name="appearance"][value="dark"]').check(); await t.locator('#reading-preferences > summary').click();
        await select(t, 1, 4); await t.screenshot({ path: path.join(out, 'toolbar-enlarged-dark.png') });
        const audit = await t.evaluate(() => axe.run('#annotation-actions', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
        assert.deepEqual(audit.violations.map(v => v.id), []);
        await t.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' }); await t.keyboard.press('Alt+Shift+A');
        const focus = await t.evaluate(() => ({ html: document.activeElement.outerHTML, outline: getComputedStyle(document.activeElement).outlineStyle, visible: document.activeElement.matches(':focus-visible'), hidden: document.getElementById('annotation-actions').hidden }));
        assert.notEqual(focus.outline, 'none', JSON.stringify(focus));
        await t.screenshot({ path: path.join(out, 'toolbar-forced-colors.png') });
        record('Enlarged dark icon toolbar audit; forced colors/reduced motion and keyboard focus', { violations: audit.violations.length });
      }
      if (engine === 'edge' && width === 375) {
        await select(t, 1, 4); const cdp = await c.newCDPSession(t); await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
        await t.keyboard.press('Alt+Shift+A');
        const box = await t.locator('#annotation-actions').boundingBox(), viewport = await t.evaluate(() => ({ left: visualViewport.offsetLeft, top: visualViewport.offsetTop, width: visualViewport.width, height: visualViewport.height }));
        assert(box.x >= viewport.left && box.y >= viewport.top && box.x + box.width <= viewport.left + viewport.width && box.y + box.height <= viewport.top + viewport.height);
        await t.screenshot({ path: path.join(out, 'toolbar-page-scale-2.png') }); record('Edge page-scale 2: toolbar stays inside visual viewport', { box, viewport });
      }
      await c.close();
    }
    const diagnostics = errors.filter(e => e === 'ResizeObserver loop completed with undelivered notifications.');
    assert.deepEqual(errors.filter(e => !diagnostics.includes(e)), []); record('Runtime checks', { unexpectedErrors: 0, resizeObserverDiagnostics: diagnostics.length });
  } finally { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); if (browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
