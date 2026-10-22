import { buildIndex, anchorForRange, positionsForRange, resolveAnchor } from "./annotation-anchors.js";

// Phase 2A only: passage highlights and plain-text comments. No text wrapping.
const key = "exp-2026-10-26.annotations.v1";
const documentId = "exp-handout-2026-10-26";
const ui = document.getElementById("annotation-ui");
const main = document.getElementById("quarto-document-content");
if (ui && main) initialize().catch(() => {
  ui.hidden = false;
  document.getElementById("annotation-status").textContent = "Annotations could not initialize. Existing browser data has not been changed.";
  document.getElementById("annotation-storage-warning").textContent = document.getElementById("annotation-status").textContent;
});

async function initialize() {
  const index = await buildIndex(main); // Once per load, never on scroll/reflow.
  const panel = document.getElementById("my-annotations");
  const list = document.getElementById("annotation-list");
  const actions = document.getElementById("annotation-actions");
  const dialog = document.getElementById("annotation-editor");
  const comment = document.getElementById("annotation-comment");
  const deleteNote = document.getElementById("annotation-delete-note");
  const status = document.getElementById("annotation-status");
  const actionStatus = document.getElementById("annotation-action-status");
  const editorStatus = document.getElementById("annotation-editor-status");
  const canPaint = !!(globalThis.CSS?.highlights && globalThis.Highlight);
  const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  ui.classList.toggle("annotation-touch", touch);
  let records = [], resolved = new Map(), lastRaw = null;
  let writeLock = false, dirty = false, pending = null, selectionTimer;
  let editingId = null, editingAnchor = null, returnFocus = null, usingActions = false;
  let draftRange = null, dismissedSelection = null;
  let viewportFrame = 0;

  // Restore a reading/focus target, never a saved scroll offset. Re-rendered
  // list controls are found by identity; passage targets do not enter Tab order.
  function focusBlock(block) {
    if (!block?.isConnected) return;
    const original = block.getAttribute("tabindex");
    if (original === null) {
      block.tabIndex = -1;
      block.addEventListener("blur", () => block.removeAttribute("tabindex"), { once: true });
    }
    block.focus({ preventScroll: true });
  }
  function focusList(id, action) {
    const entry = document.getElementById(`annotation-${id}`);
    const control = entry?.querySelector(`[data-action="${action}"]:not(:disabled)`);
    (control || entry || document.getElementById("annotation-summary")).focus({ preventScroll: true });
  }
  function passageBlock(anchor) {
    const target = resolveAnchor(index, anchor);
    return target ? index.points[target.start].block : main;
  }
  function restoreEditorFocus() {
    if (returnFocus?.id) focusList(returnFocus.id, "note");
    else focusBlock(returnFocus?.block);
  }
  function visibleViewport() {
    const v = window.visualViewport;
    return { left: v?.offsetLeft || 0, top: v?.offsetTop || 0, width: v?.width || innerWidth, height: v?.height || innerHeight };
  }
  function positionSurfaces() {
    const v = visibleViewport();
    // Fixed surfaces use the visual viewport, including its keyboard/pinch-pan
    // offsets. CSS supplies safe-area padding. No page scroll measurements.
    for (const surface of [actions, dialog]) {
      surface.style.setProperty("--annotation-vv-height", `${v.height}px`);
      surface.style.setProperty("--annotation-vv-width", `${v.width}px`);
    }
    if (dialog.open) {
      dialog.style.left = `${v.left + v.width / 2}px`;
      dialog.style.top = `${v.top + (touch ? v.height - 8 : v.height / 2)}px`;
      // Keyboard resizing can shrink the editor after initial focus. Reveal
      // the field by scrolling only the dialog's own content, never the page.
      if (document.activeElement === comment) {
        const field = comment.getBoundingClientRect(), box = dialog.getBoundingClientRect();
        if (field.bottom > box.bottom - 8) dialog.scrollTop += field.bottom - box.bottom + 8;
        else if (field.top < box.top + 8) dialog.scrollTop -= box.top + 8 - field.top;
      }
    }
    if (actions.hidden || !pending) return;
    positionActions(v);
  }
  function positionActions(v) {
    const css = getComputedStyle(actions);
    const inset = side => 8 + (parseFloat(css.getPropertyValue(`--annotation-safe-${side}`)) || 0);
    const bounds = { left: v.left + inset("left"), right: v.left + v.width - inset("right"), top: v.top + inset("top"), bottom: v.top + v.height - inset("bottom") };
    // Merge inline fragments into visible lines. No paragraph boxes, document
    // scans, or saved-record resolution are needed to place the toolbar.
    const lines = [];
    const rects = [...pending.range.getClientRects()].filter(r => r.width && r.height && r.right > bounds.left && r.left < bounds.right && r.bottom > bounds.top && r.top < bounds.bottom).sort((a, b) => a.top - b.top || a.left - b.left);
    for (const r of rects) {
      const last = lines.at(-1);
      if (last && r.top < last.bottom - 2) {
        last.left = Math.min(last.left, r.left); last.right = Math.max(last.right, r.right); last.bottom = Math.max(last.bottom, r.bottom);
      } else lines.push({ left: r.left, right: r.right, top: Math.max(r.top, bounds.top), bottom: Math.min(r.bottom, bounds.bottom) });
    }
    actions.classList.remove("annotation-bottom");
    const width = actions.offsetWidth, height = actions.offsetHeight, gap = 16;
    const overlaps = box => lines.some(r => box.left < r.right + 4 && box.right > r.left - 4 && box.top < r.bottom + 4 && box.bottom > r.top - 4);
    if (!actionStatus.textContent && height <= bounds.bottom - bounds.top) {
      for (const side of ["right", "left"]) {
        for (const line of lines) {
          const left = side === "right" ? line.right + gap : line.left - gap - width;
          const top = Math.max(bounds.top, Math.min(line.top, bounds.bottom - height));
          const box = { left, right: left + width, top, bottom: top + height };
          if (left >= bounds.left && box.right <= bounds.right && !overlaps(box)) {
            actions.dataset.placement = side;
            actions.style.left = `${left}px`; actions.style.top = `${top}px`;
            return;
          }
        }
      }
    }
    // Ambiguous/full-width selections use a small horizontal tray. Its fixed
    // touch targets do not expand into three large text buttons at 150% text.
    actions.classList.add("annotation-bottom"); actions.dataset.placement = "bottom";
    actions.style.left = `${Math.max(bounds.left, v.left + (v.width - actions.offsetWidth) / 2)}px`;
    actions.style.top = `${Math.max(bounds.top, bounds.bottom - actions.offsetHeight)}px`;
  }
  function viewportChanged() {
    if ((actions.hidden && !dialog.open) || viewportFrame) return;
    viewportFrame = requestAnimationFrame(() => { viewportFrame = 0; positionSurfaces(); });
  }

  function announce(message) {
    status.textContent = message;
    if (ui.hidden) document.getElementById("annotation-storage-warning").textContent = message;
    if (!actions.hidden) { actionStatus.textContent = message; viewportChanged(); }
    if (dialog.open) editorStatus.textContent = message;
  }
  function text(value, max) { return typeof value === "string" && value.length <= max; }
  function valid(record) {
    const a = record?.anchor, p = a?.position, q = a?.quote, scope = a?.scope;
    return record && typeof record.id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(record.id) &&
      typeof record.highlighted === "boolean" && text(record.comment, 8000) &&
      (record.highlighted || record.comment.trim()) &&
      typeof record.created === "string" && Number.isFinite(Date.parse(record.created)) &&
      typeof record.modified === "string" && Number.isFinite(Date.parse(record.modified)) &&
      (a?.documentHash === null || (typeof a?.documentHash === "string" && /^[a-f0-9]{64}$/.test(a.documentHash))) &&
      p?.unit === "utf16" && Number.isSafeInteger(p.start) && Number.isSafeInteger(p.end) &&
      p.start >= 0 && p.end > p.start &&
      text(q?.exact, 32000) && q.exact.length > 0 && p.end - p.start === q.exact.length &&
      text(q.prefix, 48) && text(q.suffix, 48) &&
      text(scope?.startHeading, 500) && text(scope?.endHeading, 500);
  }
  try {
    lastRaw = localStorage.getItem(key);
    if (lastRaw !== null) {
      const data = JSON.parse(lastRaw);
      if (data?.version !== 1 || data.documentId !== documentId || !Array.isArray(data.annotations) || data.annotations.length > 500) throw Error("schema");
      const ids = new Set();
      for (const record of data.annotations) {
        if (!valid(record) || ids.has(record.id)) { writeLock = true; continue; }
        ids.add(record.id);
        // Version 1 remains readable. Promote legacy note-only records in
        // memory without changing identity/anchor/metadata or writing on load.
        records.push(record.highlighted ? record : { ...record, highlighted: true });
      }
      if (writeLock) announce("Some stored annotations are invalid. Original data is preserved; editing is disabled to avoid overwriting it.");
    }
  } catch {
    if (lastRaw !== null) {
      writeLock = true;
      announce("Stored annotation data could not be read. It is preserved unchanged; editing is disabled. See the project documentation for recovery guidance.");
    } else announce("Browser storage is unavailable. Annotation changes will remain in this tab unless a save succeeds.");
  }

  function persist(verb) {
    dirty = true;
    if (writeLock) { announce("Not saved. Editing is disabled to protect existing annotation data."); return false; }
    try {
      if (localStorage.getItem(key) !== lastRaw) {
        writeLock = true;
        announce("Not saved: annotations changed in another tab. Reload before editing; this tab's changes remain only here.");
        return false;
      }
      const raw = JSON.stringify({ version: 1, documentId, annotations: records });
      localStorage.setItem(key, raw);
      lastRaw = raw;
      dirty = false;
      announce(`${verb} Saved in this browser.`);
      return true;
    } catch {
      announce("Not saved: browser storage failed. Changes exist only in this tab and may be lost when it closes.");
      return false;
    }
  }
  function shorten(value, length = 180) { return value.length > length ? value.slice(0, length) + "…" : value; }
  function element(tag, value, className) {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = value;
    if (className) el.className = className;
    return el;
  }
  function button(label, action, id, disabled = false) {
    const el = element("button", label);
    el.type = "button";
    el.dataset.action = action;
    el.dataset.id = id;
    el.disabled = disabled;
    return el;
  }
  function compactControl(label, name, action, id, disabled, icon) {
    const el = button("", action, id, disabled);
    el.setAttribute("aria-label", name);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    const path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", icon); svg.append(path);
    el.append(svg, element("span", label));
    return el;
  }
  function paint() {
    if (canPaint) {
      const highlights = new Highlight();
      for (const record of records) {
        const target = resolved.get(record.id);
        if (!target) continue;
        highlights.add(target.range);
      }
      if (draftRange) highlights.add(draftRange);
      CSS.highlights.set("handout-highlights", highlights);
    }
  }
  function render() {
    resolved = new Map(records.map(record => [record.id, resolveAnchor(index, record.anchor)]));
    paint();
    // If the reader left the disclosure open above a passage, growing its list
    // must not push that passage down.
    // Hold its current box during body annotation; all updated entries remain
    // available by internal scrolling. An explicit collapse/reopen releases it.
    if (panel.open && !panel.contains(document.activeElement) && !(dialog.open && returnFocus?.id) && !panel.style.height) {
      panel.style.height = `${panel.getBoundingClientRect().height}px`;
      panel.style.overflow = "auto";
    }
    list.replaceChildren();
    for (const record of records) {
      const entry = element("li");
      entry.id = `annotation-${record.id}`;
      entry.tabIndex = -1;
      entry.append(element("blockquote", shorten(record.anchor.quote.exact)));
      const state = ["Highlighted", record.comment ? "With note" : "No note"];
      if (!resolved.get(record.id)) state.push("Unanchored — the passage could not be identified confidently");
      if (dirty) state.push(status.textContent);
      entry.append(element("p", state.join(" · ")));
      if (record.comment) entry.append(element("p", record.comment, "annotation-comment"));
      const controls = element("div", undefined, "annotation-row");
      const highlight = compactControl("Remove", "Remove Highlight", "highlight", record.id, writeLock, "m9 4 11 11-5 5L4 9zM4 9l-2 5 5-2M2 21h14");
      const more = element("details", undefined, "annotation-more");
      const summary = element("summary"); summary.setAttribute("aria-label", "More annotation actions");
      summary.append(element("span", "•••", "annotation-more-icon"), element("span", "More"));
      const menu = element("div", undefined, "annotation-menu");
      menu.append(button("Delete Annotation", "delete", record.id, writeLock));
      more.append(summary, menu);
      controls.append(compactControl("Passage", "Go to passage", "go", record.id, !resolved.get(record.id), "M4 5h16v14H4zM8 9h8M8 13h5"),
        compactControl("Note", record.comment ? "Edit Note" : "Add Note", "note", record.id, writeLock, "M4 4h16v12h-9l-5 4v-4H4zM8 8h8M8 12h5"),
        highlight, more);
      entry.append(controls); list.append(entry);
    }
    const unanchored = [...resolved.values()].filter(target => !target).length;
    document.getElementById("annotation-summary").textContent = `My Annotations (${records.length}${unanchored ? `; ${unanchored} unanchored` : ""})`;
    document.getElementById("annotation-empty").hidden = records.length > 0;
  }
  function existing(anchor) {
    const target = resolveAnchor(index, anchor);
    if (!target) return null;
    return records.find(record => {
      const other = resolved.get(record.id);
      return other && target.start === other.start && target.end === other.end;
    });
  }
  function create(anchor) {
    if (records.length >= 500) { announce("The limit of 500 annotations has been reached. No new annotation was created."); return null; }
    if (anchor.quote.exact.length > 32000 || anchor.scope.startHeading.length > 500 || anchor.scope.endHeading.length > 500) {
      announce("This selection is too long to store reliably. Choose a shorter passage."); return null;
    }
    const id = "a-" + [...crypto.getRandomValues(new Uint8Array(12))].map(n => n.toString(16).padStart(2, "0")).join("");
    const now = new Date().toISOString();
    const record = { id, created: now, modified: now, highlighted: true, comment: "", anchor };
    records.push(record);
    return record;
  }
  function commit(record, verb) {
    record.modified = new Date().toISOString();
    const saved = persist(verb);
    render();
    return saved;
  }
  function hideActions(clear = false) {
    if (!actions.hidden) actions.hidden = true;
    if (clear) pending = null;
  }
  function dismissActions() {
    const selection = getSelection();
    if (pending) dismissedSelection = { start: pending.start, end: pending.end, range: selection?.rangeCount === 1 ? selection.getRangeAt(0) : null };
    clearTimeout(selectionTimer);
    hideActions(true);
  }
  function showActions() {
    if (!pending || dialog.open || writeLock) return;
    const found = existing(pending.anchor);
    const highlight = actions.querySelector('[data-action="highlight"]');
    highlight.disabled = !!found?.highlighted;
    highlight.setAttribute("aria-label", found ? "Already highlighted" : "Highlight");
    highlight.title = found ? "Already highlighted" : "Highlight";
    const note = actions.querySelector('[data-action="note"]');
    note.setAttribute("aria-label", found?.comment ? "Edit Note" : "Add Note");
    note.title = found?.comment ? "Edit Note" : "Add Note";
    document.getElementById("annotation-action-quote").textContent = `“${shorten(pending.anchor.quote.exact, 100)}”`;
    actionStatus.textContent = "";
    actions.hidden = false;
    positionSurfaces();
  }
  function captureSelection(show = true) {
    if (dialog.open || usingActions) return;
    const selection = getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
      dismissedSelection = null;
      // A focused action keeps its captured target; otherwise the selection
      // interaction has ended. Pointer activation is protected by usingActions.
      if (!actions.contains(document.activeElement)) hideActions(true);
      return;
    }
    const liveRange = selection.getRangeAt(0), range = liveRange.cloneRange();
    const anchor = anchorForRange(index, range);
    if (!anchor) { hideActions(true); return; }
    const { start, end } = anchor.position;
    if (dismissedSelection?.range === liveRange && dismissedSelection.start === start && dismissedSelection.end === end) return;
    dismissedSelection = null;
    pending = { anchor, range, start, end };
    if (show) showActions();
  }
  function openEditor(record, anchor, opener) {
    editingId = record?.id || null;
    editingAnchor = record?.anchor || anchor;
    draftRange = record ? null : resolveAnchor(index, editingAnchor)?.range;
    if (draftRange) paint(); // Temporary preview; no new saved record until Save.
    returnFocus = opener?.closest("#annotation-list") ? { id: record.id } : { block: passageBlock(editingAnchor) };
    document.getElementById("annotation-editor-quote").textContent = shorten(editingAnchor.quote.exact, 600);
    comment.value = record?.comment || "";
    comment.setCustomValidity("");
    editorStatus.textContent = "";
    document.getElementById("annotation-cancel").textContent = "Cancel";
    deleteNote.hidden = !record?.comment;
    hideActions();
    // Position before showModal performs native initial focus, then adjust for
    // the actual rendered size. The textarea remains inside a fixed dialog.
    const v = visibleViewport();
    dialog.style.left = `${v.left + v.width / 2}px`;
    dialog.style.top = `${v.top + (touch ? v.height - 8 : v.height / 2)}px`;
    dialog.style.setProperty("--annotation-vv-height", `${v.height}px`);
    dialog.style.setProperty("--annotation-vv-width", `${v.width}px`);
    dialog.showModal();
    positionSurfaces();
    comment.focus({ preventScroll: true });
  }
  function closeEditor() {
    // The invoker can be hidden or removed by render(). Restore its stable
    // replacement without opening the annotations panel or requesting a scroll.
    dialog.close();
    restoreEditorFocus();
  }
  dialog.addEventListener("close", () => {
    if (draftRange) { draftRange = null; paint(); }
    restoreEditorFocus();
    dismissActions();
  });
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeEditor(); });
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("textarea,button:not(:disabled)")].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  });
  document.getElementById("annotation-cancel").addEventListener("click", closeEditor);
  comment.addEventListener("input", () => comment.setCustomValidity(""));
  document.getElementById("annotation-form").addEventListener("submit", event => {
    event.preventDefault();
    if (writeLock) return;
    if (comment.value.length > 8000) {
      comment.setCustomValidity("Keep the note within 8,000 characters.");
      comment.reportValidity(); return;
    }
    const record = records.find(other => other.id === editingId) || existing(editingAnchor) || create(editingAnchor);
    if (!record) return;
    editingId = record.id;
    record.comment = comment.value.trim() ? comment.value : "";
    draftRange = null;
    if (commit(record, "Note updated.")) closeEditor();
    else {
      deleteNote.hidden = false;
      document.getElementById("annotation-cancel").textContent = "Close";
    }
  });
  deleteNote.addEventListener("click", () => {
    const record = records.find(other => other.id === editingId);
    if (writeLock || !record || !confirm("Delete this note? The highlight will remain.")) return;
    record.comment = "";
    if (commit(record, "Note deleted.")) closeEditor();
    else {
      comment.value = "";
      deleteNote.hidden = true;
      document.getElementById("annotation-cancel").textContent = "Close";
    }
  });

  actions.addEventListener("pointerdown", () => {
    if (!getSelection()?.isCollapsed) captureSelection(false);
    usingActions = true;
  });
  document.addEventListener("pointerup", () => { if (usingActions) setTimeout(() => { usingActions = false; }, 0); });
  document.addEventListener("pointercancel", () => { usingActions = false; });
  actions.addEventListener("click", event => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    if (action === "dismiss") { const block = pending && passageBlock(pending.anchor); dismissActions(); focusBlock(block); return; }
    if (!pending || writeLock) return;
    let record = existing(pending.anchor);
    if (action === "note") openEditor(record, pending.anchor, event.target);
    if (action === "highlight") {
      record ||= create(pending.anchor);
      if (!record) return;
      record.highlighted = true;
      if (commit(record, "Passage highlighted.")) {
        const block = passageBlock(record.anchor);
        dismissActions(); focusBlock(block);
      }
    }
  });
  list.addEventListener("click", event => {
    const control = event.target.closest("button");
    const record = records.find(other => other.id === control?.dataset.id);
    if (!record) return;
    const action = control.dataset.action;
    if (action === "go") {
      const target = resolved.get(record.id);
      if (!target) return;
      hideActions(true);
      if (canPaint) CSS.highlights.set("handout-current", new Highlight(target.range));
      const block = index.points[target.start].block;
      // Only the destination block gets a temporary focus target, not each mark.
      const original = block.getAttribute("tabindex");
      block.tabIndex = -1;
      block.focus({ preventScroll: true });
      block.scrollIntoView({ block: "center", behavior: "instant" });
      block.addEventListener("blur", () => {
        if (original === null) block.removeAttribute("tabindex"); else block.setAttribute("tabindex", original);
        if (canPaint) CSS.highlights.delete("handout-current");
      }, { once: true });
      announce("Passage located. Use My Annotations to edit its note or highlight.");
    } else if (!writeLock && action === "note") openEditor(record, null, control);
    else if (!writeLock && (action === "highlight" || action === "delete")) {
      const question = action === "delete" ? "Delete this highlight and any attached note?" : "Remove this highlight and delete its attached note?";
      if ((action === "delete" || record.comment) && !confirm(question)) return;
      const neighbor = records[records.indexOf(record) + 1] || records[records.indexOf(record) - 1];
      records = records.filter(other => other.id !== record.id);
      persist("Annotation deleted."); render();
      focusList(neighbor?.id, "go");
    }
  });
  list.addEventListener("toggle", event => {
    const more = event.target;
    if (!more.matches(".annotation-more") || !more.open) return;
    more.classList.remove("annotation-menu-below");
    const clipTop = Math.max(visibleViewport().top, panel.style.height ? panel.getBoundingClientRect().top : 0);
    if (more.querySelector(".annotation-menu").getBoundingClientRect().top < clipTop + 8) more.classList.add("annotation-menu-below");
  }, { capture: true });
  panel.addEventListener("toggle", () => { panel.style.removeProperty("height"); panel.style.removeProperty("overflow"); });
  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(captureSelection, 140);
  });
  document.addEventListener("keydown", event => {
    if (!dialog.open && event.shiftKey && /^(Arrow|Home|End)/u.test(event.key)) dismissedSelection = null;
    if (event.altKey && event.shiftKey && event.code === "KeyA" && !dialog.open) {
      dismissedSelection = null;
      captureSelection(false); // Refresh even before the debounce fires; do not move a pressed button.
      if (pending && !writeLock) {
        event.preventDefault(); showActions();
        actions.querySelector('button:not(:disabled)').focus({ preventScroll: true });
      }
    } else if (event.key === "Escape" && !dialog.open) {
      const more = event.target.closest?.(".annotation-more[open]");
      if (more) { more.open = false; more.querySelector("summary").focus({ preventScroll: true }); }
      else if (!actions.hidden) { const block = pending && passageBlock(pending.anchor); dismissActions(); focusBlock(block); }
    }
  });
  // Scrolling dismisses instead of tracking the selection on either device.
  document.addEventListener("scroll", event => { if (event.target === document && !dialog.open) dismissActions(); }, { passive: true });
  window.addEventListener("resize", viewportChanged, { passive: true });
  window.visualViewport?.addEventListener("resize", viewportChanged, { passive: true });
  window.visualViewport?.addEventListener("scroll", () => { if (dialog.open) viewportChanged(); else dismissActions(); }, { passive: true });
  main.addEventListener("pointerdown", event => { if (!event.target.closest("[data-annotation-ui]")) dismissedSelection = null; });
  main.addEventListener("click", event => {
    if (dialog.open || !getSelection()?.isCollapsed || event.target.closest('a,button,input,textarea,summary,[data-annotation-ui],#reading-preferences')) return;
    if (touch) hideActions(true);
    const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
    const range = caret ? document.createRange() : document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (caret) { range.setStart(caret.offsetNode, caret.offset); range.collapse(true); }
    if (!range) return;
    const offset = positionsForRange(index, (() => {
      const r = range.cloneRange();
      if (r.startContainer.nodeType !== Node.TEXT_NODE || r.startOffset >= r.startContainer.length) return r;
      r.setEnd(r.startContainer, r.startOffset + 1); return r;
    })())?.start;
    if (offset === undefined) return;
    const matches = records.filter(record => {
      const target = resolved.get(record.id);
      return target && offset >= target.start && offset < target.end &&
        [...target.range.getClientRects()].some(rect => event.clientX >= rect.left - 1 && event.clientX <= rect.right + 1 && event.clientY >= rect.top - 1 && event.clientY <= rect.bottom + 1);
    });
    if (matches.length === 1 && !writeLock) openEditor(matches[0], null, event.target);
    if (matches.length > 1) {
      panel.open = true;
      document.getElementById(`annotation-${matches[0].id}`)?.focus();
      announce("Several annotations overlap here. Choose the intended entry in My Annotations.");
    }
  });

  const preferences = document.getElementById("reading-preferences");
  if (preferences) preferences.after(ui); else main.prepend(ui);
  if (!canPaint) document.getElementById("annotation-support").textContent = "This browser cannot paint passage marks. Annotations remain available in this list; use a current browser for visible highlights.";
  ui.hidden = false;
  render();
}
