# Reading Preferences visual refinement

The panel remains in the same place, collapsed on every visit and hidden without
JavaScript. Its expanded controls now use a consistent visual vocabulary:

- The native size slider sits between A− and A+, with its percentage above.
- Typeface choices show actual Sans, Serif, and Atkinson **Tt** letterforms.
- Appearance choices use small local inline monitor, sun, and moon SVGs.
- Spacing diagrams each have exactly three equal-length lines, with differing
  vertical gaps. Width diagrams each have exactly three lines, with differing
  lengths and identical vertical gaps.
- Native radio dots and stronger borders convey selection. Outlines identify
  focus. Options wrap at narrow widths instead of clipping labels or previews;
  at 320px with 150% text they use two columns and a second row.

The entire option label is clickable. Fieldsets and legends provide group names;
native radios retain their keyboard, checked-state, and screen-reader semantics.
Decorative diagrams and letter previews are hidden from the accessibility tree.
WebKit focused radios after arrow-key changes without matching `:focus-visible`
in testing, so the option-face outline uses `:focus`. No keyboard script was added.

## Files changed

| File | Change |
| --- | --- |
| `assets/reading-panel.html` | Radio groups, typeface previews, diagrams/icons, and slider endpoints. |
| `assets/reading.css` | Panel-only option styles, real preview fonts, wrapping, focus, and forced-colors rules. |
| `assets/reading.js` | Synchronizes radio `checked` states with existing preferences; checks the preview font when expanded. |
| `index.html` | Regenerated with Quarto 1.10.19. |
| `verification/check.cjs`, `verification/refinements.cjs` | Updated from dropdown selectors to native radio controls; added visual-control checks. |
| `README.md`, this document | Link and implementation/test notes. |
| `verification/controls/` | New browser results, accessibility reports, logs, and screenshots. |

`index.qmd` and `assets/reading-head.html` are unchanged. The handout's prose,
annotation sentence, six questions, quotations, links, TOC, and Quarto configuration
are preserved. The corrected size calculation and early theme initializer remain
intact. No dependencies, icon libraries, network services, or annotations were
introduced. No push, deployment, Pages-setting change, or other-site edit was made.

## Preferences and font loading

The same storage key (`exp-2026-10-26.reading.v1`) and all existing preference
values remain in use. No data migration is necessary. Applying or resetting
preferences now updates the native radio selections as well as the document.
Validation, reset, persistence, system appearance changes, and storage-failure
handling retain their existing behavior.

Atkinson uses the existing local font files. A fresh, collapsed panel with the
default typeface requests **no font files**. Expanding it loads the regular face
for the accurate preview. Selecting Atkinson for the handout loads any other
faces needed by the text. A previously saved Atkinson selection can load fonts
while the panel is collapsed because the handout itself needs them. Font failures
use the existing fallback/status message; no remote font service is involved.

## Checks executed

Quarto rendering succeeded. The updated full suite and prior focused regressions
passed in **Edge 155.0.4283.62** and **Playwright WebKit 26.5** on Windows:

- Default document text, links, TOC destinations, typography, and width compared
  with the original `baseline.html`; no outside-panel default appearance change.
- All five preferences, every radio option saving/restoring, reset of visible
  selections, and restoration from the previous saved-preference format.
- Native Tab/arrow-key navigation, disclosure opening/closing, and option focus.
- 63 viewport/size/width combinations per engine, including 320, 375, and 390px
  and 150% text. No horizontal page overflow or clipped option contents.
- Touch/mobile emulation at 375 and 390px, including tapping option faces away
  from the radio dot and confirming persistence after reload.
- Correct three-line diagram counts and invariant lengths/gaps.
- Actual local Atkinson preview loading after expansion, with no initial font
  request while collapsed; no external page requests.
- Light/dark axe audits of the expanded controls: zero detected WCAG A/AA
  violations in either engine. Accessibility snapshots expose named groups and
  named, checked radios.
- Forced-colors emulation retains selected indicators and focus outlines.
- Readability without JavaScript; unavailable storage, quota failures, and
  malformed saved data. Inherited Quarto storage errors remain as documented in
  `PHASE1-REFINEMENTS.md`; the preference code remains usable.
- Earlier regressions: correct scaling at 16/20/24px browser defaults in Edge,
  mobile text reflow in both engines, and early saved/system appearance during
  delayed script loading. WebKit's stalled-loading screenshot limitation remains
  documented; its early-style checks pass.

Actual screenshots were inspected, including desktop light/dark panels, enlarged
phone panels, and forced-colors emulation. Examples:

- [Desktop light panel](verification/controls/edge-suite/panel-light-desktop.png)
- [WebKit desktop dark panel](verification/controls/webkit-suite/panel-dark-desktop.png)
- [320px panel at 150%](verification/controls/edge-suite/panel-light-320-150.png)

Results are in `verification/controls/{edge,webkit}-suite/browser-results.json`
and `{edge,webkit}-regressions/results.json`. The existing test commands still
work; set `HANDOUT_BROWSER` to `edge` or `webkit` and `HANDOUT_REPORT_DIR` to the
desired evidence folder. These are test dependencies only, not website build steps.

No physical iPhone, VoiceOver/NVDA speech, actual OS high-contrast setting, or
device-level text enlargement was tested. Those remain hands-on checks;
desktop WebKit does not establish full iOS Safari compatibility. Enlarged narrow
screens naturally need more vertical scrolling inside the expanded panel.
