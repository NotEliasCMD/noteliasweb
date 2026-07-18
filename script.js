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
  // --- Easter eggs -------------------------------------------------------
  // Click the terminal, type one of these `trigger` words, and press Enter.
  // `reaction()` returns [className, text] chunks (same format as TABS below),
  // so swapping the word or the celebration output is a one-line edit here —
  // no other code needs to change. Each egg also plays `playChime()` by default;
  // set `sound: false` for a silent egg, or `sound: (ctx) => {…}` for a custom
  // Web Audio effect.
  const MAX_INPUT = 40;   // max chars a visitor may type at the prompt;
                          // further keystrokes are silently ignored at the cap
  const EASTER_EGGS = [
    {
      trigger: "secret",
      reaction: () => [
        ["tok-celebrate", "🎉🎊✨🥳🎈🍑✨🎊🎉\n"],
        ["tok-out", "you found it.\n"],
      ],
    },
    {
      trigger: "lock in",
      reaction: () => [
        ["tok-celebrate", "🔒 lock in to code\n"],
      ],
      sound: () => playLockin(),   // streams the prefetched mp3, not the chime
    },
  ];

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
  const terminalEl = $(".terminal");
  const inputEl = $("#terminalInput");   // where the visitor's keystrokes land
  let typeToken = 0;        // bump to cancel any in-flight typing chain
  const rendered = {};      // tab id -> true once fully typed (cache)
  let firstShow = true;     // only the first auto-type gets the paint lead-in
  let activeTab = null;
  let inputActive = false;  // true while the visitor is typing at the prompt

  function showTab(id) {
    if (!typedEl || !cursorEl || id === activeTab) return;
    const tab = TABS.find((t) => t.id === id);
    if (!tab) return;
    activeTab = id;
    typeToken++;            // invalidate whatever was typing
    exitInputMode();        // switching tabs wipes #typed, so drop any input too
    tabBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.tab === id));
    typedEl.textContent = "";
    if (reduceMotion || rendered[id]) {
      tab.script.forEach(([cls, text]) => appendChunk(typedEl, cls, text));
      rendered[id] = true;
    } else {
      typeScript(typedEl, tab.script, id, typeToken);
    }
  }

  // --- Easter-egg input mode ---------------------------------------------
  // Finish typing the active tab instantly so there is a clean trailing
  // ">>> " prompt for the visitor to type after.
  function finishActiveTab() {
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab || rendered[activeTab]) return;
    typeToken++;                       // cancel any in-flight typing
    typedEl.textContent = "";
    tab.script.forEach(([cls, text]) => appendChunk(typedEl, cls, text));
    rendered[activeTab] = true;
  }

  function enterInputMode() {
    if (!typedEl || !terminalEl || !inputEl) return;
    finishActiveTab();
    inputActive = true;
    terminalEl.classList.add("terminal--input");
  }

  function exitInputMode() {
    inputActive = false;
    if (inputEl) inputEl.textContent = "";
    if (terminalEl) terminalEl.classList.remove("terminal--input");
  }

  // Celebration sound — synthesized with Web Audio, no asset needed. Created
  // lazily inside the Enter keypress (a user gesture), so autoplay is allowed.
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  function getAudioCtx() {
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  // Real audio track for the "lock in" egg. AFTER the page has fully loaded (so it
  // never competes with initial page load), stream the ENTIRE mp3 down in the
  // background using fetch()'s chunked ReadableStream — read piece by piece, then
  // stitch into one Blob and hand the Audio element a local object URL. Result: the
  // whole ~7.8 MB track is prefetched in pieces, in the background, and playback is
  // instant when the egg fires (no network wait), served from a blob: URL.
  let lockinAudio = null;          // ready-to-play element (src = blob: URL) once fetched
  let lockinReady = null;          // the in-flight prefetch promise (dedupes callers)

  function prefetchLockin() {
    if (lockinReady) return lockinReady;
    lockinReady = fetch("aud/lockin.mp3")
      .then((res) => {
        if (!res.ok || !res.body) return res.blob(); // fallback: whole-body blob
        // Drain the stream chunk-by-chunk so the download is explicitly "in pieces".
        const reader = res.body.getReader();
        const chunks = [];
        return (function pump() {
          return reader.read().then(({ done, value }) => {
            if (done) return new Blob(chunks, { type: "audio/mpeg" });
            chunks.push(value);
            return pump();
          });
        })();
      })
      .then((blob) => {
        const a = new Audio(URL.createObjectURL(blob));
        a.preload = "auto";
        lockinAudio = a;
        return a;
      })
      .catch(() => null);          // network/CORS failure: playLockin() falls back below
    return lockinReady;
  }
  // Kick the background download once the page is done loading.
  window.addEventListener("load", prefetchLockin);

  function playLockin() {
    if (lockinAudio) {             // fully prefetched → instant, offline playback
      lockinAudio.currentTime = 0;
      lockinAudio.play().catch(() => {});
      return;
    }
    // Triggered before the prefetch finished: stream directly so it still plays.
    const a = new Audio("aud/lockin.mp3");
    a.play().catch(() => {});
    prefetchLockin();              // ensure the cached copy is still being fetched
  }

  // A short rising major arpeggio (C5–E5–G5–C6) — a little "ta-da".
  function playChime() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const t = now + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }

  // Commit the typed line: echo it, run a matching easter egg (or report an
  // unknown command), then drop a fresh prompt. Uses appendChunk so it renders
  // instantly, which also means it works fine under reduced motion.
  function submitInput() {
    const raw = inputEl.textContent;
    const cmd = raw.trim().toLowerCase();
    if (raw.length) appendChunk(typedEl, "tok-cmd", raw + "\n");
    inputEl.textContent = "";
    const egg = EASTER_EGGS.find((e) => e.trigger === cmd);
    if (egg) {
      egg.reaction().forEach(([cls, text]) => appendChunk(typedEl, cls, text));
      if (egg.sound !== false) {
        if (typeof egg.sound === "function") egg.sound(getAudioCtx());
        else playChime();
      }
    } else if (cmd) {
      appendChunk(typedEl, "tok-comment", "command not found: " + cmd + "\n");
    }
    appendChunk(typedEl, "tok-prompt", ">>> ");
    typedEl.parentElement.scrollTop = typedEl.parentElement.scrollHeight;
  }

  if (typedEl && cursorEl) {
    tabBtns.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
    showTab(TABS[0].id);

    // Click the terminal to type; click away to leave input mode.
    if (terminalEl && inputEl) {
      terminalEl.addEventListener("click", enterInputMode);
      document.addEventListener("click", (e) => {
        if (inputActive && !terminalEl.contains(e.target)) exitInputMode();
      });
      document.addEventListener("keydown", (e) => {
        if (!inputActive) return;
        const ae = document.activeElement;
        if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "Escape") { exitInputMode(); return; }
        if (e.key === "Enter") { e.preventDefault(); submitInput(); return; }
        if (e.key === "Backspace") {
          e.preventDefault();
          inputEl.textContent = inputEl.textContent.slice(0, -1);
          return;
        }
        if (e.key.length === 1) {
          e.preventDefault();
          if (inputEl.textContent.length >= MAX_INPUT) return; // at cap — ignore
          inputEl.textContent += e.key;
          typedEl.parentElement.scrollTop = typedEl.parentElement.scrollHeight;
        }
      });
    }
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
  // Clicking a work card (or a personal-works list entry) slides the page aside
  // and a detail "plane" slides in over it. The plane types its title (reusing
  // typeSpan), pins an ASCII graphic, and reveals text blocks on scroll. Back
  // button + Escape return to the page; reduced motion is respected throughout.
  // Two groups run off the same machinery: Work slides in from the right, and
  // Personal works is a horizontal mirror (slides in from the left, graphic on
  // the right, nav on the left) — see createPlaneGroup + .plane--mirror in CSS.
  const planesWrap = $("#planes");
  if (planesWrap && window.ASCII) {
    // blank plane titles up front so they type from empty on open
    $$("[data-plane-type]").forEach((t) => {
      t.dataset.text = t.textContent;
      if (!reduceMotion) t.textContent = "";
    });

    const anims = {};      // plane id -> ASCII controller (lazily mounted, shared)
    const observers = {};  // plane id -> per-plane reveal IntersectionObserver (shared)

    // Every plane mounts its animation on ONE shared grid (not the animation's
    // native cols/rows) so fontFor computes the same font size and the centered
    // block lands at the same size and position on every plane. All plane
    // animations are parametric on (cols, rows), so this only reshapes them
    // slightly. Change here to retune all planes at once.
    const PLANE_GRID = { cols: 62, rows: 26 };

    // Device/browser back button + shareable deep links. Opening a plane pushes
    // one history entry AND writes a clean path (e.g. /f1) so the plane can be
    // linked to and the back gesture returns to the page instead of leaving the
    // site. Only one plane is open at a time (the full-screen overlay covers the
    // other group's triggers), so a single shared closer pointer + a single
    // "which slug is open" marker suffice.
    let closeActivePlane = null;
    let openSlug = null;                 // slug of the currently-open plane, or null
    const openBySlug = {};               // slug -> (fromRoute) => opens that plane

    // Clean /slug deep links assume the site is served from the domain root
    // (saile.codes, or localhost while developing). The github.io project-page
    // mirror is served from /noteliasweb/, so writing absolute /slug paths there
    // would point outside the app. On that mirror we fall back to the original
    // behavior: a plane still opens on click and pushes ONE back-target entry
    // (URL unchanged), so the back gesture closes it — just no shareable URL.
    const CLEAN_URLS = !location.hostname.endsWith("github.io");

    // A trigger's data-project is the plane key; the public URL slug drops the
    // Personal-works "pw-" prefix (Work keys are used as-is). No collisions.
    const slugOf = (projId) => projId.replace(/^pw-/, "");
    // the slug the URL currently points at (first path segment), or "" for home
    const currentSlug = () => location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
    // Reflect the open plane in the URL. On CLEAN_URLS hosts, write a clean
    // /slug path (push on open, replace on prev/next hops). Elsewhere, keep the
    // URL unchanged and only push the single back-target entry on open.
    function setUrl(slug, replace) {
      if (!CLEAN_URLS) {
        if (!replace) history.pushState({ peachyPlane: true }, "");  // back target only
        return;
      }
      const st = { peachyPlane: true, slug };
      if (replace) history.replaceState(st, "", "/" + slug);
      else history.pushState(st, "", "/" + slug);
    }

    // Keep the URL and the open plane in agreement on back/forward navigation.
    window.addEventListener("popstate", () => {
      if (!CLEAN_URLS) {                 // mirror: back just closes the open plane
        if (closeActivePlane) closeActivePlane();
        return;
      }
      const slug = currentSlug();
      if (slug && openBySlug[slug]) {
        // URL points at a plane: open it (swapping if a different one is open)
        if (slug !== openSlug) {
          if (closeActivePlane) closeActivePlane();
          openBySlug[slug](true);        // fromRoute: don't stack another entry
        }
      } else if (openSlug) {
        // URL is back at base (or an unknown slug) but a plane is open: close it
        if (closeActivePlane) closeActivePlane();
      }
    });

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

    // clear a plane's reveal state so its blocks animate fresh the next time it
    // is shown
    function resetReveals(plane) {
      if (observers[plane.id]) { observers[plane.id].disconnect(); delete observers[plane.id]; }
      $$("[data-plane-reveal]", plane).forEach((b) => b.classList.remove("is-in"));
    }

    // A self-contained plane controller wired to one ordered list of triggers.
    // `cards` is the DOM-ordered trigger list that drives prev/next; `mirror`
    // flips the group into the left-sliding, graphic-on-right, nav-on-left
    // variant (see .plane--mirror in styles.css). The site runs two groups:
    // Work (mirror:false) and Personal works (mirror:true). Each group owns its
    // own active-plane state, so only its own back/nav/arrows/Escape drive it.
    function createPlaneGroup(cards, mirror) {
      let activePlane = null;
      let lastCard = null;
      let navigating = false;             // guards against overlapping prev/next hops
      // the (unique) planes this group owns — scopes button wiring per group
      const planes = [...new Set(cards
        .map((c) => document.getElementById("plane-" + c.dataset.project))
        .filter(Boolean))];

      // Show a plane (no active-plane guard): slide it in, (re)start its
      // animation, reset + reveal its blocks, re-type the title, track it
      // active. Reused by openPlane + navigateTo.
      function showPlane(plane, card) {
        lastCard = card || document.activeElement;
        activePlane = plane;

        document.body.classList.add("is-planed");
        if (mirror) document.body.classList.add("is-planed--mirror");
        plane.hidden = false;
        plane.setAttribute("aria-hidden", "false");
        void plane.offsetWidth; // reflow so the slide runs from the parked transform
        plane.classList.add("is-open");
        plane.scrollTop = 0;

        const ctrl = ensureAnim(plane);
        if (ctrl) {
          ctrl.start();
          if (reduceMotion) requestAnimationFrame(() => ctrl.stop()); // one static frame
        }

        resetReveals(plane);
        revealBlocks(plane);
        // data-story planes carry SVG charts (side-projects/ds-charts.js) instead of
        // an ASCII anim. Their entrance observer is one-shot, so re-run it on every
        // show: cancel any pending one now (before the slide), then replay once the
        // plane has settled so the in-view hero animates from the start again. No-op
        // on planes without charts / when the toolkit isn't loaded.
        if (window.DSCharts) {
          DSCharts.reset(plane);
          setTimeout(() => DSCharts.replay(plane), reduceMotion ? 0 : 520);
        }
        setTimeout(() => typeTitle(plane), reduceMotion ? 0 : 420);

        const back = $(".plane__back", plane);
        if (back) back.focus();
      }

      // fromRoute = opened by the router (deep link / back-forward), not a click:
      // in that case the target history entry already exists, so replace it in
      // place rather than pushing a duplicate.
      function openPlane(projId, card, fromRoute) {
        const plane = document.getElementById("plane-" + projId);
        if (!plane || activePlane) return;
        showPlane(plane, card);
        // register a history entry so the back button/gesture closes the plane
        // and mirror the plane into the URL as a clean /slug (navigateTo hops
        // reuse showPlane, not openPlane, so they stay under this single entry —
        // back returns to the page from anywhere in the session)
        closeActivePlane = () => closePlane(true);     // true = came from popstate
        openSlug = slugOf(projId);
        setUrl(openSlug, !!fromRoute);                 // push on click, replace on route
      }

      function closePlane(fromPopstate) {
        if (!activePlane) return;
        const plane = activePlane;
        activePlane = null;
        openSlug = null;                 // URL no longer points at an open plane

        plane.classList.remove("is-open");
        plane.setAttribute("aria-hidden", "true");
        document.body.classList.remove("is-planed", "is-planed--mirror");
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

        // drop our back-button hook; if we're closing via the on-screen Back /
        // Escape (not a popstate), pop the history entry openPlane pushed so it
        // doesn't leak (the resulting popstate is a no-op — closeActivePlane is
        // already null). On a device-back close the browser already popped it.
        closeActivePlane = null;
        if (!fromPopstate && history.state && history.state.peachyPlane) history.back();

        if (lastCard && lastCard.focus) lastCard.focus();
      }

      function focusNav(plane, dir) {
        const btn = $('.plane__nav-btn[data-dir="' + (dir > 0 ? "next" : "prev") + '"]', plane);
        if (btn) btn.focus();
      }

      // retire the plane a hop just left: hide it and stop its animation
      function retire(plane) {
        plane.classList.remove("is-open", "plane--incoming", "plane--from-left", "plane--from-right");
        plane.hidden = true;
        plane.setAttribute("aria-hidden", "true");
        if (anims[plane.id]) anims[plane.id].stop();
      }

      // Hop to the previous/next project (dir = -1 / +1), looping at the ends.
      // The incoming plane slides in ON TOP of the stationary current one (both are
      // opaque), so the dimmed main page is never revealed — a seamless plane-to-plane
      // hop. body.is-planed stays on throughout. "next" enters from the group's
      // resting side, "prev" from the opposite side (mirrored for the mirror group).
      // Every card maps to its own plane, so a hop always slides a distinct plane in.
      function navigateTo(dir) {
        if (!activePlane || navigating) return;
        const i = cards.indexOf(lastCard);
        if (i === -1) return;
        const targetCard = cards[(i + dir + cards.length) % cards.length];
        const targetPlane = document.getElementById("plane-" + targetCard.dataset.project);
        if (!targetPlane || targetPlane === activePlane) return;
        const current = activePlane;
        navigating = true;

        targetPlane.classList.add("plane--incoming");            // above the outgoing plane
        // "prev" enters from the side opposite the group's resting edge
        if (dir < 0) targetPlane.classList.add(mirror ? "plane--from-right" : "plane--from-left");
        showPlane(targetPlane, targetCard);                      // slides in over the current one
        // mirror the hop into the URL; replace (not push) so prev/next stays
        // under the single history entry openPlane created — back still = home
        openSlug = slugOf(targetCard.dataset.project);
        setUrl(openSlug, true);
        focusNav(targetPlane, dir);
        setTimeout(() => {
          retire(current);                                       // hide the now-covered old plane
          targetPlane.classList.remove("plane--incoming", "plane--from-left", "plane--from-right");
          navigating = false;
        }, reduceMotion ? 0 : 500);
      }

      cards.forEach((card) => {
        const id = card.dataset.project;
        // expose this plane to the URL router under its clean slug
        openBySlug[slugOf(id)] = (fromRoute) => openPlane(id, card, fromRoute);
        card.addEventListener("click", (e) => { e.preventDefault(); openPlane(id, card); });
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlane(id, card); }
        });
      });

      // scope button wiring to this group's own planes
      planes.forEach((plane) => {
        $$(".plane__nav-btn", plane).forEach((b) =>
          b.addEventListener("click", () => navigateTo(b.dataset.dir === "next" ? 1 : -1))
        );
        // wrap so the click Event isn't passed as closePlane's fromPopstate arg
        $$(".plane__back", plane).forEach((b) => b.addEventListener("click", () => closePlane()));
      });

      document.addEventListener("keydown", (e) => {
        if (!activePlane) return;
        if (e.key === "Escape") closePlane();
        else if (e.key === "ArrowRight") { e.preventDefault(); navigateTo(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); navigateTo(-1); }
      });

      // refit the ASCII font if the window resizes while a plane is open
      window.addEventListener("resize", () => {
        if (!activePlane) return;
        const pre = $("[data-anim-target]", activePlane);
        const spec = ASCII.byId(activePlane.dataset.anim);
        if (pre && spec) fontFor(pre, spec.cols, spec.rows);
      }, { passive: true });
    }

    createPlaneGroup($$(".card--link"), false);        // Work — slides in from the right
    createPlaneGroup($$(".post__link--plane"), true);  // Personal works — mirrored, slides in from the left

    // Deep-link entry: if we loaded on a /slug (a shared link, restored pre-paint
    // in index.html), open that plane. First pin a clean base entry behind it so
    // the back button/gesture returns to the homepage rather than leaving the
    // site. Unknown slugs just fall back to home. openBySlug is populated by the
    // two groups above (module scope).
    (function routeOnLoad() {
      const slug = currentSlug();
      // Only act on a slug we actually own. This leaves the URL untouched for the
      // homepage, unknown slugs, and the github.io project-page mirror (whose
      // first path segment is "noteliasweb", not a plane) — so we never rewrite
      // that mirror's base path.
      if (!slug || !openBySlug[slug]) return;
      history.replaceState({}, "", "/");               // base entry behind the plane
      openBySlug[slug](false);                          // push /slug on top → back = home
    })();
  }
})();
