// Integration tests use the browser's actual DOM Selection/Range APIs. Emulated
// touch selections are assisted; these do not test physical selection handles.
const { chromium, firefox, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = process.env.HANDOUT_BROWSER || 'edge';
const out = path.join(__dirname, 'annotations', engine);
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(__dirname, '..');
const key = 'exp-2026-10-26.annotations.v1';
const results = [];
const record = (name, detail = 'passed') => { results.push({ name, detail }); console.log(name, JSON.stringify(detail)); };
const server = require('node:http').createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ttf': 'font/ttf' }[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const selection = async (page, selector, start = 0, end = 40, endSelector = selector, wait = true) => {
  await page.locator(selector).scrollIntoViewIfNeeded();
  // Let scroll/focus events settle, and make clearing a previous identical
  // selection a separate event turn (WebKit may otherwise coalesce it away).
  await page.evaluate(() => { getSelection().removeAllRanges(); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.evaluate(({ selector, start, end, endSelector }) => {
    document.activeElement?.blur();
    const point = (el, at) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node; while ((node = walker.nextNode())) { if (at <= node.length) return [node, at]; at -= node.length; }
      throw Error('selection offset');
    };
    const r = document.createRange();
    r.setStart(...point(document.querySelector(selector), start));
    r.setEnd(...point(document.querySelector(endSelector), end));
    getSelection().removeAllRanges(); getSelection().addRange(r);
  }, { selector, start, end, endSelector });
  if (wait) await page.locator('#annotation-actions').waitFor({ state: 'visible' });
};
const highlight = page => page.locator('#annotation-actions [data-action="highlight"]').click();
const note = async (page, value) => {
  await page.locator('#annotation-actions [data-action="note"]').click();
  assert.equal(await page.locator('#annotation-editor').evaluate(el => el.open), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'annotation-comment');
  await page.locator('#annotation-comment').fill(value);
  await page.locator('#annotation-form').getByRole('button', { name: 'Save Note', exact: true }).click();
};
const entry = (page, id) => page.locator(`#annotation-${id}`);
const luminance = color => {
  const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return channels.reduce((value, n, i) => value + n * [0.2126, 0.7152, 0.0722][i], 0);
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const p1 = '#introductory > p:first-of-type';
const p2 = '#introductory > p:nth-of-type(2)';
const q1 = 'main > section:nth-of-type(2) > p:first-of-type';

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await ({ edge: chromium, firefox, webkit }[engine]).launch(engine === 'edge' ? { channel: 'msedge', headless: true } : { headless: true });
    record('Browser', browser.version());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.stack || e.message));
    page.on('request', r => requests.push(r.url()));
    page.on('dialog', d => d.accept());
    await page.goto(url);
    await page.waitForSelector('#annotation-ui');
    assert.equal(await page.locator('#my-annotations').getAttribute('open'), null);
    assert.equal(await page.locator('#annotation-actions').isVisible(), false);
    for (const excluded of ['#TOC', '#reading-preferences', '#my-annotations']) {
      await page.evaluate(selector => { getSelection().removeAllRanges(); getSelection().selectAllChildren(document.querySelector(selector)); }, excluded);
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#annotation-actions').isVisible(), false);
    }
    await page.evaluate(() => getSelection().removeAllRanges());
    assert(await page.evaluate(() => !!CSS.highlights));
    const original = await page.locator('main > section').evaluateAll(s => s.map(e => e.innerHTML));
    await page.locator(p1).click();
    assert.equal(await page.locator('#annotation-actions').isVisible(), false);
    const drag = await page.locator(p1).evaluate(el => {
      const rect = offset => { const r = document.createRange(); r.setStart(el.firstChild, offset); r.collapse(true); const b = r.getBoundingClientRect(); return { x: b.x, y: b.y + b.height / 2 }; };
      return { start: rect(1), end: rect(31) };
    });
    await page.mouse.move(drag.start.x, drag.start.y); await page.mouse.down();
    await page.mouse.move(drag.end.x, drag.end.y, { steps: 10 }); await page.mouse.up();
    await page.locator('#annotation-actions').waitFor({ state: 'visible' });
    assert(await page.evaluate(() => getSelection().toString().length > 0));
    await page.locator('#annotation-actions [data-action="dismiss"]').click();
    record('Native mouse-drag selection exposes contextual actions; ordinary clicks do not');
    await selection(page, p1, 0, 40);
    await highlight(page);
    let data = await saved(page);
    assert.equal(data.annotations.length, 1);
    const first = data.annotations[0];
    assert.equal(first.highlighted, true);
    assert.equal(await page.evaluate(() => CSS.highlights.get('handout-highlights').size), 1);
    await selection(page, p1, 0, 40);
    await note(page, '<img src=x onerror="window.annotationUnsafe=true"> A question');
    data = await saved(page);
    assert.equal(data.annotations.length, 1);
    assert(data.annotations[0].comment.includes('<img'));
    assert.equal(await page.evaluate(() => window.annotationUnsafe), undefined);
    assert.equal(await page.locator('#annotation-list img').count(), 0);
    await page.evaluate(() => getSelection().removeAllRanges());
    const markedPoint = await page.evaluate(() => {
      const r = [...CSS.highlights.get('handout-highlights')][0].getClientRects()[0];
      return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 };
    });
    await page.mouse.click(markedPoint.x, markedPoint.y);
    await page.locator('#annotation-editor').waitFor({ state: 'visible' });
    assert((await page.locator('#annotation-comment').inputValue()).includes('<img'));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.tagName === 'P');
    assert.equal(await page.locator('#my-annotations').getAttribute('open'), null);
    await page.locator('#annotation-summary').focus(); await page.keyboard.press('Enter');
    await entry(page, first.id).getByRole('button', { name: 'Edit Note' }).click();
    await page.locator('#annotation-comment').fill('Revised question');
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    assert.equal((await saved(page)).annotations[0].comment, 'Revised question');
    await entry(page, first.id).getByRole('button', { name: 'Edit Note' }).click();
    await page.getByRole('button', { name: 'Delete Note', exact: true }).click();
    data = await saved(page);
    assert.equal(data.annotations[0].comment, ''); assert(data.annotations[0].highlighted);
    await entry(page, first.id).getByRole('button', { name: 'Remove Highlight' }).click();
    assert.equal((await saved(page)).annotations.length, 0);
    record('Highlight-first notes, comment creation/edit/deletion, reuse existing highlight, and safe comment rendering');

    await selection(page, p2, 0, 45); await note(page, 'Comment without a prior highlight');
    data = await saved(page); assert.equal(data.annotations[0].highlighted, true);
    const noteId = data.annotations[0].id;
    await selection(page, p2, 50, 90); await highlight(page);
    await selection(page, p2, 110, 160); await highlight(page);
    // Inline formatting/link boundaries and a cross-paragraph range.
    await selection(page, q1, 100, 900); await highlight(page);
    await selection(page, p1, 40, 65, p2); await highlight(page);
    const total = (await saved(page)).annotations.length;
    assert.equal(total, 5);
    await page.evaluate(() => document.activeElement.blur()); // Removes temporary passage tabindex.
    assert.deepEqual(await page.locator('main > section').evaluateAll(s => s.map(e => e.innerHTML)), original);
    await page.reload(); await page.waitForSelector('#annotation-ui');
    assert.equal(await page.locator('#annotation-list > li').count(), total);
    assert.equal(await page.locator('#annotation-list').getByText(/Unanchored/).count(), 0);
    await page.locator('#annotation-summary').click();
    await entry(page, noteId).getByRole('button', { name: 'Go to passage' }).click();
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'P');
    assert.equal(await page.evaluate(() => CSS.highlights.get('handout-current').size), 1);
    record('Several same-paragraph marks, inline/link ranges, cross-paragraph selection, reload, and passage navigation');
    await page.locator(p2).screenshot({ path: path.join(out, 'marked-passage-light.png') });

    // Change every reading preference with all marks present; ranges must still
    // address exactly their saved canonical text with no wrapper mutations.
    await page.locator('#reading-preferences summary').click();
    for (const [name, values] of Object.entries({ font: ['serif', 'atkinson', 'sans'], appearance: ['light', 'dark', 'system'], spacing: ['compact', 'spacious', 'normal'], width: ['narrow', 'wide', 'standard'] })) {
      for (const value of values) await page.locator(`input[name="${name}"][value="${value}"]`).check();
    }
    for (const size of [85, 100, 150]) {
      await page.locator('#reading-size').fill(String(size));
      await page.locator('#reading-size').dispatchEvent('change');
      const painted = await page.evaluate(() => [...CSS.highlights.get('handout-highlights')].map(r => r.toString().replace(/\s+/gu, ' ').trim()));
      for (const annotation of (await saved(page)).annotations.filter(a => a.highlighted)) assert(painted.includes(annotation.anchor.quote.exact));
    }
    await page.locator('#reading-reset').click();
    await page.locator('#reading-preferences summary').click();
    record('All five reading preferences preserve the saved passages');
    for (const width of [320, 375, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.evaluate(() => CSS.highlights.get('handout-highlights').size), total);
    }
    if (engine === 'edge') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
      assert.equal(await page.evaluate(() => CSS.highlights.get('handout-highlights').size), total);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    }
    record('Marks survive viewport changes and Edge native page-scale emulation');

    // Keyboard creation retains the captured target after selection is cleared.
    await selection(page, p2, 20, 50);
    await selection(page, p1, 70, 110, p1, false);
    await page.keyboard.press('Alt+Shift+A');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'highlight');
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await page.locator('#annotation-comment').fill('Keyboard note');
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    assert((await saved(page)).annotations.some(a => a.comment === 'Keyboard note'));
    assert.equal((await saved(page)).annotations.find(a => a.comment === 'Keyboard note').anchor.quote.exact,
      (await page.locator(p1).textContent()).slice(70, 110).trim());
    await page.waitForFunction(() => document.activeElement.tagName === 'P');
    record('Keyboard action shortcut, preserved range, dialog focus and return');

    // A duplicate quote fixture exercises ambiguous relocation without touching
    // the handout source. Hash-identical content resolves the second occurrence;
    // changed content with two identical contexts must not guess a location.
    const duplicate = await page.evaluate(async () => {
      const { buildIndex, anchorForRange, resolveAnchor } = await import('/assets/annotation-anchors.js');
      const fixture = document.createElement('main');
      const phrase = 'A'.repeat(70) + ' duplicate quotation ' + 'B'.repeat(70);
      fixture.innerHTML = '<section><h2>Fixture</h2><p>Other content.</p><p>' + phrase + '</p><p>' + phrase + '</p></section>';
      document.body.append(fixture);
      const node = fixture.querySelectorAll('p')[2].firstChild;
      const range = document.createRange(); range.setStart(node, 71); range.setEnd(node, 90);
      const before = await buildIndex(fixture), anchor = anchorForRange(before, range);
      const initial = resolveAnchor(before, anchor);
      fixture.querySelector('p').textContent = 'Changed unrelated content.';
      const changed = await buildIndex(fixture);
      const ambiguous = resolveAnchor(changed, anchor);
      const second = initial.range.startContainer === node;
      fixture.remove();
      return { second, ambiguous: ambiguous === null };
    });
    assert.deepEqual(duplicate, { second: true, ambiguous: true });
    record('Repeated exact text uses source offsets; ambiguous changed-source matches stay unanchored', duplicate);

    // An unresolved but valid stored record is retained and clearly listed.
    await page.evaluate(key => {
      const data = JSON.parse(localStorage.getItem(key));
      const a = data.annotations[0];
      a.anchor.quote.exact = 'Z'.repeat(a.anchor.quote.exact.length);
      localStorage.setItem(key, JSON.stringify(data));
    }, key);
    await page.reload(); await page.waitForSelector('#annotation-ui');
    assert((await page.locator('#annotation-list').textContent()).includes('Unanchored'));
    assert.equal((await saved(page)).annotations.length, total + 1);
    await page.locator('#annotation-summary').click();
    for (const mode of ['light', 'dark']) {
      await page.locator('#reading-preferences summary').click();
      await page.locator(`input[name="appearance"][value="${mode}"]`).check();
      await page.locator('#reading-preferences summary').click();
      const palette = await page.evaluate(() => {
        const probe = document.createElement('span'); probe.hidden = true;
        probe.style.backgroundColor = 'var(--annotation-highlight-bg)'; probe.style.color = 'var(--bs-link-hover-color)';
        document.body.append(probe); const css = getComputedStyle(probe);
        const result = { background: css.backgroundColor, link: css.color, text: getComputedStyle(document.body).color };
        probe.remove(); return result;
      });
      assert(contrast(palette.text, palette.background) >= 4.5);
      assert(contrast(palette.link, palette.background) >= 4.5);
      record(`Highlighted body/link text contrast (${mode})`, { ...palette, bodyRatio: contrast(palette.text, palette.background), linkRatio: contrast(palette.link, palette.background) });
      await page.locator('#annotation-ui').screenshot({ path: path.join(out, `annotations-${mode}.png`) });
    }
    await page.addScriptTag({ path: path.join(process.env.LOCALAPPDATA, 'Programs/Quarto/share/formats/html/axe/axe.min.js') });
    const audit = await page.evaluate(() => axe.run('#annotation-ui', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    fs.writeFileSync(path.join(out, 'accessibility.json'), JSON.stringify(audit, null, 2));
    assert.deepEqual(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    record('Unanchored records retained; expanded annotation list accessibility audit', { violations: audit.violations.length });
    const annotatedLink = await context.newPage();
    await annotatedLink.goto(url); await annotatedLink.waitForSelector('#annotation-ui');
    const href = await annotatedLink.locator(`${q1} a`).first().getAttribute('href');
    await annotatedLink.route(href, route => route.fulfill({ contentType: 'text/html', body: '<p>Normal hyperlink navigation</p>' }));
    await annotatedLink.locator(`${q1} a`).first().click();
    await annotatedLink.waitForURL(href);
    await annotatedLink.close(); record('A hyperlink inside a marked range keeps normal navigation (destination stubbed)');
    await entry(page, noteId).getByRole('button', { name: 'Edit Note' }).click();
    const editorAudit = await page.evaluate(() => axe.run('#annotation-editor', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    assert.deepEqual(editorAudit.violations.map(v => v.id), []);
    await page.locator('#annotation-editor').screenshot({ path: path.join(out, 'editor-dark.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('annotation-editor').open);
    record('Native dialog accessibility audit and Escape close', { violations: editorAudit.violations.length });
    await entry(page, noteId).locator('.annotation-more > summary').click();
    await entry(page, noteId).getByRole('button', { name: 'Delete Annotation', exact: true }).click();
    assert(!(await saved(page)).annotations.some(a => a.id === noteId));
    record('Confirmed annotation deletion');
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await page.locator('#annotation-summary').focus();
    await page.keyboard.press('Tab');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
    await page.locator('#annotation-ui').screenshot({ path: path.join(out, 'annotations-forced-colors.png') });
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
    record('Forced-colors/reduced-motion emulation and keyboard focus');

    // Missing/invalid storage, failures, no JS, and old browsers.
    for (const failure of ['denied', 'quota', 'corrupt', 'invalid-record', 'unsupported-version']) {
      const restricted = await browser.newContext();
      await restricted.addInitScript(({ key, failure }) => {
        if (failure === 'denied') Object.defineProperty(window, 'localStorage', { get() { throw Error('Denied'); } });
        if (failure === 'quota') Storage.prototype.setItem = () => { throw Error('Full'); };
        if (failure === 'corrupt') localStorage.setItem(key, '{broken');
        if (failure === 'invalid-record') localStorage.setItem(key, JSON.stringify({ version: 1, documentId: 'exp-handout-2026-10-26', annotations: [{ id: 'invalid' }] }));
        if (failure === 'unsupported-version') localStorage.setItem(key, JSON.stringify({ version: 99 }));
      }, { key, failure });
      const test = await restricted.newPage();
      await test.goto(url); await test.waitForSelector('#annotation-ui');
      if (failure === 'denied' || failure === 'quota') {
        await selection(test, p1, 0, 35); await highlight(test);
        assert((await test.locator('#annotation-action-status').innerText()).includes('Not saved'));
        assert.equal(await test.locator('#annotation-list > li').count(), 1);
        await test.locator('#annotation-actions [data-action="note"]').click();
        await test.locator('#annotation-comment').fill('Unsaved draft');
        await test.getByRole('button', { name: 'Save Note', exact: true }).click();
        assert(await test.locator('#annotation-editor').evaluate(el => el.open));
        assert((await test.locator('#annotation-editor-status').innerText()).includes('Not saved'));
      } else {
        assert((await test.locator('#annotation-status').textContent()).includes('preserved'));
        const old = await test.evaluate(key => localStorage.getItem(key), key);
        await selection(test, p1, 0, 35, p1, false);
        await test.waitForTimeout(200);
        assert.equal(await test.locator('#annotation-actions').isVisible(), false);
        assert.equal(await test.evaluate(key => localStorage.getItem(key), key), old);
      }
      await restricted.close(); record(`Storage ${failure}`);
    }
    const plainContext = await browser.newContext({ javaScriptEnabled: false });
    const plain = await plainContext.newPage(); await plain.goto(url);
    assert.equal(await plain.locator('#annotation-ui').isVisible(), false);
    assert.equal(await plain.locator('main > section').count(), original.length);
    record('Without JavaScript the original handout is readable');
    const conflictContext = await browser.newContext();
    const stale = await conflictContext.newPage(); await stale.goto(url); await stale.waitForSelector('#annotation-ui');
    await selection(stale, p1, 0, 35); await highlight(stale);
    const otherTab = await conflictContext.newPage(); await otherTab.goto(url); await otherTab.waitForSelector('#annotation-ui');
    const newerRaw = await otherTab.evaluate(key => {
      const data = JSON.parse(localStorage.getItem(key)); data.annotations[0].comment = 'Written in another tab';
      const raw = JSON.stringify(data); localStorage.setItem(key, raw); return raw;
    }, key);
    await selection(stale, p1, 45, 70); await highlight(stale);
    assert((await stale.locator('#annotation-action-status').innerText()).includes('another tab'));
    assert.equal(await stale.evaluate(key => localStorage.getItem(key), key), newerRaw);
    await conflictContext.close(); record('Concurrent-tab changes are not overwritten');
    const fallbackContext = await browser.newContext();
    await fallbackContext.addInitScript(() => { window.Highlight = undefined; });
    const fallback = await fallbackContext.newPage(); await fallback.goto(url); await fallback.waitForSelector('#annotation-ui');
    assert((await fallback.locator('#annotation-support').textContent()).includes('cannot paint'));
    await selection(fallback, p1, 0, 35); await highlight(fallback);
    assert.equal((await saved(fallback)).annotations.length, 1);
    await fallbackContext.close(); record('Missing CSS Highlight API: records/list still work with a visible compatibility message');

    // Mobile selection is programmatically assisted. Only taps/scroll/reflow
    // below are emulated touch interactions, not native long-press handles.
    for (const width of [320, 375, 390]) {
      const mobileContext = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, ...(engine !== 'firefox' ? { isMobile: true } : {}) });
      const mobile = await mobileContext.newPage();
      mobile.on('dialog', d => d.accept());
      await mobile.goto(url); await mobile.waitForSelector('#annotation-ui');
      await mobile.locator('#reading-preferences summary').tap();
      await mobile.locator('#reading-size').fill('150'); await mobile.locator('#reading-size').dispatchEvent('change');
      await mobile.locator('#reading-preferences summary').tap();
      await selection(mobile, p1, 0, 50);
      assert.equal(await mobile.locator('#annotation-actions').evaluate(el => getComputedStyle(el).position), 'fixed');
      await mobile.locator('#annotation-actions [data-action="note"]').evaluate(el => el.focus({ preventScroll: true }));
      await mobile.evaluate(() => getSelection().removeAllRanges());
      await mobile.waitForTimeout(200);
      assert.equal(await mobile.locator('#annotation-actions').isVisible(), true);
      await mobile.locator('#annotation-actions').screenshot({ path: path.join(out, `mobile-actions-${width}.png`) });
      await mobile.locator('#annotation-actions [data-action="note"]').tap();
      await mobile.locator('#annotation-comment').fill('Touch-emulated note');
      assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await mobile.locator('#annotation-editor').screenshot({ path: path.join(out, `mobile-editor-${width}.png`) });
      await mobile.getByRole('button', { name: 'Save Note', exact: true }).tap();
      await mobile.locator('#reading-preferences summary').tap();
      await mobile.locator('#reading-size').fill('150'); await mobile.locator('#reading-size').dispatchEvent('change');
      await mobile.locator('#reading-preferences summary').tap();
      assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await mobile.evaluate(() => scrollTo(0, document.body.scrollHeight));
      assert(await mobile.evaluate(() => scrollY > 0));
      await mobile.screenshot({ path: path.join(out, `mobile-${width}.png`) });
      await mobileContext.close(); record(`Touch-emulated ${width}px: viewport actions, note, enlarged reflow and scrolling`);
    }
    assert.equal(requests.filter(r => !r.startsWith(url)).length, 0);
    const resizeWarnings = errors.filter(message => message.endsWith('ResizeObserver loop completed with undelivered notifications.'));
    assert.deepEqual(errors.filter(message => !resizeWarnings.includes(message)), []);
    record('No external requests or runtime exceptions', { resizeObserverDiagnostics: resizeWarnings.length });
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    if (browser) await browser.close(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
