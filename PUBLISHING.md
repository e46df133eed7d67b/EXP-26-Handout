# EXP handout publication

`index.qmd` in this repository is the only maintained content source. The main
website contains a copy of its rendered output, never a second Quarto source.
Do not edit `talks/exp-26/handout/index.html` in the website repository by hand.

## Repository locations and initial state

The local website checkout prepared for this work is
`C:\Users\asmit\Documents\websites\e46df133eed7d67b.github.io`.
The similarly named `e46df133eed7d67b.github.io-main` folder beside it is an old
export without the current design. It was left untouched. Use a current checkout
of `e46df133eed7d67b/e46df133eed7d67b.github.io`, wherever you keep it.

Both repositories' Pages settings were inspected on October 21, 2026. Both use
**Deploy from a branch, main, / (root)**. The main website has the existing
`asmith.be` custom domain; the project site inherits that domain at
`https://asmith.be/EXP-26-Handout/`. HTTPS is enforced on both. No remote settings,
commits, pushes, or deployments were changed during preparation.

## Normal update from VS Code

Open this project in VS Code and edit `index.qmd` as usual. In its PowerShell
terminal, run:

```powershell
quarto render index.qmd
.\Sync-WebsiteHandout.ps1 -WebsiteRoot '..\e46df133eed7d67b.github.io' -WhatIf
.\Sync-WebsiteHandout.ps1 -WebsiteRoot '..\e46df133eed7d67b.github.io'
```

Use your actual website checkout path for `-WebsiteRoot`; absolute paths and paths
with spaces are supported. `-HandoutRoot` defaults to the script's own directory.
Relative parameters resolve against the terminal's current directory. The script
was tested in PowerShell 7 and uses Windows PowerShell 5.1-compatible syntax;
Windows PowerShell 5.1 execution was blocked by this machine's existing script
policy. It needs no installed packages.
If your system's execution policy blocks local scripts, use the normal script
approval process for your machine; changing execution policy is not part of this
workflow.

The script verifies the destination's existing website files and domain, checks
the rendered noindex/canonical metadata and render freshness, then follows local
HTML, CSS, and JavaScript dependencies. It copies only `index.html` and referenced
runtime files inside `assets/` and `index_files/`, plus the local font license.
It rejects missing dependencies, root-relative resources, paths outside those
directories, and junctions/symlinks. It does not copy source includes, QMD files,
test results, or `docs/`. It verifies copied file hashes and writes `index.html`
last. A failed validation makes no destination changes. An interrupted copy may
be partial; rerun successfully before publishing.

Nothing is deleted, including unrelated files and older unreferenced hashed
assets. If a later Quarto version changes filenames, only remove obsolete assets
after reviewing their references. If you add a new kind of local resource outside
`assets/` or `index_files/`, the script stops for a deliberate allowlist update.

Preview the website from its repository root with a local HTTP server, for example
`python -m http.server 8765`, and visit:

- `http://localhost:8765/talks/`
- `http://localhost:8765/talks/exp-26/`
- `http://localhost:8765/talks/exp-26/handout/`

Review the website diff and check the handout's controls and annotations. Save
the Quarto source changes in this repository and the generated publication files
in the website repository through your normal Git review process. Commit/push
only when you intend to publish: pushing the main website's `main` branch triggers
its existing Pages deployment. The copy script itself never commits or publishes.

## Indexing and canonical location

`assets/publication-head.html` is included by `index.qmd` on every render and sets
`<meta name="robots" content="noindex">` and the canonical URL
`https://asmith.be/talks/exp-26/handout/`. Keep this include in place. The main
website's two Talks pages also contain noindex and their own canonical URLs.
These pages stay out of the main sitemap, and robots.txt continues to allow
crawling so search engines can see noindex. This is an unadvertised public section,
not confidential hosting.

## Old URL: prepared redirect and approval-dependent activation

`docs/index.html` is a small redirect with noindex, a canonical link, and a visible
fallback link. JavaScript preserves query strings and passage fragments;
the HTML meta refresh also redirects when JavaScript is unavailable (it does not
preserve query strings/fragments). An ordinary link remains if automatic
navigation is blocked. The redirect needs no external assets.

It is deliberately separate from generated root `index.html`, so running
`quarto render index.qmd` cannot overwrite it. Do not put Quarto output into
`docs/`. Do not delete this source repository.

**The redirect is not active yet.** The current project Pages source is still the
root, so the existing public URL continues serving the current handout. After
approval, use this publication order:

1. Publish the main website changes first, then verify the new handout and assets
   at `https://asmith.be/talks/exp-26/handout/`.
2. Commit/push this repository's source, tooling, and `docs/` redirect files.
3. With explicit approval, change **only EXP-26-Handout** in Settings > Pages from
   `main / (root)` to `main /docs`, retaining branch publishing and HTTPS.
4. Wait for that deployment and verify the old URL and a saved passage fragment.

No main website Pages, DNS, domain, or CNAME change is needed. GitHub Pages serves
the project URL from its own repository; putting a similarly named folder in the
main website alone is not a reliable replacement for the project site's routing.
The one-time `/docs` source change keeps the old URL reliable without an automated
cross-repository deployment pipeline. Until it is approved, the two addresses can
serve separate generated versions; do not treat the redirect as live.

## Browser-local annotations

The unchanged keys are `exp-2026-10-26.reading.v1` and
`exp-2026-10-26.annotations.v1`; the annotation document identifier is
`exp-handout-2026-10-26`. Neither depends on the pathname. The old and new HTTPS
URLs on `asmith.be` share localStorage in the same browser/profile, so saved
records remain available. The publishing changes do not migrate, clear, or
rewrite them. Future talks must get their own document identifier and storage
keys instead of reusing these EXP keys.

Storage is still specific to the browser/profile and origin (scheme, hostname,
port). Records created on `github.io`, `www.asmith.be`, HTTP, or localhost are not
automatically transferred to `https://asmith.be`. Private browsing, storage
clearing, and cross-device limitations remain. Text edits can make an old passage
unanchored under the existing anchoring system; this relocation changes no
handout text or annotation code.
