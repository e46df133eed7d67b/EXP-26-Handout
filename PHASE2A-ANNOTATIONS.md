# Phase 2A: passage highlights and notes

Implemented locally, with no push, deployment, Pages-setting change, or separate
website modification. General notes, export, backup/restore, synchronization, and
all other Phase 2B features are not implemented.

The current model and toolbar are documented in
[Unified highlighting and adaptive toolbar](PHASE2A-UNIFIED-HIGHLIGHTS.md).
The [earlier mobile refinements](PHASE2A-MOBILE-REFINEMENTS.md) record the prior interface.

## Using annotations

Select ordinary text inside the handout's sections. On a desktop, a compact group
of actions appears near the selection. **Highlight** marks the passage;
**Add Note** previews a highlight and opens a labeled native dialog. Saving keeps
the highlight, with an optional comment; canceling a new note removes its preview.
Selecting exactly an existing passage reuses its annotation.

On desktop and touch layouts, compact highlighter/comment/dismiss icons appear
beside the actual selection: right first, then left, with a small horizontal
bottom fallback. Each button has an accessible name and a 44px touch target.
The bar closes on successful completion, dismissal, or ordinary page scrolling.
A captured range survives moving focus into its actions or editor. No native selection, clipboard,
context-menu, or touch gesture is cancelled or replaced. Actual native menus,
handles, keyboard resizing, and browser chrome still require phone testing.

Keyboard users can select text using their browser's supported selection/caret
browsing facilities, then press **Alt+Shift+A** to focus the actions. Buttons use
ordinary Tab/Enter navigation. The target is captured before focus moves. The
editor focuses the note field; Escape or Cancel closes it. After saving, focus
returns to the passage or the invoking list control without scrolling. Actual browser caret-browsing and screen-reader
selection commands still need hands-on verification.

**My Annotations** is separate from Reading Preferences and initially closed.
It shows each passage quotation, highlight state, note, and controls to locate,
edit its note, or remove the highlight. Clicking marked non-link text can open
its note editor. Overlapping annotations lead to the list instead of guessing
which annotation to edit. Links retain normal navigation. The list is the
keyboard/screen-reader route to marks; painted CSS ranges do not create a tab
stop or an automatic spoken announcement for each passage.

Each entry has one four-column action row: **Passage**, **Note**, **Remove**,
and **More**. The removal control is announced as Remove Highlight. More is a
native disclosure containing confirmed deletion.
Labels may wrap within a control at enlarged text sizes; controls stay in one row.

All annotations use the same subtle background, with no dotted note underlining.
Deleting a note keeps its highlight. Removing a highlight deletes that annotation
and asks for confirmation if a comment would also be lost. More's Delete action
and Delete Note also ask for confirmation. Locating a
passage focuses its existing block and temporarily adds a double underline;
navigation is immediate and does not animate.

Within a highlight, links use Quarto's existing stronger hover-blue palette to
maintain text contrast against the tint. Ordinary link colors are unchanged.

## How passages remain attached

`annotation-anchors.js` builds a text index once per load from the substantive
sections. Title metadata, TOC, preferences, generated heading-link icons, and
annotation controls are excluded. It normalizes whitespace and inserts one
logical space between text blocks, retaining a mapping back to original DOM text
boundaries. It does not wrap, split, replace, or rewrite handout text or links.

Every record carries:

- Exact selected text plus up to 48 characters of prefix and suffix.
- Start/end positions in that text stream, explicitly measured in JavaScript
  UTF-16 units.
- The starting and ending section-heading text.
- A SHA-256 fingerprint of the canonical document, when Web Crypto is available.

On the same document fingerprint, the saved positions are checked against the
quotation, context, and headings. On changed content, or without a fingerprint,
all of those textual checks must produce **one unique candidate**. Old positions
are never used to break an ambiguous tie. A missing or ambiguous result stays in
the list as **Unanchored**, with its note intact and navigation disabled. The
closed summary also counts unanchored records. Nothing is silently relocated.

This follows the idea of [text-quote and text-position selectors in the W3C Web
Annotation model](https://www.w3.org/TR/annotation-model/#text-quote-selector).
The local format is not claimed to be JSON-LD or a complete implementation of
that standard; UTF-16 offset units are explicitly recorded for future conversion.
Paragraph boundaries and inline italics/links are supported without special
passage-specific rules. Published substantive text should still be frozen as
planned; conservative recovery intentionally prefers an orphan to a wrong mark.

Display uses the [CSS Custom Highlight API](https://drafts.csswg.org/css-highlight-api-1/)
with live DOM ranges. Font size, typeface, spacing, width, appearance, zoom, and
viewport changes therefore do not require re-anchoring. No document scan or layout
calculation runs continuously during scrolling or preference changes. Desktop
action positioning is calculated when selection actions open; page scrolling
hides the actions on both desktop and touch layouts. Viewport resize events update
visible surfaces, coalesced into one animation frame. Visual viewport panning
dismisses the toolbar; an open editor still follows keyboard viewport changes.

Older browsers without CSS Highlight support get an explicit compatibility
message. They can still create, read, edit, and locate records through the list,
but cannot paint passage marks. Use Quarto preview/HTTP or HTTPS; directly opening
`index.html` as a `file:` URL can block JavaScript module imports.

## Saving and recovery

Annotations use **`exp-2026-10-26.annotations.v1`**, separate from the unchanged
reading-preference key. Its JSON envelope contains `version: 1`, a document ID,
and records with stable random IDs, creation/modification dates,
`highlighted` and `comment` fields, and the anchor above. New records always have
`highlighted: true`. Legacy note-only records are interpreted as highlights in
memory, without rewriting storage on load. A later explicit save persists their
promoted flag while retaining IDs, anchors, comments and other metadata.
This is structured for
later export/backup work, without adding that interface now.

Data is validated on load, including IDs, duplicate IDs, types, timestamps,
selector bounds, and size limits. Limits are 500 records, 8,000 characters per
note, and 32,000 characters per selected passage. Comments and quotations are
rendered with `textContent`, never interpreted as HTML.

- Valid records are reconstructed on reload; unresolved ones remain listed.
- Malformed JSON, incompatible versions, or invalid records preserve the
  original stored string and disable editing, rather than overwrite data.
  Valid records from a partly invalid collection can still be read.
- Read denial and write/quota failures produce explicit messages. Failed changes
  remain in the current tab, marked as not saved. A failed note save leaves the
  editor open; **Close** does not pretend that persistence succeeded. A later
  successful save includes the current in-memory records.
- A write checks whether another tab changed the stored value. If so, it refuses
  to overwrite that value and asks for a reload. This is conflict protection,
  not automatic synchronization.

If an error occurs, keep the affected tab open and copy important unsaved note
text before reloading. Do not clear site storage to troubleshoot valuable notes.
Malformed original data remains under the annotation key for developer inspection
or a later compatible recovery tool; there is no automatic reset or backup/export
button in this phase. Browser clearing/private-mode rules can still erase data.

Storage is specific to browser profile and origin (scheme, hostname, and port).
Local previews and the published website have separate annotations. Keeping a
fixed preview port avoids accidentally switching local storage buckets:

```powershell
quarto preview index.qmd --port 8765
```

There are no accounts, remote notes, analytics, or cross-device synchronization.

## Files and implementation size

| File | Purpose |
| --- | --- |
| `assets/annotation-anchors.js` | Canonical index, selectors, strict resolution, DOM range reconstruction. |
| `assets/annotations.js` | Selection/actions, editor/list, validation, and local persistence. |
| `assets/annotations.css` | Passage marks and restrained annotation controls. |
| `assets/annotations-panel.html` | Collapsible list, contextual actions, native dialog. |
| `assets/annotations-head.html` | Loads the annotation module. |
| `index.qmd` | Only YAML include/CSS entries changed; handout body unchanged. |
| `index.html` | Regenerated with Quarto 1.10.19. |
| `verification/annotations.cjs` | New annotation integration tests. |
| `verification/check.cjs`, `verification/refinements.cjs` | Existing reading tests scoped to Reading Preferences, since there are now two disclosures. |
| `verification/annotations/` | Browser evidence, screenshots, and regression reports. |
| `README.md`, this document | Usage and verification notes. |

The reading-preference HTML, CSS, JavaScript, storage key, and early theme
initializer are unchanged. The six questions, introductory material (including
the annotation sentence), contacts, quotes, and links are unchanged.

The two annotation JavaScript files and CSS remain small local assets, with
three local asset requests; panel HTML is included by Quarto. No runtime library,
framework, icon pack, remote service, observer, or polling loop was added. Idle
scrolling does not write annotation DOM state. Selection work is debounced and
uses the cached index; saved-record resolution/list painting runs after load or
annotation edits.

## Initial Phase 2A verification

The following records the initial implementation's checks. The current mobile
changes were tested again in Edge and WebKit; see the linked refinement report
for current focus/toolbar expectations, screenshots, and results.

Executed on Windows with Edge **155.0.4283.62**, Firefox **153.0**, and Playwright
WebKit **26.5**. Firefox was downloaded only as a standard temporary test browser.
All three passed the new annotation suite's functional assertions:

- Native mouse drag and DOM-assisted text selection; no action on ordinary taps
  or selection inside excluded UI/TOC.
- Independent highlight/note creation, reuse of an existing highlight, comment
  edits/deletion with highlight preservation, highlight removal, confirmed
  annotation deletion, several same-paragraph marks, inline/link selections,
  and selections across paragraphs.
- Saved reconstruction, correct passage navigation, unchanged underlying
  section markup, safe literal rendering of HTML-looking comments, and normal
  marked-link navigation (the external destination was stubbed during testing).
- Duplicate-quotation fixtures: the correct second occurrence resolves on an
  identical document; multiple identical contexts on a changed source remain
  unanchored. An unresolved stored record retains its underlying data.
- All five reading preferences with marks present, 85/100/150% text, all reading
  widths and appearance modes, and 320/375/390px viewport reflow. Edge native
  page-scale emulation also ran; this is not an actual iPhone zoom test.
- Keyboard shortcut/buttons, rapid selection changes before the debounce,
  captured target after focus/selection collapse, native editor focus/return,
  Escape, forced-colors/reduced-motion emulation, and scrolling.
- Missing/denied storage, quota failures, malformed JSON, invalid records,
  unknown versions, explicit failed-save messages, missing CSS Highlight API,
  concurrent-tab overwrite protection, and readability without JavaScript.
- DOM-assisted touch selection at 320/375/390px with 150% text, inline action-bar
  taps, simulated native-selection collapse, enlarged editor operation, and no
  horizontal page overflow or blocked scrolling.
- Axe audits of the expanded annotation list and native editor: zero detected
  WCAG A/AA violations. Screenshots of marks, list, dialogs, phone actions,
  enlarged editors, and forced-colors emulation were inspected. Separate checks
  verify at least 4.5:1 contrast for body/link text against both highlight palettes.

The existing Edge and WebKit reading-control suites and prior size/loading
regressions also completed their functional assertions. Each reading suite still
checks 63 size/viewport/width combinations. The committed pre-Phase-2 page was
also run as a WebKit control. Reports remain separate from earlier phase evidence.

**Remaining diagnostic:** WebKit intermittently emitted the exact browser message
`ResizeObserver loop completed with undelivered notifications.` during rapid
layout/storage stress. Quarto's generated script contains the page's resize
observer; this feature adds none. The isolated pre-Phase-2 control run passed
without that warning, so this is not claimed to be a proven preexisting warning
or a fixed issue. Its occurrences are recorded separately in test results, while
all other exceptions still fail tests. No lost annotations, incorrect anchors,
or blocked controls were observed with it. Quarto's previously documented
reader-mode/tabset errors under denied storage also remain unchanged.

Run the new suite from the project folder, with Playwright on Node's module path
and the temporary browser cache available:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:TEMP 'exp-handout-playwright'
$env:HANDOUT_BROWSER = 'edge' # or firefox / webkit
node verification/annotations.cjs
```

Results are `verification/annotations/{engine}/results.json`; accessibility
evidence and screenshots are in the same folder. The earlier suite scripts still
support `HANDOUT_REPORT_DIR` for separate evidence directories.

## Physical-device and accessibility checks still needed

No actual Android/iPhone long-press selection handles, native Copy/Share menu,
virtual keyboard, VoiceOver/NVDA speech, OS high-contrast setting, or device text
enlargement was tested. Touch selection in automation was prepared with DOM
Selection/Range; taps, selection-collapse recovery, scrolling, and dialogs were
then exercised in emulation. Desktop WebKit is not full iOS Safari verification.

On a phone, specifically check the bottom action bar with a long paragraph,
native selection-menu coexistence, captured quotation accuracy after scrolling,
editor buttons with the keyboard open at enlarged text sizes, orientation, and
physical copying of text across formatting. CSS range marks are not automatically
announced as annotated passages by every screen reader; verify discovery and
navigation through My Annotations. Automated accessibility checks cannot establish
complete compatibility. Keep published substantive text stable as planned.
