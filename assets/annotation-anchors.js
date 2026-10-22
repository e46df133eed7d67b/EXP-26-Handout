/* Text-only anchoring. UTF-16 offsets address a canonical stream, not pixels.
   Each normalized character retains its original DOM boundaries. */
export async function buildIndex(main) {
  const sections = [...main.children].filter(el => el.tagName === "SECTION");
  const chars = [], points = [];
  let previousBlock;
  for (const section of sections) {
    const heading = section.querySelector("h2,h3,h4,h5,h6");
    const headingText = heading ? [...heading.childNodes].filter(n => !n.classList?.contains("anchorjs-link")).map(n => n.textContent).join("").trim() : "";
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent.closest('[data-annotation-ui],script,style,button,svg,.anchorjs-link,[aria-hidden="true"]')) continue;
      const block = parent.closest("p,li,h2,h3,h4,h5,h6,blockquote");
      if (!block || !section.contains(block)) continue;
      for (let offset = 0; offset < node.length; offset++) {
        const whitespace = /\s/u.test(node.data[offset]);
        if (block !== previousBlock && chars.length && chars.at(-1) !== " ") {
          const last = points.at(-1);
          chars.push(" ");
          points.push({ startNode: last.endNode, startOffset: last.endOffset, endNode: node, endOffset: offset, heading: headingText, block });
        }
        previousBlock = block;
        if (whitespace && (!chars.length || chars.at(-1) === " ")) {
          if (chars.length) Object.assign(points.at(-1), { endNode: node, endOffset: offset + 1 });
          continue;
        }
        chars.push(whitespace ? " " : node.data[offset]);
        points.push({ startNode: node, startOffset: offset, endNode: node, endOffset: offset + 1, heading: headingText, block });
      }
    }
  }
  if (chars.at(-1) === " ") { chars.pop(); points.pop(); }
  const text = chars.join("");
  let hash = null;
  if (globalThis.crypto?.subtle) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    hash = [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
  }
  return { text, points, hash, sections };
}

function lowerBound(points, test) {
  let low = 0, high = points.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (test(points[mid])) high = mid;
    else low = mid + 1;
  }
  return low;
}

export function positionsForRange(index, range) {
  const eligible = node => index.sections.some(section => section.contains(node)) &&
    !(node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('[data-annotation-ui],.anchorjs-link,[aria-hidden="true"]');
  if (!eligible(range.startContainer) || !eligible(range.endContainer)) return null;
  const startBoundary = range.cloneRange(); startBoundary.collapse(true);
  const endBoundary = range.cloneRange(); endBoundary.collapse(false);
  let start = lowerBound(index.points, p => startBoundary.comparePoint(p.endNode, p.endOffset) > 0);
  let end = lowerBound(index.points, p => endBoundary.comparePoint(p.startNode, p.startOffset) >= 0);
  while (index.text[start] === " " && start < end) start++;
  while (index.text[end - 1] === " " && end > start) end--;
  return end > start ? { start, end } : null;
}

export function anchorForRange(index, range) {
  const position = positionsForRange(index, range);
  if (!position) return null;
  const { start, end } = position;
  return {
    documentHash: index.hash,
    position: { start, end, unit: "utf16" },
    quote: { exact: index.text.slice(start, end), prefix: index.text.slice(Math.max(0, start - 48), start), suffix: index.text.slice(end, end + 48) },
    scope: { startHeading: index.points[start].heading, endHeading: index.points[end - 1].heading }
  };
}

export function rangeForPositions(index, start, end) {
  if (!index.points[start] || !index.points[end - 1]) return null;
  const first = index.points[start], last = index.points[end - 1];
  const range = document.createRange();
  range.setStart(first.startNode, first.startOffset);
  range.setEnd(last.endNode, last.endOffset);
  return range;
}

export function resolveAnchor(index, anchor) {
  const { exact, prefix, suffix } = anchor.quote;
  const matches = start => {
    const end = start + exact.length;
    return index.text.slice(start, end) === exact &&
      index.text.slice(Math.max(0, start - prefix.length), start) === prefix &&
      index.text.slice(end, end + suffix.length) === suffix &&
      index.points[start]?.heading === anchor.scope.startHeading &&
      index.points[end - 1]?.heading === anchor.scope.endHeading;
  };
  let start = anchor.position.start;
  if (!(index.hash && anchor.documentHash === index.hash && matches(start))) {
    // On a changed source (or without a digest), require a unique full-context
    // match. Never choose the first occurrence or the nearest old offset.
    const candidates = [];
    for (let at = index.text.indexOf(exact); at !== -1; at = index.text.indexOf(exact, at + 1)) {
      if (matches(at)) candidates.push(at);
      if (candidates.length > 1) return null;
    }
    if (candidates.length !== 1) return null;
    start = candidates[0];
  }
  const end = start + exact.length;
  return { start, end, range: rangeForPositions(index, start, end) };
}
