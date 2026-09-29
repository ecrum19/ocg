# UI Audit: Generated GitHub Pages Site

Scope: the UI as of v1.5.0 (fda64db), before the component styling re-skin. Covers `scripts/build-site.mjs` (8.5k lines, the only UI source), `ocg.config.json` and its schema, and a fresh build of the example site (17 app pages + the ReSpec page). Bare line numbers below refer to that version of `scripts/build-site.mjs`.

## 1. Current component system

- **No framework, template engine or bundler.** Every page is a JS template literal, and the helpers return HTML strings.
- **Existing partials:** `renderPage` (the shell: head, fonts, inline CSS, header, nav, main and footers; 5860), `buildNav` (5924), `buildBrandMark` (8425), `buildFaviconLinks` (8434), `generatorAttribution` (5908), `howToLink` (5948), `buildPageToc` (5730), `buildRawViewerSection` (3816), the hierarchy renderers (2590–2639) and the guide helpers `guideCode`/`guideOptions`/`guideComponentSection` (2649–2678).
- **Everything else is inline markup** in 9 page builders, e.g. `buildIndexPage` (3550), `buildGraphPage` (3994), `buildTermPage` (5605) and `buildGuidePage` (2679, about 860 lines).
- **Behaviour is an inline `<script>` on each page:** TOC toggle, copy-namespace and viewer tabs, plus a 1,000-line Sigma app (`buildSigmaGraphScript`, 4292) that also builds markup and classes at runtime.
- **Class naming** loosely follows BEM (`block-el`, `block--mod`), but state classes are mixed: `is-active`/`is-collapsed` on some elements, `active`/`visible` on others. 12 emitted classes are hooks with no CSS rule (e.g. `nav-link--home`).

## 2. Global CSS

| Source | Lines | Size | Delivery |
|---|---|---|---|
| `sharedCss(config)` | 5954–8316 | 2,359 lines, 385 rules, 62 KB | Inlined into **every** app page (17 in the example; the count grows with one page per term). The CSS is 89% of a term page's bytes. No cacheable `.css` file. |
| `specPageCss(config)` | 1492–1681 | ~190 lines | Injected into the ReSpec page only |
| Google Fonts `<link>` | 5883 | 3 families, fixed weights | App pages only. **The spec page never loads it**, so theme fonts fall back to system fonts there. |

`sharedCss` is ordered as: tokens → reset/body → page TOC → header/nav → hero/headings → `.page-home` overrides → buttons → meta grid → sections → hierarchy → guide → cards/pitfalls → tables → viewer → graph/Sigma → footer. It ends with 4 media queries at 1040, 860, 1100 and 640 px (one block each, out of order).

## 3. Duplicated styling

- **Spec page chrome is implemented twice** (1492–1681). The spec page rewrites the header, brand, nav and footer as `.ocg-spec-*` rules. It uses its own parallel `--ocg-spec-*` token set (15 vars) plus raw `${colors.*}` values, and it copies the compact home-page values.
- **`.page-home` compact variant** (6389–6562): 43 rules restate 49 base values with smaller numbers (brand mark 48→42 px, section padding 22→18 px, metric card padding 20→13 px, …).
- **Two TOC implementations:** `.page-toc` (JS toggle; home, reference, terms, term and pitfalls pages) and `.guide-toc` (`<details>`; usage guide). ReSpec adds a third (`#toc`).
- **Six button families:** `.btn` (+`--primary`/`--ghost`/`--small`), `.icon-button`, `.sigma-btn`, `.graph-expand-btn`, `.sigma-controls-toggle` and `.page-toc-toggle`, each with its own size, radius and transition. Two hover blocks have identical declarations: `.graph-expand-btn:hover` = `.sigma-controls-toggle:hover`, and `.how-to-link:hover` = `.nav-link--guide:hover`.
- **Two tab implementations:** `.tabs`/`.tab` (viewer) and `.graph-view-tab`/`.graph-mode-tab`.
- **About 10 surface/card variants:** `.section`, `.hero-copy`/`.hero-panel`, `.viewer`, `.card`, `.metric-card`, `.featured-term-card`, `.guide-card`, `.pitfall-card`, `.sigma-card`, `.meta-grid div`.
- **Four `<details>` styles:** `.hierarchy-item`, `.guide-toc`, `.sigma-block`, `.pitfall-elements`.
- **Two table styles:** `table` + `.table-wrap`, and `.guide-options` + `.guide-options-wrap`.
- **Fullscreen selectors appear three times** (7592–7770, 8293–8314): every rule is repeated for `.graph-panel--expanded`, `:fullscreen` and `:-webkit-full-screen`.
- **Many one-off values, no scale tokens:** 30 font sizes, 58 paddings, 20 gaps, 16 radii, 12 shadows, 15 line heights, 17 transitions and 9 z-indexes.
- **Dead code:**
  - Legacy graph CSS that nothing emits: `.graph-shell`, `#graph-svg`, `.legend*`, `.checkbox`, `.search`, `.graph-controls`, `.sigma-graph-card` (mostly 8129–8179).
  - Tokens defined but never read: `--white`, `--white-84`, `--graph-dim`, `--graph-label-outline`.
  - `--graph-control-border`/`--graph-control-text` are read (with fallbacks) but never set.
  - The `TERM_TYPE_INFO.color` palette (306) is never used, and its colours differ from the `graph.colors` defaults.

## 4. Primary layouts

| Layout | Pages | Structure |
|---|---|---|
| Shell | All app pages | `.page-shell` (1120 px) › `.site-header` (brand + pill nav) › `main` › optional `.site-footer` › `.site-footer-generator` |
| Content + TOC | Reference, terms index, term, pitfalls | `body.page-has-toc` widens the shell to 1320 px. `.page-content-layout` is a grid with a 214 px sticky TOC that collapses to 44 px. |
| Home | `index.html` | Content + TOC with `body.page-home` (compact). A two-column `.hero` (`.hero-copy` + `.hero-panel`), then stacked sections. |
| Wide app | Graph | `body.page-graph` (1450 px, no TOC). `.sigma-layout` places the controls panel beside the canvas; has a fullscreen mode. |
| Guide | Usage guide | Default shell. `.guide-hero` contains `details.guide-toc`, followed by a long stack of `.guide-section`s. |
| Injected document | `spec/index.html` | The user's ReSpec HTML. OCG injects a fixed header (`padding-top: 106px !important`) and a footer. |
| Utility | Persistent-IRI resolver | Shell + one unstyled `.resolver-section` + a callout |

The layout is chosen only by `bodyClass` and whether `pageToc` is present. Widths are hard-coded: 1120/1320/1450 px, 92–95 vw.

## 5. Existing design tokens (`:root`, 5958–6017)

- **12 config inputs:** `--bg`, `--bg-alt`, `--panel`, `--card`, `--ink`, `--muted`, `--accent`, `--accent-start`, `--accent-border`, `--accent-strong`, `--border`, `--warm-accent`.
- **44 derived tokens** (43 use `color-mix()`):
  - surfaces: `--surface-*`, and `--white`, `--white-98…72` (9)
  - accent tints: `--accent-tint`/`-soft`/`-faint`/`-outline`
  - text: `--text-strong`/`-dark`, `--muted-*`
  - borders: `--border-soft`/`-medium`
  - code, table and graph tokens (`--graph-*`)
  - shadows: `--shadow*` (6)
- **3 fonts:** `--heading-font`, `--body-font`, `--mono-font`.
- **Local and inline tokens:** `--toc-motion`, `--toc-ease` and `--page-toc-panel-width` are scoped to the TOC. `--artifact-count`, `--metric-count` and `--line-color` are set via `style=""`.
- **Copied into JS for Sigma** (4292–4333): `TYPE_COLOR` (= `graph.colors`), `THEME_COLOR` (5 theme colours) and `LABEL_FONT`.
- **Colour tokens are used consistently.** Only 5 raw colours appear outside `:root`, all pitfall severities (`#b3261e`, `#a05a00`).
- **Missing token scales:** spacing, radius, shadow, type, breakpoints, z-index, motion and layout width. There is no dark mode. The `--white-*` names mislead: they are mixes of the panel colour, not white.

## 6. Framework / theme configuration

- **Runtime libraries only**, no CSS framework:
  - Sigma 2.4 + Graphology (vendored to `assets/vendor/`)
  - ReSpec (loaded by the user's spec source)
  - WebVOWL (iframe)
- **`theme` in `ocg.config.json`:**
  - `fonts`: heading/body/mono, loaded from Google Fonts.
  - `colors`: 12 keys. The schema sets `theme` to `additionalProperties: false`, but `theme.colors` to `additionalProperties: true`, so unknown colour keys are accepted and silently ignored.
- **Related settings:**
  - `graph.colors`: 11 node/edge colours
  - `site.branding`: header image and favicon
  - `site.toc`: on/off and labels
  - `site.hero`, `site.home`, …: copy only
  - `features.*`: page toggles
  - Defaults are merged one level deep, per section, in `loadConfig` (433).
- **Not configurable:** layout width, density, radius, shadows, dark mode, font weights or self-hosted fonts, custom CSS, template overrides.
- **Tests depend on markup:** `tests/build.test.mjs` checks 35 `class=` strings and several CSS regexes (e.g. `.page-toc-panel {…background: var(--panel)}`, `--accent-start: #e08a54`), so renaming classes means updating the tests.

## 7. Candidate shared components

| Component | Replaces | Evidence |
|---|---|---|
| `Section` (id, heading level, How-To link, note, body) | `section › section-head › section-heading-row + section-note` | Written inline ~31 times |
| `PageShell` / `SiteHeader` / `SiteFooter` | `renderPage` chrome and the `.ocg-spec-*` copy | 2 implementations |
| `Toc` | `.page-toc`, `.guide-toc` | 2 implementations (+ ReSpec) |
| `Button` (primary, ghost, subtle, icon; sm/md) | 6 button families | 11 `.btn` sites + JS-built controls |
| `Tabs` | `.tab`, `.graph-view-tab`, `.graph-mode-tab` | 3 tab sets, 2 implementations |
| `Surface` / `Card` (panel, card, metric, term, guide) | ~10 card variants | 16 radii, 12 shadows |
| `Badge` / `Chip` | `.eyebrow`, `.term-badge`, `.pitfall-importance`, `.sigma-detail-type`, `.hierarchy-child-count`, legend chips | 13 `term-badge` sites |
| `Disclosure` | 4 `<details>` styles | 8 `<details>` sites |
| `DataTable` | `table` + `.table-wrap`, `.guide-options` | 5 `<table>` sites |
| `MetaList` | `.meta-grid`, `.sigma-detail-metadata`, `.hierarchy-meta` | 3 variants |
| `CodeBlock` | `.viewer-pane`, `.guide-code`, `.iri-example` | 3 variants |
| `Callout` | `.guide-callout`, `.pitfall-unavailable`, `.hierarchy-empty`, `.graph-view-note`, `.graph-expand-help` | 9 `guide-callout` sites + 4 one-offs |

**Suggested starting point for the re-skin:**
- Split the CSS into layered files (tokens → base → components → layouts), emitted once as `assets/ocg.css`.
- Drive new scale tokens from `theme.*` config.
- Replace the `.page-home` overrides with a density token set.
- Share one chrome partial with the spec page.
