# Phase 2A: unified highlights and adaptive toolbar

Implemented locally; no commit, push, deployment, Pages-setting change, or Phase
2B feature. `index.qmd`, the text-anchoring module, and all reading-preference
assets retain their exact pre-refinement SHA-256 hashes.

## Highlight-first behavior and compatibility

Every annotation now represents a background highlight, optionally with a note.
All passages use the same existing light/dark tint. The separate dotted note
underline and note-only list state have been removed. Hyperlinks retain the
existing stronger link color within highlights; no text wrappers or permanent
comment icons are inserted.

Highlight creates a saved highlight immediately. Add Note displays a temporary
highlight and opens the existing local editor. Saving creates/reuses the passage
record and keeps its highlight; an empty note is allowed. Canceling a new note
removes only the preview, with no record or storage write. Canceling an existing
note leaves its saved highlight/comment unchanged. A failed explicit save still
keeps its unsaved in-memory record and visible failure, as before.

Deleting a comment preserves the highlight. The list retains four compact
controls: Passage, Note, Remove, More. Remove is announced as **Remove Highlight**:
it deletes a highlight without a comment immediately, but asks for confirmation
before also deleting an attached comment. More's Delete action remains confirmed.
The entry explicitly says Highlighted and With note/No note; neither comment
presence nor meaning relies on color alone. There is no toggle into a note-only
state.

The storage key and version-1 schema remain unchanged. After validation, old
`highlighted: false` records with comments are copied into memory with
`highlighted: true`. Their IDs, anchors, comments, timestamps and other fields are
preserved. Loading does not rewrite the original browser value. The next explicit
successful save includes the normalized flag, using the existing concurrent-tab
comparison and failure protections. Partly invalid/read-only stores are never
silently overwritten. Unresolved legacy passages remain unanchored with their
comments intact. No anchoring algorithm changes or duplicate records are needed.

## Compact positioning and preserved editor

The three native icon buttons are Highlight, Add/Edit Note and Dismiss, each with
an accessible name, a native tooltip and a 44×44 CSS-pixel target. SVGs are inline,
decorative and excluded from keyboard/assistive-technology navigation. Normal
toolbar dimensions are **52×144px vertically** and **144×52px horizontally**.
At enlarged reading text, the icon targets retain these compact sizes. Browser
zoom still magnifies CSS pixels normally.

Placement uses `Range.getClientRects()` for the actual selected text. Inline
fragments are merged into visible lines, clipped to the visual viewport. The
algorithm tries right-side candidates first, then left-side candidates, with a
16px gap from selected text. A candidate must fit the safe viewport and avoid
overlapping the selected lines. If neither side fits, the toolbar becomes a
small centered horizontal tray near the visible bottom. A storage-failure message
can enlarge that tray so the error remains readable.

The toolbar never moves into paragraph flow or requests a page scroll. Selection
work remains debounced. Completed selections and relevant viewport resizes trigger
placement; ordinary document scrolling or visual-viewport panning dismisses it.
The dismissed live selection cannot immediately reopen it through a queued event;
a fresh selection, explicit pointer selection, or keyboard shortcut can reopen
it. There is no continuous scroll tracking. Native selection, handles, menus,
clipboard events and link navigation are not canceled or replaced.

The existing native modal editor and touch bottom sheet remain. The quoted
target, labeled textarea, Tab/Shift+Tab containment, Escape/Cancel, local focus
return with `preventScroll`, safe-area handling and keyboard viewport resizing
remain intact. A new draft only repaints cached ranges; it does not rebuild the
text index or resolve every saved anchor. Cancel removes that draft. The earlier
open-disclosure height protection still prevents list growth above a passage
from pushing it down while annotating.

Touch-to-keyboard testing found that Alt+Shift+A could focus an icon without the
browser matching `:focus-visible`. These three buttons now have an explicit,
inset focus outline for both native focus paths, including forced colors. No
animation was introduced; reduced-motion operation remains immediate.

## Measured resource changes

Uncompressed source bytes, compared with `verification/unified-before.json`:

| Asset | Before | After | Change |
| --- | ---: | ---: | ---: |
| `assets/annotations.js` | 25,713 | 28,650 | +2,937 |
| `assets/annotations.css` | 6,658 | 6,581 | −77 |
| Included annotation-panel HTML | 2,446 | 2,992 | +546 |

JavaScript plus CSS grows by **2,860 bytes**; the included HTML adds 546 bytes.
There are no new runtime dependencies or network requests. The same three local
annotation assets load: CSS, the annotation module, and its anchoring module.

With 200 saved highlights, instrumented Edge and WebKit runs observed one initial
index build and 200 initial anchor resolutions. Showing a selection added one
selected-target resolution, not 200; opening/canceling its note editor brought
the additional total to four. Ordinary scrolling added **zero** index builds,
anchor resolutions, or Range-rectangle measurements. Test instrumentation is
injected only in the browser harness, not shipped in the handout.

Starting/canceling a new draft rebuilds the CSS Highlight set from cached ranges,
so that paint operation still scales with the number of highlights. Placement
measures only the selected range and the small toolbar, with an additional size
measurement when switching to fallback. Selection/editor timings in the raw
report include browser automation and the debounce; they are not a controlled
speed benchmark. No numerical speed improvement or physical-phone performance
improvement is claimed.

## Verification actually executed

Microsoft Edge **155.0.4283.62** and Playwright WebKit **26.5**, on Windows:

- New unified suite: plain highlight; Add Note highlight preview; cancel without
  an unintended record; optional empty note; reuse, edit and cancel; comment
  removal preserving the highlight; declined/accepted removal of a highlight
  with a comment; removal without a comment; reload.
- Legacy version-1 fixtures: exact stored value unchanged on load, original
  IDs/anchors/creation metadata preserved, note-only comments highlighted,
  unanchored comments retained, normalized flags written only on explicit save.
- Real Range selections at 320/375/390px produce right, left, and compact bottom
  placement. Screenshots were inspected for all three positions. Screen-edge
  selections, multiline selection, no page overflow, no scroll on toolbar
  appearance, and dismissal on ordinary touch-emulated scrolling are checked.
- Enlarged 150% text and dark toolbar, keyboard shortcut/focus, forced-colors and
  reduced-motion emulation; Edge page-scale 2 keeps the toolbar within the visual
  viewport. Axe reports zero violations in the tested light fallback and enlarged
  dark toolbar.
- Existing integration suites, updated for the new model, pass in both engines:
  actual mouse drag, safe note text, italics/hyperlinks and cross-paragraph marks,
  repeated/ambiguous text, restoration, Go to passage, local editor focus,
  keyboard use, storage denial/quota/corrupt/unsupported data, concurrent-tab
  protection, missing Highlight API, no-JS readability and normal link behavior.
- Both integrations change font size through 85/100/150%, all typefaces including
  Atkinson Hyperlegible, spacing, reading width, and appearance with saved marks.
  Body/link contrast checks retain at least 4.5:1 in both highlight palettes.
- The prior mobile regression suite passes in both engines: 320/375/390px at
  100/150% text, one-row list actions, note save/cancel without jumping, protecting
  comments on removal, native modal Tab/Shift+Tab/Escape, viewport rotation,
  keyboard viewport geometry, ordinary copying event behavior, and actual long
  paragraphs (about 2,066px high at 320px/150%). A real OS keyboard is not emulated.
- Existing annotation list/editor/mobile disclosure Axe scans detect zero
  violations. Automated audits do not establish complete accessibility.
- Quarto rendering, JavaScript syntax checks, whitespace checks and unchanged
  source/reading/anchor hashes pass.

Reports and screenshots are in `verification/unified/{edge,webkit}/` and the
updated `verification/annotations/{edge,webkit}/`. The existing reading-only
63-layout reports are historical; this refinement reran the integration tests
that change reading preferences with annotations, rather than claiming those
older reports as fresh runs.

WebKit can emit the previously documented Quarto ResizeObserver delivery
diagnostic during viewport stress (three were recorded in an adaptive-toolbar
run, and one in an integration run). Counts are retained in each report; no other
unexpected runtime exceptions or external page requests were recorded. This framework diagnostic is unchanged and is not
claimed fixed. The initial new focus check failed before the explicit toolbar
outline correction; the completed suite includes that corrected check.

## Files changed

- `assets/annotations.js`, `assets/annotations.css`, `assets/annotations-panel.html`.
- `index.html`, regenerated from the unchanged Quarto source.
- `verification/annotations.cjs`, `verification/mobile-annotations.cjs` (updated
  expectations); `verification/unified-annotations.cjs` (new); baseline hash/size
  snapshot and generated evidence under `verification/`.
- `README.md`, `PHASE2A-ANNOTATIONS.md`, this report, and a historical-report
  pointer in `PHASE2A-MOBILE-REFINEMENTS.md`.

## Physical-phone checks still required

Native Android/iOS menus and handles are not exposed to web layout APIs. The 16px
gap and conservative fallback avoid replacing that interface, but screenshots
from emulation cannot prove coexistence with each OS menu/handle placement. Check
long-press, handle adjustment, copying, menu overlap, links, ordinary scrolling,
and reselecting the same passage on the actual Android phone before publication.

Also check browser chrome, safe-area insets/notches, rotation, pinch zoom, software
keyboard opening/panning/dismissal and editor buttons at large system text sizes.
A side toolbar may temporarily overlay nearby unselected text; Dismiss or
scrolling clears it. TalkBack/VoiceOver/NVDA speech and caret-selection workflows
need hands-on testing. CSS-painted marks do not themselves add keyboard stops;
My Annotations remains the explicit keyboard/assistive-technology route.

Use the same local Quarto preview hostname and port as before when checking
existing notes: browser storage remains specific to that origin.
