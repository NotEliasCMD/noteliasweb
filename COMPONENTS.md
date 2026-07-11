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
| [Project "planes"](#11-project-planes) | ~525–763 | `.stage/.plane/.ascii` ~370–474 | `9. project planes` |
| [ASCII engine](#12-ascii-engine-anim) | — | — | `anim/*.js` |

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

- **HTML** ~156–375 (13 cards: 4 real `data-project` + 9 placeholders) · **CSS**
  `.carousel*` / `.cards--carousel` ~234–283 (+ responsive ~483, ~497) · **JS**
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

- **HTML** ~525–763 (5 `<article class="plane">`: fraud, forecast, abtest,
  tickets, + a shared placeholder) · **CSS** `.stage` / `.plane*` / `.ascii-*`
  ~370–474 (+ responsive ~486–490, reduced-motion ~507–508) · **JS** banner
  `9. project planes`.
- Clicking a `.card--link` (or Enter/Space) slides the main `.stage` back and the
  matching plane in (`body.is-planed`). Each plane lazily mounts a `cube` or `dna`
  ASCII animation (`data-anim`) into its `.ascii-screen`, types its title
  (reusing `typeSpan`), and reveals `[data-plane-reveal]` blocks via its own
  scoped observer. Back button + Escape close it; focus returns to the
  originating card. The shared placeholder plane borrows the clicked card's
  title/tag/year. On ≤900px the pinned media/head columns un-stick.
- **Gotcha / over-engineering:** largest single feature; **all body copy is lorem
  ipsum** — a full interaction shell around placeholder content (see review §R2).

## 12. ASCII engine (`anim/`)

- **Files:** `anim/ascii.js` (254 ln, the engine) + `anim/plasma.js` (29),
  `anim/dna.js` (40), `anim/cube.js` (47). Loaded at the bottom of `index.html`.
  **Live production code**, consumed by §10 (plasma) and §11 (cube/dna).
- `ascii.js` exposes `window.ASCII`: a `Screen` class (char buffer + `Float32Array`
  z-buffer, `set/get/plot/shade/text/line`), a `register(spec)` registry, a
  `mount(el, id, opts)` rAF player returning `{start, stop, resize, running}`, and
  `util` (`clamp/lerp/hash/noise2`). Pure text into a `<pre>` — no WebGL/canvas.
- **Add an animation:** `ASCII.register({ id, cols, rows, fps, frame(screen, t){…} })`
  in a new `anim/<name>.js`, add a `<script>` for it, reference by `data-anim` /
  `data-anim-bg`. The three existing animations are thin, idiomatic plugins —
  right-sized, don't refactor.

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

**R2 — Project planes wrap lorem-ipsum.** A complete slide-in detail system (~150
JS + ~240 HTML + ~100 CSS lines) with placeholder copy. *Keep as is* only if real
case-study content is coming soon; otherwise it's a large surface with no payoff.
**Recommended: keep the shell, prioritize real copy — don't delete.**

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
- Writing posts + footer socials are all `href="#"`; 9/13 work cards + all 5
  planes are placeholder content.
