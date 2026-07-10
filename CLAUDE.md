# CLAUDE.md — build guide for an LLM continuing this project

This file orients an AI agent (or human) picking up **Peachy's portfolio**. Read
it before editing. It records the *why* behind the structure so you extend it in
the same grain instead of fighting it.

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
- Accent colors seen in source: `#DDB8CA` (pink), `#BD932F` (gold), amber
  `rgba(251,191,36,.5)`. We lean into the pink as the "Peachy" brand.
- Motion vocabulary: blinking cursor, logo marquee, fade-in reveals, amber
  highlight flash. All four are reproduced here.

## 2. File map & responsibilities

| File | Owns | Never put here |
|------|------|----------------|
| `index.html` | All content & DOM structure, section order, copy | Inline styles/scripts (keep it clean) |
| `styles.css` | Design tokens (`:root`), all layout, all `@keyframes` | JS-only concerns |
| `script.js`  | Behavior: reveal, count-up, marquee dup, terminal typing, nav, year | Styling (add a class, style it in CSS) |

## 3. Design tokens (single source of truth)

All in `:root` at the top of `styles.css`. **Change the brand here, not inline.**

```
--cream / --cream-alt / --paper   backgrounds (alternating sections use --cream-alt)
--ink / --ink-soft / --muted      text hierarchy
--line                            hairline borders
--peach / --peach-deep            brand accent (primary/hover)
--amber                           target-highlight flash color
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
      <h2 class="section__title" data-reveal>Heading with a <span class="hl" data-target>highlight</span>.</h2>
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

### b) `[data-target]` — amber highlight flash
Put `data-target` on an inline `<span class="hl">…</span>` inside a revealed
element. When that element reveals, the span flashes the amber background
(`@keyframes target`). This is the dottxt "attention" accent — use it sparingly,
~one per section, on the key phrase.

### c) `[data-count]` — stat count-up
`<span class="stat__num" data-count="40">40</span>` animates 0→40 on reveal.
Keep a plain fallback number as the text content (used when JS/motion is off).

### d) Marquee
The `#marqueeTrack` inner HTML is **duplicated once in JS** so the `-50%`
`@keyframes scroll` loops seamlessly. To change items, edit the `.marquee__item`
list in `index.html` only — do not pre-duplicate them (JS does it). Speed
auto-scales to width (~90px/s); tune `speed` in `script.js`.

### e) Terminal
The typed session is the `SCRIPT` array in `script.js`: an ordered list of
`[className, text]` chunks. Class names map to `.terminal__body .tok-*` colors in
CSS. `tok-out`/`tok-comment` render fast (program output); everything else types
character-by-character. Edit `SCRIPT` to change the demo. The `#cursor` span
blinks forever via `@keyframes blink`.

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
- Reveals fire on scroll; amber highlights flash; stats count up.
- Terminal types out; cursor blinks.
- Marquee scrolls seamlessly (no jump at loop point) and pauses on hover.
- Resize to <720px: burger menu opens/closes, layout is single-column.
- Toggle "Reduce motion" in OS settings: page renders fully static, no jank.
