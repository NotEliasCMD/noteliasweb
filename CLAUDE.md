# CLAUDE.md — build guide for an LLM continuing this project

This file orients an AI agent (or human) picking up **Peachy's portfolio**. Read
it before editing. It records the *why* behind the structure so you extend it in
the same grain instead of fighting it.

> **To modify a specific component, read [`COMPONENTS.md`](./COMPONENTS.md)
> instead of the whole codebase** — it has a self-contained section per component
> (files, line anchors, behavior, gotchas) plus a simplicity/mobile review. This
> file (`CLAUDE.md`) is the philosophy; `COMPONENTS.md` is the parts list.

## 1. What this is

A single-page, **dependency-free static site** (HTML + CSS + vanilla JS, no build
tooling, no framework, no package.json). It replicates the design language of
[dottxt.ai](https://dottxt.ai/) for a fictional data scientist named "Peachy".
There is **no Node in this environment** — do not introduce a build step or npm
dependencies unless the user explicitly asks and installs a toolchain. Keep it
runnable by simply opening `index.html`.

Ground truth of the reference design (extracted from dottxt.ai's compiled CSS):
- Fonts: *PP Neue Montreal* + *PP Neue Montreal Mono* (paid). We substitute
  **Space Grotesk** (display) + **JetBrains Mono** (mono) from Google Fonts.
- Accent colors seen in source: `#DDB8CA` (pink), `#BD932F` (gold). We lean into
  the pink as the "Peachy" brand. (`--gold` is defined in `:root` but currently
  unused — kept as a brand reference.)
- Motion vocabulary: blinking cursor, logo marquee, fade-in reveals, and a
  typewriter highlight (which replaced the original amber highlight flash). The
  site has since grown a tabbed terminal, a work carousel, slide-in project
  "planes", and an ASCII animation engine — see `COMPONENTS.md`.

## 2. File map & responsibilities

| File | Owns | Never put here |
|------|------|----------------|
| `index.html` | All content & DOM structure, section order, copy | Inline styles/scripts (keep it clean) |
| `styles.css` | Design tokens (`:root`), all layout, all `@keyframes` | JS-only concerns |
| `script.js`  | Behavior: reveal, typewriter, count-up, marquee, terminal, nav, year, carousel, closer plasma, project planes | Styling (add a class, style it in CSS) |
| `anim/*.js`  | ASCII animation engine (`ascii.js`) + plugins (`plasma/dna/cube.js`); live, loaded by `index.html` | Site behavior (goes in `script.js`) |
| `COMPONENTS.md` | Per-component reference + simplicity/mobile review | — |
| `plasma-preview.html` | **Dev-only** scratch harness to tune the closer plasma; **not linked from the site** and duplicates its knobs | Anything the shipped site depends on |

## 3. Design tokens (single source of truth)

All in `:root` at the top of `styles.css`. **Change the brand here, not inline.**

```
--cream / --cream-alt / --paper   backgrounds (alternating sections use --cream-alt)
--ink / --ink-soft / --muted      text hierarchy
--line                            hairline borders
--peach / --peach-deep            brand accent (primary/hover)
--gold                            defined but currently unused (brand reference)
--font-sans / --font-mono         type
--maxw / --gutter / --radius      layout
--ease                            shared easing curve
```

Convention: **mono font = anything "technical"** — nav links, buttons, labels,
section numbers, tags, meta. Sans = headings and body prose. Keep that split.

## 4. Section pattern (how to add a numbered section)

Every content block after the hero follows one grid template. Copy this:

```html
<section class="section" id="your-id">            <!-- add class "section--alt" for the cream-alt bg -->
  <div class="container section__grid">
    <div class="section__label">
      <span class="section__num">06</span>          <!-- next number -->
      <span class="section__kicker">Your kicker</span>
    </div>
    <div class="section__content">
      <h2 class="section__title" data-reveal>Heading with a <span class="hl" data-type>highlight</span>.</h2>
      <p class="section__lede" data-reveal>Body…</p>
      <!-- your content, each animatable child gets data-reveal -->
    </div>
  </div>
</section>
```

`section--alt` on alternating sections creates the cream/cream-alt rhythm. The
`.section__label` is sticky on desktop, stacks inline on mobile — handled in CSS.

## 5. Animation system — the important part

Motion is **design-critical**; preserve it. Two entry points:

### a) `[data-reveal]` — scroll reveal
Put `data-reveal` on any element that should fade + rise into view. `script.js`
uses an `IntersectionObserver` to add `.is-in` (CSS handles the transition). It
`unobserve`s after firing (one-shot). No config needed — just add the attribute.

### b) `[data-type]` — typewriter highlight
Put `data-type` on an inline `<span class="hl">…</span>` inside a revealed
element. On load, `script.js` blanks these spans (stashing the text in
`dataset.text`) and, when the element reveals, types the phrase out
character-by-character with a blinking pink caret (`.hl__caret`, reusing
`@keyframes blink`) that vanishes when done. `.hl` keeps the pink color. Use
sparingly, ~one per section, on the key phrase. Under reduced motion / no
IntersectionObserver the text is left intact (no typing).

### c) `[data-count]` — stat count-up
`<span class="stat__num" data-count="40">40</span>` animates 0→40 on reveal.
**The plain text content is the JS-off / reduced-motion fallback and must equal
`data-count`** (they were previously mismatched — don't reintroduce that).

### d) Marquee
The `#marqueeTrack` inner HTML is **duplicated once in JS** so the `-50%`
`@keyframes scroll` loops seamlessly. To change items, edit the `.marquee__item`
list in `index.html` only — do not pre-duplicate them (JS does it). Speed
auto-scales to width (~90px/s); tune `speed` in `script.js`.

### e) Terminal (now tabbed)
The typed sessions live in the `TABS` array in `script.js` (three tabs, each
`{id, script}` where `script` is an ordered list of `[className, text]` chunks).
Class names map to `.terminal__body .tok-*` colors in CSS. `tok-out`/`tok-comment`
render fast (program output); everything else types char-by-character. Edit a
tab's entry to change its demo. The `#cursor` span blinks forever via
`@keyframes blink`. The whole terminal is `aria-hidden` decoration.

### f) Work carousel, closer plasma, project planes
Three larger features added after the original design. Rather than re-document
them here, see `COMPONENTS.md` §8 (carousel), §10 (closer plasma), §11 (planes),
and §12 (the ASCII engine they use).

### Reduced motion
Everything above is gated on `prefers-reduced-motion`. If you add motion, add the
same guard (`reduceMotion` in JS, and the `@media (prefers-reduced-motion)` block
in CSS zeroes durations). Don't ship motion that can't be turned off.

## 6. Conventions & gotchas

- **BEM-ish class names**: `block__element--modifier`. Match the existing style.
- **No horizontal scroll**: `body` has `overflow-x: hidden`; wide things (marquee)
  are masked. Keep new wide content contained.
- **Responsive breakpoints**: `900px` (grids → single column) and `720px`
  (nav → burger drawer). Test both when adding layout.
- **Accessibility**: keep `:focus-visible` styles, `aria-*` on nav/burger, and
  decorative elements marked `aria-hidden`. The terminal is `aria-hidden` (it's
  eye-candy) — real content must live in readable DOM elsewhere.
- **Favicon** is an inline SVG data URI (🍑) in `index.html`.

## 7. Likely next tasks (backlog)

- Split projects into a dedicated `/work/<slug>.html` or a JSON-driven list.
- Real blog: turn the Writing list into generated pages or an RSS feed.
- Add a light/dark toggle (tokens already centralized — add a `[data-theme]`
  block that overrides `:root`).
- Contact form (needs a backend or a form service; currently a `mailto:`).
- Swap Space Grotesk/JetBrains Mono for licensed PP Neue Montreal if acquired.
- Self-host fonts for full offline support.

## 8. How to verify a change

```bash
python3 -m http.server 8099   # serve
# open http://localhost:8099, then check:
```
- No console errors.
- Reveals fire on scroll; highlight phrases type out; stats count up (and the
  count matches the static fallback with JS off).
- Terminal types out; tabs switch; cursor blinks.
- Marquee scrolls seamlessly (no jump at loop point) and pauses on hover.
- Work carousel: arrows page, dots track position, scroll-snaps.
- Click a work card → project plane slides in (cube/dna ASCII mounts, title
  types, blocks reveal); Back button + Escape close it, focus returns to the card.
- Closer "Let's talk" plasma animates on-screen and freezes under reduced motion.
- Resize to <720px: burger opens/closes, Escape closes it, layout is single-column.
- Toggle "Reduce motion" in OS settings: page renders fully static, no jank.
- Optional: open `components.html` — the living gallery renders each component
  in isolation for quick visual QA.
