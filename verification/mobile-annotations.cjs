// Focus/viewport regression checks. Native phone selection handles and keyboards
// still require physical-device verification; DOM selections here are assisted.
const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const engine = process.env.HANDOUT_BROWSER || 'edge';
const baseline = process.env.HANDOUT_BASELINE === '1';
const out = path.join(__dirname, 'annotations', engine);
fs.mkdirSync(out, { recursive: true });
const server = require('node:http').createServer((req, res) => {
  const file = path.resolve(root, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
const results = [];
const record = (name, detail) => { results.push({ name, detail }); console.log(name, JSON.stringify(detail)); };
const q1 = 'main > section:nth-of-type(2) > p:first-of-type';
async function select(page, selector = q1) {
  await page.locator(selector).evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => { getSelection().removeAllRanges(); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.evaluate(selector => {
    const el = document.querySelector(selector), node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const r = document.createRange(); r.setStart(node, 1); r.setEnd(node, Math.min(45, node.length));
    getSelection().removeAllRanges(); getSelection().addRange(r);
  }, selector);
  await page.locator('#annotation-actions').waitFor({ state: 'visible' });
}
const position = page => page.evaluate(selector => ({ y: scrollY, passageTop: document.querySelector(selector).getBoundingClientRect().top, focus: document.activeElement.id || document.activeElement.tagName, panelOpen: document.getElementById('my-annotations').open }), q1);
const unchanged = (before, after) => assert(Math.abs(before.passageTop - after.passageTop) < 3, JSON.stringify({ before, after }));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await (engine === 'edge' ? chromium : webkit).launch(engine === 'edge' ? { channel: 'msedge', headless: true } : { headless: true });
    const context = await browser.newContext({ viewport: { width: 375, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); page.on('dialog', d => d.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.waitForSelector('#annotation-ui');
    await select(page);
    const before = await position(page);
    const geometry = await page.locator('#annotation-actions').evaluate(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, viewport: innerHeight, position: getComputedStyle(el).position }));
    await page.locator('#annotation-actions [data-action="highlight"]').tap();
    const afterHighlight = await position(page);
    // Reselect the same passage, adding a note to the existing highlight.
    await select(page);
    const beforeNote = await position(page);
    await page.locator('#annotation-actions [data-action="note"]').tap();
    const opened = await position(page);
    await page.locator('#annotation-comment').fill('Reading position regression');
    await page.getByRole('button', { name: 'Save Note', exact: true }).tap();
    await page.waitForTimeout(250);
    const afterNote = await position(page);
    record('Long paragraph baseline', { before, geometry, afterHighlight, beforeNote, opened, afterNote });
    if (!baseline) {
      assert.equal(geometry.position, 'fixed');
      assert(geometry.top >= 0 && geometry.bottom <= geometry.viewport + 1);
      unchanged(before, afterHighlight);
      unchanged(beforeNote, opened);
      unchanged(beforeNote, afterNote);
      assert.equal(afterNote.panelOpen, false);
      assert.equal(await page.locator('#annotation-actions').isVisible(), false);
    }
    if (baseline) return;
    await page.locator('#annotation-summary').tap();
    await select(page, '#introductory > p:first-of-type');
    const openPanelBefore = await position(page);
    await page.locator('#annotation-actions [data-action="highlight"]').tap();
    unchanged(openPanelBefore, await position(page));
    record('Body annotation with My Annotations already open preserves layout', { before: openPanelBefore, after: await position(page) });
    await page.locator('#annotation-summary').tap();
    const key = 'exp-2026-10-26.annotations.v1';
    const id = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).annotations[0].id, key);
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const size of [100, 150]) {
        await page.locator('#reading-preferences > summary').tap();
        await page.locator('#reading-size').fill(String(size)); await page.locator('#reading-size').dispatchEvent('change');
        await page.locator('#reading-preferences > summary').tap();
        // Locate the longest real paragraph; no content is inserted or changed.
        const longest = await page.locator('main > section > p').evaluateAll(elements => elements.reduce((longest, el, i) => el.textContent.length > longest.length ? { index: i, length: el.textContent.length } : longest, { index: 0, length: 0 }));
        await page.locator('main > section > p').nth(longest.index).evaluate(el => el.dataset.testLongParagraph = 'true');
        await select(page, '[data-test-long-paragraph]');
        const bar = await page.locator('#annotation-actions').boundingBox();
        assert(bar.y >= 0 && bar.y + bar.height <= 844);
        if (width === 320 && size === 100) {
          await page.setViewportSize({ width: 844, height: 320 }); await page.waitForTimeout(100);
          if (!await page.locator('#annotation-actions').isVisible()) await select(page, '[data-test-long-paragraph]');
          const rotated = await page.locator('#annotation-actions').boundingBox();
          assert(rotated.y >= 0 && rotated.y + rotated.height <= 320);
          await page.screenshot({ path: path.join(out, 'mobile-landscape.png') });
          await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(100);
          if (!await page.locator('#annotation-actions').isVisible()) await select(page, '[data-test-long-paragraph]');
        }
        const paragraphHeight = await page.locator('[data-test-long-paragraph]').evaluate(el => el.getBoundingClientRect().height);
        const selectionText = await page.evaluate(() => getSelection().toString());
        if (width === 320 && size === 150) {
          await page.addScriptTag({ path: path.join(process.env.LOCALAPPDATA, 'Programs/Quarto/share/formats/html/axe/axe.min.js') });
          const audit = await page.evaluate(() => axe.run('#annotation-actions', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
          fs.writeFileSync(path.join(out, 'mobile-toolbar-accessibility.json'), JSON.stringify(audit, null, 2));
          assert.deepEqual(audit.violations.map(v => v.id), []);
        }
        await page.locator('#annotation-actions [data-action="dismiss"]').tap();
        await page.waitForTimeout(250);
        assert.equal(await page.locator('#annotation-actions').isVisible(), false);
        // A new exact selection remains eligible after dismissal.
        await select(page, '[data-test-long-paragraph]');
        await page.locator('#annotation-actions [data-action="note"]').tap();
        assert((await page.locator('#annotation-editor-quote').textContent()).includes(selectionText.trim()));
        await page.keyboard.press('Shift+Tab');
        assert(await page.evaluate(() => document.getElementById('annotation-editor').contains(document.activeElement)));
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'annotation-comment');
        await page.keyboard.press('Tab');
        assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY');
        // Native modal Tab cycle must stay inside the dialog.
        for (let i = 0; i < 9; i++) {
          await page.keyboard.press('Tab');
          assert(await page.evaluate(() => document.getElementById('annotation-editor').contains(document.activeElement)));
        }
        await page.locator('#annotation-comment').fill('Cancelled draft');
        await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
        await page.waitForFunction(() => !document.getElementById('annotation-editor').open);
        await page.locator('[data-test-long-paragraph]').evaluate(el => delete el.dataset.testLongParagraph);
        await page.locator('#annotation-summary').tap();
        const item = page.locator(`#annotation-${id}`);
        await item.scrollIntoViewIfNeeded();
        const row = await item.locator('.annotation-row').evaluate(el => {
          const boxes = [...el.children].map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; });
          return { boxes, overflow: document.documentElement.scrollWidth > innerWidth, clipped: [...el.querySelectorAll('button,summary,span')].some(e => e.scrollWidth > e.clientWidth + 1) };
        });
        assert.equal(row.boxes.length, 4);
        assert(row.boxes.every(b => Math.abs(b.top - row.boxes[0].top) < 1 && b.width >= 24 && b.height >= 44), JSON.stringify(row));
        assert(!row.overflow && !row.clipped, JSON.stringify(row));
        const listPosition = await position(page);
        const entryTop = (await item.boundingBox()).y;
        await item.getByRole('button', { name: 'Edit Note' }).tap();
        await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
        await page.waitForFunction(() => document.activeElement.dataset.action === 'note');
        unchanged(listPosition, await position(page));
        page.removeAllListeners('dialog'); page.once('dialog', d => d.dismiss());
        await item.getByRole('button', { name: 'Remove Highlight' }).tap();
        assert(Math.abs(entryTop - (await item.boundingBox()).y) < 3);
        assert.equal(await item.count(), 1);
        page.on('dialog', d => d.accept());
        await item.locator('.annotation-more > summary').tap();
        await page.keyboard.press('Escape');
        assert.equal(await item.locator('.annotation-more').getAttribute('open'), null);
        await item.locator('.annotation-more > summary').focus(); await page.keyboard.press('Enter');
        if (width === 320 && size === 150) {
          await page.addScriptTag({ path: path.join(process.env.LOCALAPPDATA, 'Programs/Quarto/share/formats/html/axe/axe.min.js') });
          const audit = await page.evaluate(() => axe.run('#annotation-ui', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
          fs.writeFileSync(path.join(out, 'mobile-accessibility.json'), JSON.stringify(audit, null, 2));
          assert.deepEqual(audit.violations.map(v => v.id), []);
        }
        // Declining confirmation leaves the existing record intact.
        page.removeAllListeners('dialog'); page.once('dialog', d => d.dismiss());
        await item.getByRole('button', { name: 'Delete Annotation' }).tap();
        assert.equal(await item.count(), 1);
        page.on('dialog', d => d.accept());
        await page.keyboard.press('Escape');
        await item.screenshot({ path: path.join(out, `row-${width}-${size}.png`) });
        await item.getByRole('button', { name: 'Go to passage' }).tap();
        assert.equal(await page.evaluate(() => document.activeElement.tagName), 'P');
        assert(Math.abs((await position(page)).y - listPosition.y) > 100);
        await page.locator('#annotation-summary').tap();
        record(`Mobile ${width}px / ${size}%`, { paragraphHeight, row });
      }
    }
    // Synthetic visualViewport resizing is geometry coverage, not a real OS
    // keyboard. Exercise the same event path while editing a cached target.
    await select(page);
    await page.locator('#annotation-actions [data-action="note"]').tap();
    const beforeKeyboard = await position(page);
    await page.evaluate(() => {
      const v = visualViewport;
      Object.defineProperties(v, { height: { configurable: true, value: 330 }, offsetTop: { configurable: true, value: 30 } });
      v.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    const editor = await page.locator('#annotation-editor').boundingBox();
    assert(editor.y >= 30 && editor.y + editor.height <= 360);
    const field = await page.locator('#annotation-comment').boundingBox();
    assert(field.y >= editor.y && field.y + field.height <= editor.y + editor.height);
    await page.locator('#annotation-editor').screenshot({ path: path.join(out, 'keyboard-geometry.png') });
    await page.evaluate(() => { delete visualViewport.height; delete visualViewport.offsetTop; visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('annotation-editor').open);
    unchanged(beforeKeyboard, await position(page));
    record('Synthetic keyboard visualViewport geometry and Escape restoration', editor);
    await context.close();

    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const desk = await desktop.newPage();
    await desk.goto(`http://127.0.0.1:${server.address().port}/`); await desk.waitForSelector('#annotation-ui');
    await select(desk);
    await desk.evaluate(() => document.addEventListener('copy', event => window.testCopy = { text: getSelection().toString(), prevented: event.defaultPrevented }, { once: true }));
    await desk.keyboard.press('Control+C');
    assert(await desk.evaluate(() => !!window.testCopy?.text && !window.testCopy.prevented));
    const coordinates = await desk.evaluate(() => {
      const bar = document.getElementById('annotation-actions').getBoundingClientRect();
      const r = getSelection().getRangeAt(0).getClientRects()[0];
      return { placement: document.getElementById('annotation-actions').dataset.placement, bar: { top: bar.top, bottom: bar.bottom, left: bar.left, right: bar.right }, selection: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } };
    });
    assert(coordinates.bar.top >= 0 && coordinates.bar.bottom <= 1000 && coordinates.bar.right <= 1440);
    if (coordinates.placement === 'right') assert(coordinates.bar.left >= coordinates.selection.right);
    if (coordinates.placement === 'left') assert(coordinates.bar.right <= coordinates.selection.left);
    await desk.screenshot({ path: path.join(out, 'desktop-contextual.png') });
    await desk.keyboard.press('Alt+Shift+A');
    assert.notEqual(await desk.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
    await desk.keyboard.press('Tab'); await desk.keyboard.press('Enter');
    await desk.locator('#annotation-comment').fill('Desktop location check');
    const deskBefore = await position(desk);
    await desk.getByRole('button', { name: 'Save Note', exact: true }).click();
    await desk.waitForFunction(() => !document.getElementById('annotation-editor').open);
    unchanged(deskBefore, await position(desk));
    await desk.setViewportSize({ width: 900, height: 650 });
    record('Desktop contextual coordinates, keyboard focus, note save', coordinates);
    await desktop.close();
  } finally {
    fs.writeFileSync(path.join(out, baseline ? 'scroll-baseline.json' : 'mobile-refinements.json'), JSON.stringify(results, null, 2));
    if (browser) await browser.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
