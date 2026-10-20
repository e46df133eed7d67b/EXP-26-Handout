# Phase 1 refinements — October 20, 2026

Two confirmed issues were corrected. There are no changes to `index.qmd`,
`assets/reading.css`, the panel markup, the six questions, quotations, links, or
the sentence about future annotations. No annotations or publishing work was done.

## Font-size scaling

Quarto's generated Bootstrap stylesheet sets `--bs-root-font-size: 17px` and
uses it for the root font size. Body text is `1rem`. In this existing theme,
100% therefore means 17px, including when the browser's default is 20px or 24px.
That is the original Quarto behavior; this task preserves it.

The old calculation converted that size to a percentage by dividing by 16.
Root percentages are relative to the reader's actual browser default, so the
conversion added an unintended multiplier. At a 24px browser default, choosing
150% produced 38.25px (225% of the original text), and choosing 85% actually
enlarged it to 21.675px.

`assets/reading.js` now scales Quarto's declared size directly:

```javascript
root.style.fontSize = `calc(var(--bs-root-font-size) * ${preferences.size / 100})`;
```

At 100%, the inline override is removed, as before. There is no assumed browser
baseline, measured-size snapshot, or new font-size constant. CSS retains the
theme's declared size as the source of truth. Browser zoom is not disabled;
browser-enforced minimum text sizes may still constrain a requested reduction.
No text-size-adjust or viewport restrictions were added.

The regression test used Chromium's native `Page.setFontSizes` command to set
browser defaults, and checked an independent `font-size: medium` probe to confirm
that each setting really took effect. It did not simulate defaults by overriding
the document root in CSS. All combinations below passed in Edge:

| Browser default | Quarto 100% | 85% | 125% | 150% |
| --- | --- | --- | --- | --- |
| 16px | 17px | 14.45px | 21.25px | 25.5px |
| 20px | 17px | 14.45px | 21.25px | 25.5px |
| 24px | 17px | 14.45px | 21.25px | 25.5px |

Returning to 100% and restoring a saved 125% after reload also passed at each
default. A native 2× page-scale emulation check passed in Edge; this exercises
pinch-style scaling, not the desktop browser's zoom menu or an iPhone setting.

## Dark-mode loading

The original page was captured with `reading.js` deliberately delayed. In the
saved-dark and system-dark cases, first contentful paint occurred around
100–120ms, but the rendered body stayed white during the 800ms delay. Thus a
visible light-to-dark transition is possible on a slower load; it was reproduced,
not inferred from code alone. This does not measure typical unthrottled loading.

`assets/reading-head.html` now includes a small inline initializer before the
existing deferred script. It reads only the saved appearance choice, falls back
to the device preference, and sets Bootstrap's existing `data-bs-theme` and
`color-scheme`. Storage denial and malformed data are caught. The full module
still controls subsequent changes and system-preference events. No extra theme,
request, listener, or dependency was added.

After the correction, the delayed-script cases passed in Edge and WebKit:
saved dark on a light system, system dark without a saved choice, and saved light
on a dark system. The expected body background was already applied while the
panel was still hidden and the main preference script had not run.

Edge before/after screenshots are included. WebKit's early-page screenshot API
timed out waiting for font readiness while the script was deliberately blocked.
Its early DOM style checks and first-contentful-paint entries were captured, but
no pre-initialization WebKit screenshot is claimed. Normal WebKit screenshots
after loading succeeded.

## Browser verification actually executed

Quarto **1.10.19** rendered `index.qmd` successfully. The existing suite was
extended to support both engines and separate report folders. Executed locally
on Windows using Playwright and:

- Microsoft Edge **155.0.4283.62**.
- Playwright WebKit **26.5**, build **2336**. Its standard test-browser download
  was placed in `%TEMP%\exp-handout-playwright`; no system configuration or
  website dependency was added.

Both engines passed:

- Original rendered text, hyperlinks, TOC destinations, and default typography
  compared with `baseline.html`.
- Keyboard opening and closing of the native disclosure, slider arrow keys,
  tab order, and visible keyboard focus in forced-colors emulation.
- All typefaces, appearance choices, line-spacing values, reading widths,
  saved preferences after reload, reset, and live system appearance changes.
- **63 layout combinations per engine:** widths 320, 375, 390, 768, 820, 1024,
  and 1440px; text sizes 85%, 100%, and 150%; all three reading widths. No
  horizontal page overflow; Narrow and Wide change the desktop measure in the
  expected direction.
- Additional touch/mobile emulation at **375px and 390px**, including disclosure
  taps, 85/125/150% scaling, saved choices after reload, and no horizontal overflow.
- Readability without JavaScript; preferences hidden in that case.
- Denied storage, quota failures, and malformed saved data. The preference code
  remains usable. Existing Quarto reader-mode/tabset storage errors were also
  reproduced on the original page and were not patched.
- No external page requests, fonts loaded locally only after selecting Atkinson,
  and no JavaScript errors in ordinary operation.
- Quarto's bundled axe audit of the expanded panel in light and dark modes:
  **zero detected WCAG A/AA violations** in either engine.

The 16/20/24px browser-default matrix and native page-scale check were executed
in Edge only. WebKit does not expose Chromium CDP; those settings were not
claimed as WebKit tests. WebKit's ordinary and mobile-emulated size checks did run.
Native disclosure details via CDP are Edge-only; both engines' keyboard tests,
accessibility snapshots, and axe checks ran.

## Evidence and rerunning tests

- `verification/refinements.cjs`: focused scaling and delayed-loading regressions.
- `verification/check.cjs`: expanded existing suite (`HANDOUT_BROWSER=edge` or
  `webkit`; Edge is the default).
- `verification/refinements/edge-before/results.json`: measurements before fixes.
- `verification/refinements/edge-after/` and `webkit-after/`: focused results and
  available screenshots.
- `verification/refinements/edge-suite/` and `webkit-suite/`: suite results,
  accessibility reports, and screenshots. The original Phase 1 evidence remains
  in place.

The test scripts need Playwright on Node's module search path. In the development
environment used here, set `NODE_PATH` to the bundled runtime's `node_modules`.
Then, from this project folder:

```powershell
$env:HANDOUT_BROWSER = 'edge'
$env:HANDOUT_REPORT_DIR = 'verification/refinements/edge-suite'
node verification/check.cjs
node verification/refinements.cjs

$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:TEMP 'exp-handout-playwright'
$env:HANDOUT_BROWSER = 'webkit'
$env:HANDOUT_REPORT_DIR = 'verification/refinements/webkit-suite'
node verification/check.cjs
node verification/refinements.cjs
```

These are development tests, not additional website build steps. Previewing and
editing remain unchanged: `quarto preview index.qmd --port 8765`.

## Still to check on an actual iPhone

Desktop WebKit and touch emulation do **not** establish iOS Safari compatibility.
Hands-on checks remain for native select/range interaction, pinch zoom and Safari
page zoom, device text-enlargement settings, VoiceOver announcements and focus,
rotation and long-page scrolling, dark-mode loading on a real connection, and
private-browsing storage behavior. No actual iPhone or screen-reader speech test
was performed. Passage selection and annotations remain Phase 2 work.

References: [Playwright browser support and installation](https://playwright.dev/docs/browsers),
[Chromium default-font protocol](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-setFontSizes).
