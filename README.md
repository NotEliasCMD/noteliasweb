# Peachy — Data Scientist Portfolio

A single-page portfolio homepage for **Peachy**, a data scientist. The design is
inspired by [dottxt.ai](https://dottxt.ai/): warm cream canvas, technical
minimalism, monospace accents, numbered sections, and restrained, purposeful
motion.

It is a **dependency-free static site** — three files, no build step, no
framework. Open it in a browser and it works.

```
replica_site/
├── index.html   # all page markup / content
├── styles.css   # design tokens + all styling and keyframes
├── script.js    # animation & interaction layer (vanilla JS)
├── README.md    # this file
└── CLAUDE.md    # deeper guide for an LLM continuing the build
```

## Run it

No build, no install. Any of these work:

```bash
# Option A — just open the file
open index.html            # macOS

# Option B — serve it (recommended; avoids any file:// quirks)
python3 -m http.server 8099
# then visit http://localhost:8099
```

The only external dependency is **Google Fonts** (Space Grotesk + JetBrains
Mono) loaded via `<link>`. If offline, the site falls back to system
sans/monospace stacks and still looks correct.

## What's on the page

| # | Section    | Content |
|---|------------|---------|
| — | Hero       | Headline + animated **terminal** (typing Python/Polars session) |
| — | Marquee    | Infinite-scrolling strip of tools (Python, PyTorch, …) |
| 01| About      | Bio + animated count-up stats |
| 02| Work       | 4 project cards (fraud ML, forecasting, A/B platform, LLM NLP) |
| 03| Skills     | 3-column toolkit (Modeling / Engineering / Craft) |
| 04| Writing    | Blog-post list with hover interactions |
| 05| Contact    | Dark closer section + email CTA |
| — | Footer     | Brand, link columns, copyright |

All copy is **filler** — swap freely.

## The four signature animations (design-critical)

These mirror the motion vocabulary observed in dottxt.ai's compiled CSS:

1. **Blinking terminal cursor** — `@keyframes blink`, `.8s` step loop (`styles.css`).
2. **Infinite logo marquee** — `@keyframes scroll` translating `-50%`; the track
   is duplicated in JS so the loop is seamless. Pauses on hover.
3. **Scroll-reveal fade + rise** — `[data-reveal]` elements fade/translate in via
   an `IntersectionObserver` adding `.is-in`.
4. **Amber "target" highlight flash** — `[data-target]` words flash an amber
   background (`@keyframes target`) when their section reveals — dottxt's
   attention-drawing accent.

Plus: animated **stat count-up**, nav scroll state, and a mobile drawer.

**All motion respects `prefers-reduced-motion`** — the terminal renders fully,
reveals show instantly, marquee/cursor stop.

## Customizing quickly

- **Brand color / theme:** edit the tokens in `:root` at the top of `styles.css`
  (`--peach`, `--cream`, `--ink`, fonts, radius…). Everything derives from them.
- **Content:** edit `index.html` directly.
- **Terminal script:** edit the `SCRIPT` array in `script.js`.
- **Marquee items:** edit the `.marquee__item` list in `index.html`.

See `CLAUDE.md` for the full architecture, conventions, and extension guide.
