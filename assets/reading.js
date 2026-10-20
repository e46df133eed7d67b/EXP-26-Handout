/* Reading appearance only. Handout text nodes are never wrapped or replaced,
   leaving structural/text-based passage anchoring available for Phase 2. */
(() => {
  "use strict";
  const key = "exp-2026-10-26.reading.v1";
  const defaults = { size: 100, font: "sans", appearance: "system", spacing: "normal", width: "standard" };
  const choices = {
    font: ["sans", "serif", "atkinson"],
    appearance: ["system", "light", "dark"],
    spacing: ["compact", "normal", "spacious"],
    width: ["narrow", "standard", "wide"]
  };
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const panel = document.getElementById("reading-preferences");
  const main = document.getElementById("quarto-document-content");
  if (!panel || !main) return;

  // Validate saved data; old or malformed values cannot become CSS or markup.
  function validate(value) {
    const result = { ...defaults };
    if (!value || typeof value !== "object") return result;
    if (Number.isInteger(value.size) && value.size >= 85 && value.size <= 150 && value.size % 5 === 0) {
      result.size = value.size;
    }
    for (const name of Object.keys(choices)) {
      if (choices[name].includes(value[name])) result[name] = value[name];
    }
    return result;
  }

  let preferences = { ...defaults };
  let storageAvailable = true;
  try {
    const saved = localStorage.getItem(key);
    try { preferences = validate(JSON.parse(saved)); }
    catch { /* Ignore damaged saved data; storage itself may still work. */ }
    // A successful read does not guarantee writes are allowed (e.g. quota).
    const probe = `${key}.probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
  } catch {
    storageAvailable = false;
  }
  const controls = Object.fromEntries(Object.keys(defaults).map(name => [name, panel.querySelector(`[name="${name}"]`)]));
  const storageStatus = document.getElementById("reading-storage");
  const fontStatus = document.getElementById("reading-font-status");
  const baseSize = parseFloat(getComputedStyle(root).fontSize);
  let fontCheck;

  function appearance() {
    root.dataset.bsTheme = preferences.appearance === "system"
      ? (system.matches ? "dark" : "light") : preferences.appearance;
    // data-bs-theme uses the palette already shipped in Quarto's Bootstrap CSS.
    root.style.colorScheme = root.dataset.bsTheme;
  }

  function storageMessage() {
    storageStatus.textContent = storageAvailable
      ? "Preferences are saved only in this browser."
      : "Browser storage is unavailable. Changes work for this visit but may not be saved.";
  }

  function apply() {
    if (preferences.size === 100) root.style.removeProperty("font-size");
    // Percentages retain browser text enlargement; 16px is CSS's initial medium.
    else root.style.fontSize = `${preferences.size * baseSize / 16}%`;
    for (const name of ["font", "spacing", "width"]) {
      const attribute = `data-reading-${name}`;
      if (preferences[name] === defaults[name]) root.removeAttribute(attribute);
      else root.setAttribute(attribute, preferences[name]);
    }
    appearance();
    for (const name of Object.keys(controls)) controls[name].value = preferences[name];
    document.getElementById("reading-size-value").value = `${preferences.size}%`;
    controls.size.setAttribute("aria-valuetext", `${preferences.size} percent`);
    fontStatus.textContent = "";
    if (preferences.font === "atkinson" && document.fonts) {
      // @font-face is lazy. No font request occurs before this choice is used.
      fontCheck ||= document.fonts.load('1em "Atkinson Hyperlegible"');
      fontCheck.catch(() => {
        if (preferences.font === "atkinson") {
          fontStatus.textContent = "Atkinson Hyperlegible could not load. Using sans-serif instead.";
        }
        fontCheck = undefined; // A later selection may retry.
      });
    }
  }

  function save(reset = false) {
    try {
      if (reset) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(preferences));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
    storageMessage();
  }

  // Insert once, independently of headings or the wording of the handout.
  const title = document.getElementById("title-block-header");
  if (title) title.after(panel);
  else main.prepend(panel);
  apply();
  storageMessage();
  panel.hidden = false;

  panel.addEventListener("input", event => {
    const control = event.target;
    if (!Object.hasOwn(defaults, control.name)) return;
    preferences = validate({ ...preferences, [control.name]: control.name === "size" ? Number(control.value) : control.value });
    apply();
  });
  // Save once after a slider interaction, rather than on every drag step.
  panel.addEventListener("change", event => {
    if (Object.hasOwn(defaults, event.target.name)) save();
  });
  document.getElementById("reading-reset").addEventListener("click", () => {
    preferences = { ...defaults };
    apply();
    save(true);
    storageStatus.textContent = storageAvailable
      ? "Defaults restored. Preferences are saved only in this browser."
      : "Defaults restored for this visit. Browser storage is unavailable.";
  });
  system.addEventListener("change", () => {
    if (preferences.appearance === "system") appearance();
  });
})();
