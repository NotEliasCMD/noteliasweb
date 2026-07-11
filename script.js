/* =========================================================================
   Peachy portfolio — interaction & animation layer (vanilla, no deps)
   Sections:
     1. Reveal-on-scroll (IntersectionObserver)
     2. Amber "target" highlight flash on the same trigger
     3. Stat count-up
     4. Seamless marquee (duplicate track for -50% loop)
     5. Terminal typing effect
     6. Nav: scrolled state + mobile drawer
     6.5 Theme toggle (dark mode) + localStorage persistence
     7. Footer year
   All motion respects prefers-reduced-motion.
   ========================================================================= */
(function () {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ---------------------------------------------- 1 + 2. reveal + typewriter */
  const revealEls = $$("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    // blank the highlight phrases up front so they type out from empty on reveal
    // (text stays in the DOM as the no-JS / reduced-motion fallback otherwise)
    $$("[data-type]").forEach((t) => {
      t.dataset.text = t.textContent;
      t.textContent = "";
    });

    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add("is-in");

          // type out any [data-type] highlight spans inside this element
          const typers = $$("[data-type]", el);
          if (el.hasAttribute("data-type")) typers.unshift(el);
          typers.forEach((t, i) => {
            setTimeout(() => typeSpan(t), 350 + i * 150);
          });

          // count-up any stats inside
          $$("[data-count]", el).forEach(countUp);

          obs.unobserve(el);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
    $$("[data-count]").forEach((el) => (el.textContent = el.dataset.count));
  }

  // type a highlight span's text one char at a time, trailing a blinking caret
  function typeSpan(el) {
    if (el.dataset.typed) return; // guard against double-fire
    el.dataset.typed = "1";
    const text = el.dataset.text ?? el.textContent;
    el.textContent = "";
    const caret = appendChunk(el, "hl__caret", "▍");
    let i = 0;
    (function typeChar() {
      caret.insertAdjacentText("beforebegin", text[i]);
      i++;
      if (i < text.length) setTimeout(typeChar, 75 + Math.random() * 65);
      else caret.remove();
    })();
  }

  /* ---------------------------------------------- 3. stat count-up */
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    if (isNaN(target) || reduceMotion) { el.textContent = el.dataset.count; return; }
    const dur = 1100;
    let start = null;
    function step(ts) {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = Math.round(target * eased).toString();
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toString();
    }
    requestAnimationFrame(step);
  }

  /* ---------------------------------------------- 4. seamless marquee */
  const track = $("#marqueeTrack");
  if (track) {
    // duplicate the item set once so a -50% translate loops seamlessly
    track.innerHTML += track.innerHTML;
    // scale duration to content width for a steady speed (~90px/sec)
    const speed = 90;
    requestAnimationFrame(() => {
      const dur = Math.max(18, track.scrollWidth / 2 / speed);
      track.style.setProperty("--dur", dur + "s");
    });
  }

  /* ---------------------------------------------- 5. terminal typing */
  const typedEl = $("#typed");
  const cursorEl = $("#cursor");
  // Each tab is { id, script } where script is an array of [className, text]
  // chunks. \n creates newlines. `null` class = plain. Tabs are click-to-switch;
  // tab 0 auto-types on load. Edit a tab's SESSIONS entry to change its content.
  const TABS = [
    { id: "tv", script: [
      ["tok-comment", "# elias :: what is TV advertising actually worth?\n"],
      ["tok-prompt", ">>> "],
      ["tok-kw", "import "], [null, "polars "], ["tok-kw", "as "], [null, "pl\n"],
      ["tok-prompt", ">>> "],
      ["tok-kw", "from "], [null, "elias "], ["tok-kw", "import "], [null, "mmm\n"],
      ["tok-prompt", ">>> "],
      [null, "spend = pl.read_parquet("], ["tok-str", '"media_spend.parquet"'], [null, ")\n"],
      ["tok-prompt", ">>> "],
      [null, "spend.height\n"],
      ["tok-num", "2_184_960"], ["tok-comment", "        # daily spend across regions\n"],
      ["tok-prompt", ">>> "],
      [null, "model = mmm.fit(spend, target="], ["tok-str", '"revenue"'], [null, ")\n"],
      ["tok-prompt", ">>> "],
      [null, "model.explain("], ["tok-str", '"tv"'], [null, ")\n"],
      ["tok-out", "what TV advertising did:\n"],
      ["tok-out", "  · returned $4.20 for every $1 spent\n"],
      ["tok-out", "  · sales peak ~3 days after an ad airs\n"],
      ["tok-out", "  · past $80k/week, extra spend stops paying off\n"],
      ["tok-prompt", ">>> "],
      [null, "model.report("], ["tok-str", '"tv"'], [null, ")\n"],
      ["tok-out", "TV drove 23% of last quarter's revenue\n"],
      ["tok-out", "about $1 in 4 of the budget wasn't working\n"],
      ["tok-prompt", ">>> "],
      [null, "model.recommend()\n"],
      ["tok-out", "\"move $120k from late-night to prime time ✦\"\n"],
      ["tok-prompt", ">>> "],
    ]},
    { id: "forecast", script: [
      ["tok-comment", "# elias :: how much will we sell next quarter?\n"],
      ["tok-prompt", ">>> "],
      ["tok-kw", "import "], [null, "polars "], ["tok-kw", "as "], [null, "pl\n"],
      ["tok-prompt", ">>> "],
      ["tok-kw", "from "], [null, "elias "], ["tok-kw", "import "], [null, "forecast\n"],
      ["tok-prompt", ">>> "],
      [null, "sales = pl.read_parquet("], ["tok-str", '"sales_history.parquet"'], [null, ")\n"],
      ["tok-prompt", ">>> "],
      [null, "sales.height\n"],
      ["tok-num", "5_312_880"], ["tok-comment", "        # weekly sales · 40 regions · 6 years\n"],
      ["tok-prompt", ">>> "],
      [null, "f = forecast.fit(sales, horizon="], ["tok-str", '"1Q"'], [null, ")\n"],
      ["tok-prompt", ">>> "],
      [null, "f.summary()\n"],
      ["tok-out", "next quarter: 48,200 units\n"],
      ["tok-out", "  · most likely between 44k and 52k\n"],
      ["tok-out", "  · holiday weeks drive ~30% of the total\n"],
      ["tok-out", "  · one region is trending down — worth a look\n"],
      ["tok-prompt", ">>> "],
      [null, "f.accuracy()\n"],
      ["tok-out", "off by 9% on average (was 22% before)\n"],
      ["tok-prompt", ">>> "],
      [null, "f.export("], ["tok-str", '"planning_dashboard"'], [null, ")\n"],
      ["tok-out", "\"finance can plan against this ✦\"\n"],
      ["tok-prompt", ">>> "],
    ]},
    { id: "triage", script: [
      ["tok-comment", "# elias :: read 40,000 support tickets in a minute\n"],
      ["tok-prompt", ">>> "],
      ["tok-kw", "import "], [null, "polars "], ["tok-kw", "as "], [null, "pl\n"],
      ["tok-prompt", ">>> "],
      ["tok-kw", "from "], [null, "elias "], ["tok-kw", "import "], [null, "triage\n"],
      ["tok-prompt", ">>> "],
      [null, "tickets = pl.read_parquet("], ["tok-str", '"tickets.parquet"'], [null, ")\n"],
      ["tok-prompt", ">>> "],
      [null, "tickets.height\n"],
      ["tok-num", "41_920"], ["tok-comment", "           # free-text support tickets\n"],
      ["tok-prompt", ">>> "],
      [null, "sorted = triage.run(tickets)\n"],
      ["tok-prompt", ">>> "],
      [null, "sorted.summary()\n"],
      ["tok-out", "what people were writing in about:\n"],
      ["tok-out", "  · 38% billing · 25% login · 19% shipping\n"],
      ["tok-out", "  · 1,240 urgent ones routed first\n"],
      ["tok-out", "  · every ticket tagged, none left in a pile\n"],
      ["tok-prompt", ">>> "],
      [null, "triage.accuracy()\n"],
      ["tok-out", "98% sorted correctly, checked against people\n"],
      ["tok-prompt", ">>> "],
      [null, "triage.export("], ["tok-str", '"helpdesk"'], [null, ")\n"],
      ["tok-out", "\"support starts the day already triaged ✦\"\n"],
      ["tok-prompt", ">>> "],
    ]},
  ];

  const tabBtns = $$(".terminal__tab");
  let typeToken = 0;        // bump to cancel any in-flight typing chain
  const rendered = {};      // tab id -> true once fully typed (cache)
  let firstShow = true;     // only the first auto-type gets the paint lead-in
  let activeTab = null;

  function showTab(id) {
    if (!typedEl || !cursorEl || id === activeTab) return;
    const tab = TABS.find((t) => t.id === id);
    if (!tab) return;
    activeTab = id;
    typeToken++;            // invalidate whatever was typing
    tabBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.tab === id));
    typedEl.textContent = "";
    if (reduceMotion || rendered[id]) {
      tab.script.forEach(([cls, text]) => appendChunk(typedEl, cls, text));
      rendered[id] = true;
    } else {
      typeScript(typedEl, tab.script, id, typeToken);
    }
  }

  if (typedEl && cursorEl) {
    tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
    showTab(TABS[0].id);
  }

  function appendChunk(parent, cls, text) {
    const span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text;
    parent.appendChild(span);
    return span;
  }

  function typeScript(parent, script, id, token) {
    let seg = 0;
    function nextSegment() {
      if (token !== typeToken) return;   // a newer tab took over — stop
      if (seg >= script.length) { rendered[id] = true; return; } // done — cursor keeps blinking
      const [cls, text] = script[seg];
      const span = appendChunk(parent, cls, "");
      let i = 0;
      // instant for output lines (feels like program response), typed for input
      const isOutput = cls === "tok-out" || cls === "tok-comment";
      const speed = isOutput ? 6 : 20 + Math.random() * 30;
      function typeChar() {
        if (token !== typeToken) return;
        span.textContent += text[i];
        i++;
        // keep the terminal scrolled to the newest line
        parent.parentElement.scrollTop = parent.parentElement.scrollHeight;
        if (i < text.length) {
          setTimeout(typeChar, isOutput ? 4 : speed);
        } else {
          seg++;
          setTimeout(nextSegment, isOutput ? 120 : 90);
        }
      }
      if (text.length) typeChar();
      else { seg++; nextSegment(); }
    }
    // small paint lead-in only on the very first render; snappy on tab switches
    setTimeout(nextSegment, firstShow ? 600 : 120);
    firstShow = false;
  }

  /* ---------------------------------------------- 6. nav */
  const nav = $("#nav");
  const onScroll = () => nav && nav.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const burger = $("#burger");
  const drawer = $("#drawer");
  if (burger && drawer) {
    const toggle = (open) => {
      const willOpen = open ?? drawer.hidden;
      drawer.hidden = !willOpen;
      drawer.classList.toggle("is-open", willOpen);
      burger.classList.toggle("is-open", willOpen);
      burger.setAttribute("aria-expanded", String(willOpen));
    };
    burger.addEventListener("click", () => toggle());
    $$("a", drawer).forEach((a) => a.addEventListener("click", () => toggle(false)));
    // Escape closes the open drawer and returns focus to the burger
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !drawer.hidden) { toggle(false); burger.focus(); }
    });
  }

  /* ---------------------------------------------- 6.5 theme toggle */
  // Dark mode is a CSS-token flip: setting <html data-theme="dark"> swaps the
  // palette in styles.css (the ASCII animations inherit --ink, so they recolor
  // for free). We only persist the choice and keep the buttons' state in sync.
  // The initial theme is applied pre-paint by the inline script in <head>;
  // default (no saved value) is light. No prefers-color-scheme listener — the
  // stored choice is the only source of truth after first load.
  const root = document.documentElement;
  const themeBtns = $$(".theme-toggle");
  if (themeBtns.length) {
    const isDark = () => root.dataset.theme === "dark";
    const syncBtns = () =>
      themeBtns.forEach((b) => b.setAttribute("aria-pressed", String(isDark())));
    const setTheme = (dark) => {
      if (dark) root.dataset.theme = "dark";
      else delete root.dataset.theme;
      try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
      syncBtns();
    };
    syncBtns();
    themeBtns.forEach((b) => b.addEventListener("click", () => setTheme(!isDark())));
  }

  /* ---------------------------------------------- 7. footer year */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------------------------------------- 7.5 work carousel */
  // The #work cards live in a horizontal scroll-snap track. Users scroll/drag
  // sideways natively; the ← → arrows scroll by roughly one viewport-width of
  // cards, and JS-built dots reflect + jump to the nearest card. Smooth scroll
  // is used unless reduced motion is on (then it jumps instantly).
  const workTrack = $("#workTrack");
  if (workTrack) {
    const prevBtn = $("#workPrev");
    const nextBtn = $("#workNext");
    const dotsWrap = $("#workDots");
    const cards = $$(".card", workTrack);
    const behavior = reduceMotion ? "auto" : "smooth";
    const page = () => Math.max(workTrack.clientWidth * 0.85, 280);
    const maxScroll = () => workTrack.scrollWidth - workTrack.clientWidth;
    const goto = (left) => workTrack.scrollTo({ left, behavior });

    // The cards flow into 2 rows, so several cards share one column (one scroll
    // position). Collapse them to the distinct column offsets → one dot each.
    const columns = () => {
      const xs = [];
      cards.forEach((c) => {
        const x = c.offsetLeft - workTrack.offsetLeft;
        if (!xs.some((v) => Math.abs(v - x) < 2)) xs.push(x);
      });
      return xs.sort((a, b) => a - b);
    };

    // one dot per column, click to jump there
    const dots = columns().map((_, i) => {
      const d = document.createElement("button");
      d.className = "carousel__dot";
      d.type = "button";
      d.setAttribute("aria-label", "Go to slide " + (i + 1));
      d.addEventListener("click", () => goto(columns()[i]));
      dotsWrap.appendChild(d);
      return d;
    });

    // arrows page through; at an edge they loop around to the other end
    function stepCarousel(dir) {
      const max = maxScroll();
      if (dir > 0 && workTrack.scrollLeft >= max - 8) return goto(0);   // end → start
      if (dir < 0 && workTrack.scrollLeft <= 8) return goto(max);       // start → end
      workTrack.scrollBy({ left: dir * page(), behavior });
    }
    if (prevBtn) prevBtn.addEventListener("click", () => stepCarousel(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => stepCarousel(1));

    // fade each card in/out by how much of it is clipped past the track edges
    let fadeRaf = 0;
    function paintFade() {
      fadeRaf = 0;
      const tr = workTrack.getBoundingClientRect();
      cards.forEach((c) => {
        const r = c.getBoundingClientRect();
        const visible = Math.max(0, Math.min(r.right, tr.right) - Math.max(r.left, tr.left));
        const frac = r.width ? visible / r.width : 1;
        c.style.opacity = Math.max(0.12, Math.min(1, frac * 1.5)).toFixed(3);
      });
    }

    function syncCarousel() {
      // highlight the dot for the column nearest the left edge
      const cols = columns();
      let best = 0, bestD = Infinity;
      cols.forEach((x, i) => {
        const d = Math.abs(x - workTrack.scrollLeft);
        if (d < bestD) { bestD = d; best = i; }
      });
      dots.forEach((d, i) => d.classList.toggle("is-active", i === best));
      if (!fadeRaf) fadeRaf = requestAnimationFrame(paintFade);
    }
    workTrack.addEventListener("scroll", syncCarousel, { passive: true });
    window.addEventListener("resize", syncCarousel, { passive: true });
    syncCarousel();
    paintFade();

    // pointer drag-to-scroll for mouse users only — touch/trackpad scroll
    // natively, and running this handler on touch fights native scroll-snap.
    let down = false, startX = 0, startLeft = 0;
    workTrack.addEventListener("pointerdown", (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      down = true; startX = e.clientX; startLeft = workTrack.scrollLeft;
    });
    workTrack.addEventListener("pointermove", (e) => {
      if (down) workTrack.scrollLeft = startLeft - (e.clientX - startX);
    });
    const endDrag = () => { down = false; };
    workTrack.addEventListener("pointerup", endDrag);
    workTrack.addEventListener("pointercancel", endDrag);
    workTrack.addEventListener("pointerleave", endDrag);
  }

  /* ---------------------------------------------- 8. closer plasma backdrop */
  // The "Let's talk" section runs the ASCII `plasma` field full-width behind its
  // content (tinted + scrimmed in CSS so the copy stays readable). The grid is
  // sized to the layer's box so it truly spans the width, refits on resize, and
  // only animates while the section is on screen. Reduced motion → one frozen frame.
  const closerBg = $("[data-anim-bg]");
  if (closerBg && window.ASCII && ASCII.byId("plasma")) {
    const CHAR_ASPECT = 0.6; // monospace advance-width / font-size
    const CELL = 14;         // px per character cell (tune for density)

    function gridFor() {
      const w = closerBg.clientWidth, h = closerBg.clientHeight;
      if (!w || !h) return null;
      closerBg.style.fontFamily = "var(--font-mono)";
      closerBg.style.fontSize = CELL + "px";
      return { cols: Math.ceil(w / (CELL * CHAR_ASPECT)), rows: Math.ceil(h / CELL) };
    }

    const grid = gridFor();
    if (grid) {
      const ctrl = ASCII.mount(closerBg, "plasma", {
        cols: grid.cols, rows: grid.rows, fps: 30, autostart: false,
      });

      if (reduceMotion) {
        // paint a single static frame, then freeze
        ctrl.start();
        requestAnimationFrame(() => ctrl.stop());
      } else if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(
          (entries) => entries.forEach((e) => (e.isIntersecting ? ctrl.start() : ctrl.stop())),
          { threshold: 0 }
        );
        io.observe(closerBg);

        // refit the grid to the new width/height when the viewport changes
        let resizeRaf = null;
        window.addEventListener("resize", () => {
          if (resizeRaf) cancelAnimationFrame(resizeRaf);
          resizeRaf = requestAnimationFrame(() => {
            const g = gridFor();
            if (g) ctrl.resize(g.cols, g.rows);
          });
        }, { passive: true });
      } else {
        ctrl.start();
      }
    }
  }

  /* ---------------------------------------------- 9. project detail planes */
  // Clicking a work card slides the page left and a detail "plane" slides in
  // from the right. The plane types its title (reusing typeSpan), pins an ASCII
  // graphic (cube/dna) on the left, and reveals text blocks on scroll. The whole
  // thing respects reduced motion. Back button + Escape return to the page.
  const planesWrap = $("#planes");
  if (planesWrap && window.ASCII) {
    // blank plane titles up front so they type from empty on open
    $$("[data-plane-type]").forEach((t) => {
      t.dataset.text = t.textContent;
      if (!reduceMotion) t.textContent = "";
    });

    const anims = {};      // plane id -> ASCII controller (lazily mounted)
    const observers = {};  // plane id -> per-plane reveal IntersectionObserver
    let activePlane = null;
    let lastCard = null;

    // Every plane mounts its animation on ONE shared grid (not the animation's
    // native cols/rows) so fontFor computes the same font size and the centered
    // block lands at the same size and position on every plane. All plane
    // animations are parametric on (cols, rows), so this only reshapes them
    // slightly. Change here to retune all planes at once.
    const PLANE_GRID = { cols: 62, rows: 26 };

    // size a <pre> so cols*rows of monospace fill its box
    function fontFor(pre, cols, rows) {
      const boxW = pre.clientWidth, boxH = pre.clientHeight;
      if (!boxW || !boxH) return;
      const charAspect = 0.6; // monospace advance-width / font-size
      const fs = Math.max(4, Math.min(boxW / (cols * charAspect), boxH / rows));
      pre.style.fontSize = fs.toFixed(2) + "px";
    }

    function ensureAnim(plane) {
      if (anims[plane.id]) return anims[plane.id];
      const pre = $("[data-anim-target]", plane);
      const animId = plane.dataset.anim;
      const spec = ASCII.byId(animId);
      if (!pre || !spec) return null;
      pre.style.fontFamily = "var(--font-mono)"; // keep the site's mono, not the engine's default
      fontFor(pre, PLANE_GRID.cols, PLANE_GRID.rows);
      anims[plane.id] = ASCII.mount(pre, animId, {
        autostart: false,
        cols: PLANE_GRID.cols,
        rows: PLANE_GRID.rows,
      });
      return anims[plane.id];
    }

    function typeTitle(plane) {
      const t = $("[data-plane-type]", plane);
      if (!t) return;
      if (reduceMotion) { t.textContent = t.dataset.text; return; }
      delete t.dataset.typed; // allow a fresh type-out each time the plane opens
      typeSpan(t);
    }

    function revealBlocks(plane) {
      const blocks = $$("[data-plane-reveal]", plane);
      if (reduceMotion || !("IntersectionObserver" in window)) {
        blocks.forEach((b) => b.classList.add("is-in"));
        return;
      }
      if (observers[plane.id]) return;
      const io = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-in");
            obs.unobserve(entry.target);
          });
        },
        { root: plane, threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
      );
      blocks.forEach((b) => io.observe(b));
      observers[plane.id] = io;
    }

    function openPlane(projId, card) {
      const plane = document.getElementById("plane-" + projId);
      if (!plane || activePlane) return;
      lastCard = card || document.activeElement;
      activePlane = plane;

      // the shared placeholder plane borrows the clicked card's title/tag/year
      if (projId === "placeholder" && card) {
        const t = $("[data-plane-type]", plane);
        if (t) {
          t.dataset.text = $(".card__title", card).textContent.trim();
          t.textContent = reduceMotion ? t.dataset.text : "";
        }
        const tag = $(".plane__tag", plane);
        const crumb = $(".plane__crumb", plane);
        if (tag) tag.textContent = $(".card__tag", card).textContent;
        if (crumb) crumb.textContent = "Selected work · " + $(".card__year", card).textContent;
      }

      document.body.classList.add("is-planed");
      plane.hidden = false;
      plane.setAttribute("aria-hidden", "false");
      void plane.offsetWidth; // reflow so the slide runs from translateX(100%)
      plane.classList.add("is-open");
      plane.scrollTop = 0;

      const ctrl = ensureAnim(plane);
      if (ctrl) {
        ctrl.start();
        if (reduceMotion) requestAnimationFrame(() => ctrl.stop()); // one static frame
      }

      revealBlocks(plane);
      setTimeout(() => typeTitle(plane), reduceMotion ? 0 : 420);

      const back = $(".plane__back", plane);
      if (back) back.focus();
    }

    function closePlane() {
      if (!activePlane) return;
      const plane = activePlane;
      activePlane = null;

      plane.classList.remove("is-open");
      plane.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-planed");
      if (anims[plane.id]) anims[plane.id].stop();

      if (reduceMotion) {
        plane.hidden = true;
      } else {
        const onDone = (e) => {
          if (e.propertyName !== "transform") return;
          plane.hidden = true;
          plane.removeEventListener("transitionend", onDone);
        };
        plane.addEventListener("transitionend", onDone);
      }

      if (lastCard && lastCard.focus) lastCard.focus();
    }

    $$(".card--link").forEach((card) => {
      const id = card.dataset.project;
      card.addEventListener("click", () => openPlane(id, card));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlane(id, card); }
      });
    });

    $$(".plane__back").forEach((b) => b.addEventListener("click", closePlane));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && activePlane) closePlane();
    });

    // refit the ASCII font if the window resizes while a plane is open
    window.addEventListener("resize", () => {
      if (!activePlane) return;
      const pre = $("[data-anim-target]", activePlane);
      const spec = ASCII.byId(activePlane.dataset.anim);
      if (pre && spec) fontFor(pre, spec.cols, spec.rows);
    }, { passive: true });
  }
})();
