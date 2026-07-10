/* =========================================================================
   Peachy portfolio — interaction & animation layer (vanilla, no deps)
   Sections:
     1. Reveal-on-scroll (IntersectionObserver)
     2. Amber "target" highlight flash on the same trigger
     3. Stat count-up
     4. Seamless marquee (duplicate track for -50% loop)
     5. Terminal typing effect
     6. Nav: scrolled state + mobile drawer
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
  // Script: array of [className, text]. \n creates newlines. `null` class = plain.
  const SCRIPT = [
    ["tok-comment", "# peachy :: exploratory analysis\n"],
    ["tok-prompt", ">>> "],
    ["tok-kw", "import "], [null, "polars "], ["tok-kw", "as "], [null, "pl\n"],
    ["tok-prompt", ">>> "],
    [null, "df = pl.read_parquet("], ["tok-str", '"signals.parquet"'], [null, ")\n"],
    ["tok-prompt", ">>> "],
    [null, "df.filter(pl.col("], ["tok-str", '"churn_risk"'], [null, ") > "], ["tok-num", "0.8"], [null, ").shape\n"],
    ["tok-out", "(12_408, 37)\n"],
    ["tok-prompt", ">>> "],
    ["tok-kw", "from "], [null, "peachy "], ["tok-kw", "import "], [null, "explain\n"],
    ["tok-prompt", ">>> "],
    [null, "explain(model, top="], ["tok-num", "3"], [null, ")\n"],
    ["tok-out", "1. tenure_days        +0.41\n"],
    ["tok-out", "2. support_tickets    +0.27\n"],
    ["tok-out", "3. last_login_gap     +0.19\n"],
    ["tok-prompt", ">>> "],
    ["tok-comment", "# the story is in the residuals ✦\n"],
    ["tok-prompt", ">>> "],
  ];

  if (typedEl && cursorEl) {
    if (reduceMotion) {
      // render fully, no animation
      SCRIPT.forEach(([cls, text]) => appendChunk(typedEl, cls, text));
    } else {
      typeScript(typedEl, SCRIPT);
    }
  }

  function appendChunk(parent, cls, text) {
    const span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text;
    parent.appendChild(span);
    return span;
  }

  function typeScript(parent, script) {
    let seg = 0;
    function nextSegment() {
      if (seg >= script.length) return; // done — cursor keeps blinking
      const [cls, text] = script[seg];
      const span = appendChunk(parent, cls, "");
      let i = 0;
      // instant for output lines (feels like program response), typed for input
      const isOutput = cls === "tok-out" || cls === "tok-comment";
      const speed = isOutput ? 6 : 20 + Math.random() * 30;
      function typeChar() {
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
    // small delay so it starts after paint
    setTimeout(nextSegment, 600);
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
  }

  /* ---------------------------------------------- 7. footer year */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
