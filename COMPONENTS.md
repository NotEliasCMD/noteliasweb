# COMPONENTS.md — component reference for Peachy's portfolio

**Purpose:** grab *this file* (or one section of it) instead of reading the whole
codebase when you need to modify a component. Each section is self-contained:
where the code lives, what it does, how it behaves, and the gotchas. Read
`CLAUDE.md` first for the project philosophy; read this for the parts.

The site is a dependency-free static page: `index.html` (structure/copy),
`styles.css` (all layout + tokens + keyframes), `script.js` (all behavior), plus
`anim/*.js` (the ASCII animation engine). No build step, no framework.

## How to locate code fast

Line numbers drift as the files change. **The stable anchors are the comment
banners** — search for them instead of trusting a line range:

- `script.js` uses numbered banners: `/* ---- N. name */` (e.g. `5. terminal typing`).
- `styles.css` uses `/* ---- name ---- */` and `==== SECTION ====` banners.
- `index.html` sections are `<section class="section" id="...">`; planes are
  `<article class="plane" id="plane-...">`.

Line ranges below are approximate anchors as of this writing.

---

## Component index

| Component | index.html | styles.css | script.js banner |
|-----------|-----------|-----------|------------------|
| [Nav + burger drawer](#1-nav--burger-drawer) | ~25–53 | `==== NAV`, ~84–116 | `6. nav` |
| [Hero](#2-hero) | ~57–94 | `.hero*` ~118–132 | — (reveal only) |
| [Terminal (tabbed)](#3-terminal-tabbed) | ~79–93 | `.terminal*` ~134–177 | `5. terminal typing` |
| [Marquee](#4-marquee) | ~96–113 | `.marquee*` ~179–197 | `4. seamless marquee` |
| [Scroll reveal](#5-scroll-reveal-data-reveal) | attribute | ~367, ~504 | `1 + 2. reveal + typewriter` |
| [Typewriter highlight](#6-typewriter-highlight-data-type) | attribute | `.hl*` ~58–64 | `typeSpan()` |
| [Count-up stats](#7-count-up-stats-data-count) | ~135–151 | `.stat*` ~210–216 | `3. stat count-up` |
| [Work carousel](#8-work-carousel) | ~156–375 | `.carousel*` ~234–283 | `7.5 work carousel` |
| [Skills / Writing / Footer](#9-skills--writing--footer) | ~377–522 | ~284–352 | `7. footer year` |
| [Closer + plasma backdrop](#10-closer--plasma-backdrop) | ~461–486 | `.closer*` ~303–335 | `8. closer plasma backdrop` |
| [Project "planes"](#11-project-planes) | ~588–1438 | `.stage/.plane/.plane--mirror/.plane--story/.ascii` ~428–505 | `9. project planes` |
| [ASCII engine](#12-ascii-engine-anim) | — | — | `anim/*.js` |
| [Data-story charts](#12a-personal-works-data-story-charts-side-projects) | — | `.ds-*` (`side-projects/ds-charts.css`) | `side-projects/*` |
| [Theme toggle (dark mode)](#13-theme-toggle-dark-mode) | `#themeToggle*` + `<head>` script | `[data-theme="dark"]`, `.theme-toggle*` | `6.5 theme toggle` |

---

## 1. Nav + burger drawer

- **HTML** ~25–53 · **CSS** `==== NAV` block ~84–116 (+ responsive ~493–495) · **JS** banner `6. nav`.
- Sticky top bar. `.nav.is-scrolled` toggles a hairline bottom border once
  `scrollY > 8`. Below **720px** the desktop links/CTA hide and the hamburger
  (`#burger`) shows; it toggles `.nav__drawer#drawer` (a `hidden` panel attached
  under the header). The three burger bars animate into an X via `.is-open`.
- **Behavior** (`toggle(open)`): flips `drawer.hidden`, toggles `.is-open` on
  drawer + burger, sets `aria-expanded`. Burger click toggles; each drawer link
  closes it; **Escape closes it and returns focus to the burger**.
- **a11y:** `aria-controls="drawer"` + `aria-expanded` are wired. The drawer's
  `.is-open → display:flex` rule lives *inside* the 720px query, so resizing to
  desktop always hides it.
- **Gotcha:** there is **no focus trap** inside the open drawer (see review §R4).
  Drawer links duplicate the desktop nav — edit both if you change nav items.

## 2. Hero

- **HTML** ~57–94 · **CSS** `.hero*` / `.eyebrow*` ~118–132.
- Static copy in a 2-col grid (`1.05fr 0.95fr`) that collapses to 1 column at
  **900px**, where the terminal reorders *below* the copy (`.terminal{order:2}`).
  Children carry `data-reveal`; the phrase "I find it." is a `data-type`
  typewriter highlight. Fluid type via `clamp()`; lede capped at `34ch`.

## 3. Terminal (tabbed)

- **HTML** ~79–93 (bar + 3 tabs + `<code id="typed">` + `#cursor`) · **CSS**
  `.terminal*` / `.cursor` / `.tok-*` ~134–177 · **JS** banner `5. terminal typing`.
- **Decorative** — the whole terminal is `aria-hidden="true"`. Three tabbed
  "sessions" live in the `TABS` array (`{id, script}`, each `script` an ordered
  list of `[className, text]` chunks; `\n` = newline, `null` class = plain).
  `tok-out` / `tok-comment` render fast (program output); everything else types
  char-by-char. Tab 0 auto-types on load; clicking a tab switches with an
  in-flight-typing cancellation guard (`typeToken`), a per-tab `rendered` cache,
  and a first-show paint lead-in. `#cursor` blinks forever (`@keyframes blink`).
- **Edit the demo:** change a tab's entry in `TABS`. Token colors are the
  `.tok-*` classes in CSS.
- **Easter egg (interactive prompt):** click the terminal to enter *input mode*
  (adds `.terminal--input`); the `#terminalInput` span (between `#typed` and
  `#cursor`) captures keystrokes so you type a command at the prompt. Press
  **Enter** to submit: a matching entry in the `EASTER_EGGS` array (top of the
  `5. terminal typing` banner) fires — its `reaction()` returns `[className,
  text]` chunks (same format as `TABS`) that print via `appendChunk`; a non-match
  prints `command not found`. Then a fresh `>>> ` prompt is dropped. **To swap
  the word/celebration, edit `EASTER_EGGS` only** — nothing else changes. Escape
  or clicking away exits; switching tabs clears the input. Keystrokes are caught
  by a document-level `keydown` gated on an `inputActive` flag (no focusable
  control), so the terminal **stays `aria-hidden`/decorative** — screen readers
  ignore the whole thing. Celebration renders instantly (via `appendChunk`), so
  it works under reduced motion too.
- **Gotcha / over-engineering:** tabs are `tabindex="-1"` inside an aria-hidden
  region → keyboard-inert, mouse-only. The cancellation/cache/lead-in machinery
  is heavy for decoration (see review §R1).

## 4. Marquee

- **HTML** ~96–113 (12 `.marquee__item`s) · **CSS** `.marquee*` + `@keyframes scroll` ~179–197 · **JS** banner `4. seamless marquee`.
- JS duplicates the item set once (`track.innerHTML += track.innerHTML`) so a
  `-50%` translate loops seamlessly; `--dur` is set at runtime scaled to width
  (~90px/s, `speed` in JS). Edges masked with a gradient; pauses on hover.
- **Edit items:** edit the `.marquee__item` list in HTML only — **do not
  pre-duplicate** (JS does it). Clean, right-sized; leave as is.

## 5. Scroll reveal (`[data-reveal]`)

- **CSS** ~367 (base) + ~504 (reduced-motion) · **JS** banner `1 + 2`.
- Put `data-reveal` on anything that should fade+rise into view. A one-shot
  `IntersectionObserver` (threshold 0.18) adds `.is-in` then `unobserve`s. On
  reveal it also triggers nested `[data-type]` typewriters and `[data-count]`
  stats. Under reduced motion / no-IO everything is shown immediately.
- **Note:** the project planes have a **second, near-identical** reveal observer
  scoped to the open plane (`revealBlocks`, `[data-plane-reveal]`). Two copies of
  the same mechanism (see review §R5).

## 6. Typewriter highlight (`[data-type]`)

- **CSS** `.hl` / `.hl__caret` ~58–64 (reuses `@keyframes blink`) · **JS** `typeSpan()`.
- On load, `[data-type]` spans are blanked (text stashed in `dataset.text`) so
  they type from empty when revealed. `typeSpan` types char-by-char trailing a
  blinking peach caret that vanishes when done. Use ~one per section on the key
  phrase. `.hl` stays peach (`--peach-deep`); on ≤720px it wraps (`white-space:
  normal`) so long phrases don't overflow.
- **Related but separate:** the planes reuse `typeSpan` for their titles via a
  `data-plane-type` blank-loop; the terminal has its *own* typing engine
  (`typeScript`) — two engines total (see review §R2).

## 7. Count-up stats (`[data-count]`)

- **HTML** ~135–151 · **CSS** `.stat*` ~210–216 · **JS** banner `3. stat count-up`.
- `<span class="stat__num" data-count="40">40</span>` animates 0→40 on reveal
  (rAF, easeOutCubic, 1100ms). **The visible text must equal `data-count`** — it
  is the no-JS / reduced-motion fallback (this was previously mismatched and is
  now fixed). Reduced motion → shows the final number instantly.

## 8. Work carousel

- **HTML** ~189–410 (13 cards: **5 real** `data-project` — triage (flagship, first),
  fraud, forecast, abtest, tickets — + 8 placeholders) · **CSS**
  `.carousel*` / `.cards--carousel` ~285–334 (+ responsive) · **JS**
  banner `7.5 work carousel`.
- A `grid-auto-flow: column`, 2-row scroll-snap track. Layered on top of native
  scroll: `←/→` arrows page by ~a viewport with edge-looping, JS-built dots
  (collapsed to distinct *column* offsets, active dot synced on scroll), a
  per-frame rAF opacity fade at the track edges (`paintFade`), and a
  **mouse-only** pointer drag-to-scroll (gated to `pointerType === "mouse"` so it
  doesn't fight native touch scroll). Card width widens at 720px so the next
  column peeks. Dots have a ~23px tap target (7px visible via content-box padding).
- **Gotcha / over-engineering:** this is the 2nd-heaviest feature; native
  scroll-snap already provides the core UX (see review §R3). Cards clicking into
  planes is handled by the planes system (§11), not here.

## 9. Skills / Writing / Footer

- **Skills** HTML ~377–420, CSS ~284–288 — static 3-col lists → 1 col at 900px.
- **Writing** HTML ~422–459, CSS `.posts/.post*` ~290–301 — 4 posts, all
  `href="#"` (placeholder links).
- **Footer** HTML ~490–522, CSS ~337–352 — `#year` filled by JS (banner
  `7. footer year`); social links `href="#"` (placeholder). `footer__cols` 3→2
  columns at 720px (never collapses to 1). All trivial; leave as is.

## 10. Closer + plasma backdrop

- **HTML** ~461–486 (`.closer` → `.closer__bg > pre[data-anim-bg]`) · **CSS**
  `.closer*` ~303–335 · **JS** banner `8. closer plasma backdrop`.
- Mounts the ASCII `plasma` field full-bleed behind the "Let's talk" section,
  sized to a char grid (`gridFor`), started/stopped by an IntersectionObserver
  (only animates on-screen), refit on resize (rAF-debounced). Reduced motion →
  one frozen frame. A radial+linear scrim keeps the text legible. Contact is a
  `mailto:` (no form).
- **Tuning:** `plasma-preview.html` (repo root, **not linked from the site**) is a
  standalone harness to tune opacity/tint/CELL/scrim — it *duplicates* the closer
  CSS/JS knobs by design, so it can drift. Carry final numbers back into
  `styles.css` + `script.js`.

## 11. Project "planes"

- **HTML** ~588–1438 (**12** `<article class="plane">` in two families — 6 **Work**
  planes: triage, fraud, forecast, abtest, tickets, + a shared placeholder; and 6
  mirrored **Personal-works "data story"** planes: pw-ram, pw-moneyball, pw-markets,
  pw-books, pw-pokedex, pw-consoles) · **CSS** `.stage` / `.plane*` / `.plane--mirror`
  / `.plane--story` / `.ascii-*` ~428–505 (+ responsive & reduced-motion blocks) ·
  **JS** banner `9. project planes`. The Personal-works charts are a separate toolkit
  in `side-projects/` — see §12a.
- **Two families, one controller.** `createPlaneGroup(cards, mirror)` (`script.js`
  §9) builds a self-contained plane controller from an ordered list of triggers,
  and the site instantiates it twice: **Work** = `$$(".card--link")` (the §8
  carousel cards, `mirror:false`) and **Personal works** = `$$(".post__link--plane")`
  (the section-04 list, `mirror:true`). Each group owns its own active-plane state,
  button wiring, and Escape/arrow handling, so the two never interfere. A trigger's
  `data-project` maps to `#plane-<project>`.
- Activating a trigger (click or Enter/Space) slides the main `.stage` aside and the
  matching plane in (`body.is-planed`; the mirror group also adds
  `body.is-planed--mirror`). Every plane types its title (reusing `typeSpan`) and
  reveals `[data-plane-reveal]` blocks via its own scoped observer. Back button +
  Escape close it; prev/next arrows hop between the group's projects without closing
  (see below); focus returns to the trigger. On ≤900px the pinned media/head columns
  un-stick.
- **Two different graphics in `.plane__media`.** *Work* planes lazily mount a
  data-science **ASCII animation** (`data-anim`) into a `<pre data-anim-target>` —
  triage → `topology`, fraud → `neuralnet`, forecast → `candlestick`, abtest →
  `barchart`, tickets → `attention`, placeholder → `topology` (the shared placeholder
  also borrows the clicked card's title/tag/year). *Personal-works* planes instead put
  an **animated SVG data-story chart** there (§12a); they keep a vestigial `data-anim`
  but have **no** `[data-anim-target]`, so `ensureAnim` finds nothing and no-ops — the
  chart toolkit mounts the SVG on its own.
- **Mirror variant (Personal works):** `mirror:true` flips the group into a
  horizontal mirror — the plane parks off-screen **left** (`.plane--mirror`,
  `translateX(-100%)`) and slides in from the left, the graphic (SVG chart) sits on
  the **right** with text on the **left** (`.plane__content { order:1 }` /
  `.plane__media { order:2 }`), the bar's nav group moves **left** of the back button
  (`flex-direction: row-reverse`), and the dimmed page shifts **right**
  (`body.is-planed--mirror .stage`). A "prev" hop enters from the right
  (`.plane--from-right`) — the mirror image of the Work group's `.plane--from-left`.
  CSS lives in the mirror block at `styles.css` ~469–475; the JS is the same
  `createPlaneGroup`, just branching on `mirror`. Note the mirror `.plane__grid` /
  `.plane__media` rules out-specify the ≤900px single-column collapse, so the
  responsive block **restates** them (`styles.css` ~613–616) to avoid mobile overflow.
- **Story layout (`.plane--story`, `styles.css` ~477–500):** the Personal-works planes
  add this modifier for data-story chrome — a boxed **TL;DR** panel (`.plane__tldr`),
  a wider text column (`max-width: 62ch`), and a `.ds-hero-panel` framing the hero
  chart. It also **drops the sticky header's soft bottom-fade** (`.plane__head::after`)
  so the boxed TL;DR clips crisply under the header instead of dissolving into it.
- **Shared grid:** every plane mounts onto one `PLANE_GRID = {cols:62, rows:26}`
  (in `script.js` §9), not each animation's native size, so `fontFor` picks the
  same font size and the graphic lands identically on every plane. The library
  animations are all parametric on `(cols, rows)`, so this just reshapes them a
  little — retune all planes at once by editing `PLANE_GRID`.
- **Prev/Next navigation:** each `.plane__bar` has a `.plane__bar-nav` group
  (`← Prev` / `Next →`, `.plane__nav-btn` with `data-dir="prev|next"`) opposite the
  back button; `ArrowLeft`/`ArrowRight` do the same while a plane is open.
  `navigateTo(dir)` (`script.js` §9) walks the **`cards` list in DOM order** (not
  `data-project`, since 8 mock cards share `#plane-placeholder`) and **loops** at the ends.
  Each group's `navigateTo`/`showPlane`/`openPlane` are closures over that group's
  own `cards` + `activePlane`, so hops stay within the group (Work loops its 13
  triggers; Personal works loops its 6, in list DOM order).
  The transition is a **cover-slide**: the incoming plane slides in *on top of* the
  stationary current one (both are opaque cream; `.plane--incoming` lifts its z-index),
  so the dimmed main page is **never revealed** — a seamless plane-to-plane hop. The
  old plane is retired (`retire()`) once it is fully covered. `next` enters from the
  right, `prev` from the left (`.plane--from-left` parks it left). `body.is-planed`
  stays on throughout. `openPlane`'s show logic was extracted into
  `showPlane(plane, card)` (borrows placeholder content for *any* card, `resetReveals`
  so blocks re-animate); `navigateTo` reuses it to bring the incoming plane in.
  Placeholder→placeholder is the **same element**, so it can't slide over itself — it
  **crossfades its content in place** instead (`.plane.is-swapping .plane__grid`).
  Retire/reset are timer-driven (fixed durations), not `transitionend`, so a hop can't
  get stuck. Focus lands on the same-direction nav button; Back/Escape restore focus to
  the **current** project's card. At ≤720px the crumb hides so the bar fits.
- **Content status:** the largest single feature. Real copy + real data now fill the
  **triage** Work plane and **all six Personal-works data-story planes**; the remaining
  Work planes (fraud, forecast, abtest, tickets) + the shared placeholder are still
  lorem ipsum (see review §R2). Work-plane copy is authored from
  `project_desc/plane-content-prompt.md` (a reusable prompt: raw blurb → card + plane
  HTML), demonstrated on the triage project; the six Personal-works stories arrived as
  a self-contained package (paste-ready fragments + regenerable data modules, §12a).

## 12. ASCII engine (`anim/`)

- **Files:** `anim/ascii.js` (254 ln, the engine) + one plugin per animation.
  Loaded at the bottom of `index.html` (engine + the mounted anims `neuralnet`,
  `candlestick`, `barchart`, `attention`, `topology` + the closer `plasma`) and, for
  the full library, `components.html`. The engine is **live production code**; the
  plugins split into tiers:
  - **Work-plane anims** (§11): `neuralnet`, `candlestick`, `barchart`,
    `attention`, `topology`. (The Personal-works planes render SVG charts, not ASCII —
    they mount no plugin; see §12a.)
  - **Closer:** `plasma` (§10).
  - **Library spares** (registered + gallery-shown but not mounted by the shipped
    site, ready to drop into a plane/closer): `actuarial`, `riskcurve`, `losscurve`,
    `scatterplot`, `thermometer`, `equalizer`, `motherboard`, `cube`, plus the legacy
    `dna`. These are **intentionally kept** as a palette, not dead code.
    The gallery (`components.html` §11) builds its ASCII grid from
    `ASCII.animations`, so they surface there automatically; the shipped site
    never loads them.
- `ascii.js` exposes `window.ASCII`: a `Screen` class (char buffer + `Float32Array`
  z-buffer, `set/get/plot/shade/text/line`), a `register(spec)` registry, a
  `mount(el, id, opts)` rAF player returning `{start, stop, resize, running}`,
  `animations` (registry snapshot, drives the gallery grid), `byId(id)`, and
  `util` (`clamp/lerp/hash/noise2`). Pure text into a `<pre>` — no WebGL/canvas.
- **Add an animation:** `ASCII.register({ id, title, description, cols, rows, fps,
  create(cols, rows) { return function frame(screen, t, frameCount) { … }; } })`
  in a new `anim/<name>.js` (note: `create` returns the per-frame fn — it is
  *not* a bare `frame` key), add a `<script>` for it in `index.html` and/or
  `components.html`, and reference it by `data-anim` / `data-anim-bg` (or let the
  gallery pick it up). The plugins are thin, idiomatic, and parametric on
  `(cols, rows)` — right-sized, don't refactor.

---

## 12a. Personal-works data-story charts (`side-projects/`)

- **Files:** `side-projects/ds-charts.js` (the vanilla SVG chart toolkit + a
  scroll-in animation controller), `side-projects/ds-charts.css` (`.ds-*` chart chrome
  + a `--ds-*` palette, light/dark), and `side-projects/data/NN_<name>.js` (one per
  project — `window.DS_SIDE["<key>"] = {…}`). Loaded at the bottom of `index.html`
  after `script.js`: the six data modules first, then `ds-charts.js`. A dependency-free,
  build-free package (no CDN, no libraries) staged from a separate repo; these are the
  graphics the §11 Personal-works planes show instead of an ASCII animation.
- **How it mounts:** `window.DSCharts` auto-runs on `DOMContentLoaded`, scanning
  `[data-ds-chart]` figures and rendering each as an inline **viewBox** SVG — so it
  sizes correctly even inside a still-`hidden` plane. It draws the final frame
  immediately, then an `IntersectionObserver` plays the entrance animation when the
  figure scrolls into view (i.e. when the plane opens). Everything is gated on
  `prefers-reduced-motion` (jump straight to the final frame) and re-renders on a
  `[data-theme]` flip via a `MutationObserver` on `<html>`, so charts recolour with
  the dark theme for free. `DSCharts.mount(node)` re-scans a subtree if you inject
  markup later. Only two globals are added, both `DS`-namespaced (`DSCharts`, `DS_SIDE`).
- **Declaring a chart:** `<figure class="ds-figure" data-ds-chart data-project="<key>"
  data-chart="line|bar|scatter|histogram|dumbbell|radar|heatmap|lollipop|arcs"
  data-figure="<slice>" data-mode="…">` wrapping an empty `<div class="ds-chart">`
  the toolkit fills, plus a title/subtitle/caption. Chart chrome (axes/grid/text) uses
  host tokens (`--ink`, `--muted`, `--line`, `--peach`); the surrounding TL;DR + hero
  panel are styled by `.plane--story` (§11). Note the `data-project` **key** (e.g.
  `pl_moneyball`, `markets`, `ram`) is the `DS_SIDE` key, distinct from the plane's
  `pw-` trigger slug. Full contract in the package's own `README.md` (source repo).

---

## 13. Theme toggle (dark mode)

- **HTML** — `#themeToggle` (icon-only, in `.nav__inner` before the CTA) +
  `#themeToggleDrawer` (icon + swapping text label, in the mobile drawer); an
  anti-FOUC `<script>` in `<head>` (right after the stylesheet link). **CSS**
  `[data-theme="dark"]` block after `:root`, `.theme-toggle*` rules after the
  drawer styles, plus scoped overrides at `.card:hover` and `.closer`.
  **JS** banner `6.5 theme toggle`.
- **Mechanism:** dark mode is a pure CSS-token flip. `[data-theme="dark"]`
  redefines the palette tokens (same names, inverted lightness, peach kept), so
  everything token-driven — backgrounds, text, borders, nav/closer gradients via
  `color-mix`, and the ASCII animations (they inherit `--ink` on `.ascii-screen`)
  — recolors from one block with **no per-component or JS work**.
- **Behavior** (`setTheme(dark)`): sets/removes `<html data-theme="dark">`, writes
  `localStorage["theme"]`, and syncs `aria-pressed` on both buttons. The `<head>`
  script reads `localStorage` and applies the theme **before first paint** so
  returning dark-mode visitors don't flash light. **Default is light** (no saved
  value → light); there is intentionally no `prefers-color-scheme` listener.
- **Icon swap** is CSS-only: `.theme-toggle__sun` shows in light, `__moon` in
  dark; the drawer's `__label--to-dark` / `--to-light` swap the same way.
- **Gotchas / dark-mode landmines:** most hardcoded colors live in the
  deliberately-dark **terminal** (§3 — left as-is, already fits) and **closer**
  (§10). The closer must *not* invert with the page, so `[data-theme="dark"]
  .closer` re-pins its **local** `--ink`/`--cream` — this keeps its bg + gradient
  scrims dark and copy light, and its existing hardcoded tints already suit a dark
  band. The `.card:hover` shadow (an `rgba` of ink) gets a darker dark-mode
  override. If you add any new color, use a token; a raw hex needs its own
  `[data-theme="dark"]` override or it won't flip.
- **Reduced motion:** no new keyframes — the icon swaps via `display` and the
  toggle's color transitions are already zeroed by the global reduced-motion
  block. Nothing extra to guard.

---

# Simplicity & Mobile review

Verdict: the core primitives (marquee, reveal, nav, stats, footer, the ASCII
engine) are clean and right-sized. Complexity concentrates in three features.
**All functionality was kept.** Cheap, zero-risk cleanups were applied; the three
big refactors are left as recommendations below because they change behavior/feel
and the user asked to preserve functionality.

### Applied (this pass)
- **Count-up fallback fixed** — static text now equals `data-count` (was 9/100 vs 6/40).
- **CSS dedup** — removed the duplicate `.stat` display rule.
- **Mobile: carousel drag gated to mouse** — `pointerType === "mouse"` guard stops
  touch double-scroll / scroll-snap fights.
- **Mobile: carousel dot tap target** — ~23px hit area, dot stays 7px visually.
- **Mobile: burger** — added `aria-controls`, Escape-to-close + focus return.
- **Mobile: `.hl` wraps on ≤720px** — long highlight phrases no longer risk overflow.

### Recommendations (not applied — cost/benefit is yours)

**R1 — Terminal machinery is over-built for decoration.** *Pros of trimming:*
~60 fewer JS lines, simpler mental model. *Cons:* you lose per-tab caching / clean
tab-switch. It's `aria-hidden` eye-candy, so the machinery buys little. Suggest:
keep the 3 tabs but drop the render cache + first-paint lead-in, or make it a
single non-tabbed session. **Recommended: trim.**

**R2 — Some Work planes still wrap lorem-ipsum.** The slide-in detail system now
carries real copy in the triage Work plane and all six Personal-works data-story
planes, but fraud/forecast/abtest/tickets + the shared placeholder are still lorem. The shell is
earning its keep now that real case studies live in it. **Recommended: fill the
remaining Work planes from `project_desc/plane-content-prompt.md`.**

**R3 — Work carousel re-implements native scroll.** Native scroll-snap already
gives touch/trackpad paging. On top sit arrows + looping + dots + a per-frame
opacity fade + hand-rolled mouse drag. *Pros of simplifying:* less code, no
edge-case bugs. *Cons:* lose the looping arrows / fade polish. **Recommended:**
consider dropping the mouse-drag entirely (native scroll covers it) and the rAF
opacity fade (a CSS mask on the track edges is cheaper). Keep arrows + dots.

**R4 — Burger drawer has no focus trap.** Low effort to add (trap Tab within the
drawer while open). Nice-to-have for a11y. **Recommended: add when convenient.**

**R5 — Two reveal observers + two typewriter engines.** The global reveal
observer (§5) and the plane `revealBlocks` observer are near-identical; `typeSpan`
and the terminal's `typeScript` are separate. *Pros of unifying:* DRY. *Cons:* the
callbacks genuinely differ (plane uses `root: plane`, terminal types multi-chunk),
so a shared abstraction may not clearly simplify. **Recommended: leave unless you
touch both — the duplication is small and readable.**

### Content notes (not code)
- Identity is inconsistent: `og:title` says "Elias Kelly", brand/`<title>` say
  "Peachy". Pick one.
- Hero eyebrow reads "Available **for to hire**" — likely a typo.
- Personal-works links + footer socials are all `href="#"` (JS intercepts the
  plane triggers). The 8 mock work cards still open the shared placeholder plane;
  real write-ups now exist for triage (Work) and all six Personal-works planes.
