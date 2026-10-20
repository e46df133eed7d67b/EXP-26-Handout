# Personalizable Quarto handout — Phase 1

The handout's wording, six questions, links, and table of contents are preserved.
Reading Preferences appears below the title, collapsed on every visit. It offers
85–150% text size, three typefaces, system/light/dark appearance, three line
spacings, three reading widths, and a reset button. Preferences stay in the
reader's browser; there are no accounts, analytics, or server storage.

## Preview and keep writing

1. In VS Code, choose **File → Open Folder** and open this folder.
2. Open `index.qmd` and keep writing normally in Markdown.
3. Open **Terminal → New Terminal** and run:

   ```powershell
   quarto preview index.qmd --port 8765
   ```

   Quarto opens the browser and refreshes the page when you save changes. If the
   Quarto VS Code extension is installed, its **Preview** button also works.
   The fixed port above keeps the browser address consistent for preference
   testing. Stop terminal preview with **Ctrl+C**.

To regenerate the static HTML without starting a preview:

```powershell
quarto render index.qmd
```

Edit **`index.qmd`**, not `index.html`. Only three HTML configuration entries were
added to its YAML header. Keep those entries and the `assets` folder in place.
New paragraphs, headings, and links need no corresponding JavaScript edits.

Open a preview through Quarto when testing saved preferences: storage for directly
opened `file:` URLs varies between browsers. Preferences are specific to the
browser and website address, including the local preview port. Private browsing,
clearing site data, or changing the address can discard or separate them.

## Files

| File | Purpose |
| --- | --- |
| `index.qmd` | Authoritative writing source; only the YAML header changed. |
| `assets/reading-panel.html` | Native disclosure panel and labeled controls. |
| `assets/reading-head.html` | Loads the separate JavaScript using Quarto's supported header include. |
| `assets/reading.js` | Applies preferences, validates saved values, handles storage failures and reset. |
| `assets/reading.css` | Small control styles, reading overrides, and optional font declarations. |
| `assets/fonts/` | Local Atkinson Hyperlegible faces and their OFL license. |
| `index.html`, `index_files/` | Quarto-generated output; regenerate rather than edit. |
| `baseline.html` | Original generated page retained for comparison only. |
| `verification/` | Original source backup, browser checks, screenshots, and test results. Not needed for publication. |

There is no package installation or new build step. The additional CSS and
JavaScript total about 8.5 KB uncompressed. The panel is included in the HTML, so
it needs no extra request. Font files are requested only when Atkinson is selected
(or restored from a saved choice). All font requests stay on the same website.
The four font files total about 220 KB; the browser fetches the styles actually
used by the document. System serif and sans-serif require no font downloads.

Appearance uses the dark palette already included in Quarto 1.10.19's Bootstrap
stylesheet. It does not replace the document theme or add a second theme toggle.
Standard font, spacing, and width preserve Quarto's existing values. Narrow
reduces the main column to 80%; Wide extends into Quarto's existing left gutter.
Width choices apply at 768px and above; phones keep the normal available width.
Recheck the controls if you deliberately change the Quarto theme or upgrade Quarto.

Without JavaScript, the controls stay hidden and the original handout remains
readable in its usual light appearance. Browser zoom and built-in reading tools
remain available. Storage failures are explained inside the panel; controls keep
working for the current visit.

## Verification

Tested with Quarto **1.10.19** and local headless Microsoft Edge on Windows:

- Successful Quarto regeneration, with the includes and external files retained.
- Original body text preserved exactly; rendered headings, passage text, links,
  and TOC destinations compared with the original page.
- Default light typography, line spacing, colors, and desktop width match the
  original page (17px type, 25.5px line height, 799px main column at 1440px).
- Keyboard opening/closing, slider arrows, tab order, named controls, native
  disclosure name/expanded state, and visible focus in forced-colors mode.
- All choices, refresh persistence, reset, live system appearance changes, and
  explicit appearance overrides.
- 54 combinations of viewport width (320, 390, 768, 820, 1024, 1440), text size
  (85, 100, 150%), and reading width. No horizontal page scrolling.
- Quarto's bundled axe accessibility audit of the expanded panel: zero detected
  WCAG A/AA violations in both light and dark modes.
- Readable mobile document with JavaScript disabled.
- Denied storage access, quota failures, and damaged saved preferences: controls
  remain usable and do not throw errors from the preference script.
- No external page requests; no optional font requests before selection; local
  font loading succeeds after selection. No JavaScript errors in normal operation.

Evidence is in `verification/browser-results.json`, the accessibility JSON
reports, and screenshots. `verification/check.cjs` uses Playwright and the local
Quarto axe bundle only for testing; these are not website dependencies.

One inherited Quarto limitation was reproduced on `baseline.html`: when browser
storage is completely denied, its reader-mode and tabset scripts log storage
errors; quota failures can also produce a tabset error. The new preference code
catches its own storage failures and remains usable. Quarto's generated scripts
were kept intact, and ordinary document links remain usable in these conditions.

These are desktop browser checks at mobile viewport sizes, not physical iPhone
or Android tests. Actual screen-reader speech (e.g. VoiceOver/NVDA), mobile Safari,
and device-level text enlargement still need hands-on testing. Automated checks
cannot establish complete accessibility conformance.

## Later phases

Annotations, general notes, export/restore, deployment, and QR code creation have
not been implemented. No existing GitHub Pages site was changed.

Preferences only change styling; the code never wraps or replaces passage text.
This leaves the document structure and text intact for a later annotation module
with its own storage key. That module should anchor to text/structure, not pixel
positions. Its mobile selection approach and any library choice remain open.

The introductory paragraph already mentions annotations and GitHub hosting.
That wording was preserved as requested; those features are still future work.

Reference: [Quarto HTML options](https://quarto.org/docs/reference/formats/html.html)
describes CSS and header/body includes. Fonts come from the
[Google Fonts Atkinson Hyperlegible source](https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegible),
with the original [OFL license](assets/fonts/OFL.txt) included.
