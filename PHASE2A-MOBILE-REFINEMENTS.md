# Phase 2A mobile annotation refinements — October 21, 2026

Historical refinement report. The bottom text toolbar and independent note/
highlight model described here have since been superseded by
[Unified highlighting and the adaptive toolbar](PHASE2A-UNIFIED-HIGHLIGHTS.md).

Implemented locally. No commit, push, publication, GitHub Pages setting change,
or Phase 2B work. `index.qmd`, the anchoring module, storage format/key, and all
reading-preference assets were left unchanged during this refinement.

## Scrolling investigation and correction

The editor's previous close handler explicitly opened My Annotations and focused
its summary whenever the invoker was hidden or disconnected. Creation hid the
toolbar invoker; saving rebuilt the list and disconnected its invoking button.
The list's highlight/delete handlers also used default scrolling focus calls.
Only Go to passage needs the existing explicit `scrollIntoView()` navigation.

Before changes, Edge touch emulation reproduced a note save changing scroll Y
from **1,177 to 33**, opening My Annotations and focusing its summary. Evidence:
`verification/annotations/edge/scroll-baseline.json`. Highlight creation alone
did not reproduce that same jump to the summary: the success status added about
38px above the document, and the touch toolbar could require scrolling down to
reach it. These were separate layout/access problems, not an extra hidden anchor
navigation or unconditional highlight `scrollIntoView()` call.

Editor invocations now retain a passage block or list-record identity. Closing
returns focus with `preventScroll` to the passage, or to the newly rendered Note
control. Temporary passage tabindex values are removed on blur. Highlight/delete
list changes likewise choose a replacement control or neighbor without scrolling.
Successful actions no longer open the disclosure. There are no stored page scroll
offsets or page-position resets. Go to passage still explicitly scrolls and focuses.

Success announcements use a screen-reader live region that does not add document
height. Initial storage warnings remain visible; failed writes remain visible in
the active toolbar/editor and in each unsaved list entry. This also removes the
smaller status-induced layout shift observed in WebKit.

When My Annotations was already open above the passage, a body annotation holds
the disclosure's existing height. Its list updates immediately inside that box,
with internal scrolling if needed, rather than pushing the handout downward.
Explicitly collapsing/reopening the disclosure releases this temporary height.
List-initiated edits continue to render normally. The open-disclosure case has a
separate position assertion in the new browser suite.

## Toolbar and local editor

The toolbar always remains outside substantive handout sections; it is never
inserted after a paragraph or list. Desktop positioning uses the selected range's
visible client rectangles, preferring space above the selection and otherwise
below it, clamped to the viewport. Ordinary desktop page scrolling dismisses it.

Touch-capable layouts use a fixed, three-action bottom bar: Highlight, Add Note,
Dismiss. Paragraph length does not affect its accessibility. Successful creation
or dismissal hides it; failed saves retain their visible status and captured
target. No native selection, context-menu, clipboard, or touch-handle event is
cancelled. Selection is cloned before button focus moves. Inline elements,
hyperlinks, and cross-paragraph selections still use the unchanged text index.

The native modal dialog identifies its target with a quoted passage and accessible
description, labels its textarea, and provides Save, Cancel, and independent note
deletion. Desktop uses a compact viewport-centered dialog; touch layouts use a
restrained bottom sheet. Native modal background inertness is retained. Explicit
Tab/Shift+Tab wrapping keeps focus among visible controls; Escape follows the same
close/focus path as Cancel. The textarea receives initial focus without requesting
a page scroll. A failed save leaves the editor open with the draft and failure.

Both surfaces use `visualViewport` dimensions and offsets when available, with
ordinary viewport fallbacks. Visible-surface updates on viewport resize/pan are
coalesced into one animation frame. Safe-area padding covers the bottom and sides.
The editor has a bounded height and its own scrolling; when keyboard resizing
would hide the focused field, only the editor's internal scroll position changes.
Save/Cancel remain reachable by scrolling inside a short keyboard-reduced editor.
No polling, continuous DOM indexing, framework, icon library, or dependency added.

## Compact list actions

Each entry now has four equal columns: Passage, Note, Highlight, More. Icons are
local inline SVGs (decorative to assistive technology); More uses a native details/
summary disclosure. Full accessible names remain Go to passage, Add/Edit Note,
and Highlight/Remove Highlight. The highlight control exposes `aria-pressed`, a
visible selected tint, and an inset state line; the entry's text also states its
current highlight/note state. Keyboard focus outlines remain visible.

More contains Delete Annotation, preserving its destructive wording and native
confirmation. Escape closes More and restores summary focus. The small popup
prefers space above the row and flips below if the upper viewport edge blocks it.
At 320px and 150% text, labels can wrap within their controls, while all four
controls remain on one horizontal row. Text is not clipped or forced onto a line
that overflows. The measured narrowest standard-layout control was about 51px
wide; targets exceeded 44px high. No horizontal page overflow was detected.

## Files changed in this refinement

| File | Purpose |
| --- | --- |
| `assets/annotations.js` | Viewport surfaces, stable focus return, non-displacing status, open-panel layout preservation, compact actions/disclosure. |
| `assets/annotations.css` | Fixed toolbar, bottom sheet, safe-area/viewport sizing, four-column action styling, focus/state treatment. |
| `assets/annotations-panel.html` | Updated touch instructions, live region/initial warning, editor focus and accessible descriptions. |
| `index.html` | Regenerated with Quarto 1.10.19 from the existing source. |
| `verification/mobile-annotations.cjs` | Baseline reproduction and coordinated position, row, viewport, keyboard, copy and accessibility checks. |
| `verification/annotations.cjs` | Existing integration assertions updated for completion dismissal, local focus and More disclosure. |
| `verification/check.cjs` | Optional current-source/no-JS content reference; historical typography reference retained. |
| `verification/annotations/` | Updated reports, accessibility results and screenshots. |
| `README.md`, `PHASE2A-ANNOTATIONS.md`, this report | Current usage, scope and verification documentation. |

Existing uncommitted Phase 2A work was preserved. The current source already
contains “it's also something you do”; the older `baseline.html` omits “also”.
The first reading-suite run correctly flagged that preexisting fixture mismatch.
It was rerun with `HANDOUT_CONTENT_REFERENCE=index.html`, read without JavaScript,
to verify the current source's sections/links/TOC against the interactive page.
The historical baseline remains unchanged and still supplies typography metrics.

## Verification

Edge 155.0.4283.62 and Playwright WebKit 26.5 were exercised on Windows:

- Coordinated mobile suite at 320/375/390px, 100% and 150% reading text: four
  aligned controls, unclipped labels, no overflow; Note, Highlight, More,
  declined deletion, and explicit passage navigation all work.
- Position checks cover highlight creation, local editor open/save, list edit/
  Cancel, highlight removal, and Escape. The initial passage remains at exactly
  the same viewport position through creation/save in both engines. Open-panel
  body creation is checked separately. No automatic summary navigation remains.
- Actual long-paragraph selection at 320px/150% used a paragraph roughly 2,066px
  tall with its selection near the beginning. The actions were immediately in
  view. Dismiss/reselect, rotation to 844×320, and resized viewport geometry pass.
- Keyboard shortcut, Tab/Shift+Tab containment, visible focus, native Escape,
  copy event/default preservation, and saved-range preservation pass. Physical
  clipboard/selection-menu behavior remains a separate phone check.
- Synthetic `visualViewport` keyboard geometry (330px high with a 30px offset)
  keeps the editor and focused field visible. This tests layout/event handling,
  not a real software keyboard or its page-panning heuristics.
- Existing annotation integration checks pass: independent highlights/comments,
  exact-target reuse, deletion, inline/link/cross-paragraph ranges, refresh,
  missing/ambiguous anchors, safe note text, denied/quota/corrupt storage,
  unsupported data, concurrent-tab protection, missing Highlight API, no-JS
  readability, normal hyperlinks, all five reading preferences with marks,
  light/dark palettes, forced colors, and Edge page-scale emulation.
- Axe checks detect zero WCAG A/AA violations in the annotation list/editor and
  the mobile expanded More state at 320px/150%. Reading suites also detect zero
  violations in their light/dark panels. This is not a complete accessibility
  certification or screen-reader speech test.
- Both reading suites pass 63 viewport/size/reading-width combinations, saved
  preferences, radio keyboard behavior, reset, local fonts, and no-JS checks.
- Quarto rendering succeeds. Screenshots of desktop actions, phone action rows,
  editor/keyboard geometry, light/dark and forced colors were inspected.

Reports: `verification/annotations/{edge,webkit}/results.json` and
`mobile-refinements.json`; reading reports are in `reading-edge/` and
`reading-webkit/`. Both annotation integrations recorded zero unexpected runtime
exceptions and zero external page requests. One ResizeObserver delivery diagnostic
was recorded in the final WebKit annotation run, and two during WebKit's denied/
malformed-storage reading stress. These are tracked separately. Quarto's known
denied-storage reader/tabset exceptions
match the historical baseline. Neither Quarto behavior was modified or claimed
fixed; all other exceptions remain test failures.

An aggressively parallel validation run also hit synthetic-selection and
screenshot-stability timeouts. The DOM-assisted helpers now separate clearing a
selection from creating an identical new range and allow pending scroll events
to settle over two animation frames. Native mouse selection remains unassisted.
The final annotation runs passed with the updated helpers; physical selection
timing still requires device verification.

To rerun with Playwright available on Node's module path and the test browser cache:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:TEMP 'exp-handout-playwright'
$env:HANDOUT_BROWSER = 'edge' # repeat with 'webkit'
node verification/annotations.cjs
node verification/mobile-annotations.cjs
$env:HANDOUT_CONTENT_REFERENCE = 'index.html'
$env:HANDOUT_REPORT_DIR = "verification/annotations/reading-$env:HANDOUT_BROWSER"
node verification/check.cjs
```

## Remaining physical-device and accessibility checks

Test the local Quarto preview on the Android phone and, where possible, iOS Safari:
native long-press menus and handles near the bottom bar, selection adjustments,
physical copying, address/navigation-bar changes, notches/safe areas, keyboard
opening/panning/dismissal, rotation with an editor open, enlarged system fonts,
and Save/Cancel access inside the keyboard-reduced editor. Native menus may
overlap web controls on particular OS/browser versions; automation cannot prove
their coexistence. No browser-native selection UI has been replaced.

VoiceOver/TalkBack/NVDA speech and caret-selection workflows need hands-on checks.
CSS-painted passage marks do not themselves add screen-reader navigation stops;
My Annotations remains the explicit keyboard/assistive-technology route. The
quoted editor target, focus restoration, control names/state, modal Tab behavior,
contrast, forced-color focus and automated audits were checked as described above.
