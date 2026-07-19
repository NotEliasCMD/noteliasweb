/* =============================================================================
 * text-game.js — a tiny, reusable text-adventure engine + UI (window.TextGame)
 * -----------------------------------------------------------------------------
 * This is the GAME-AGNOSTIC layer. It owns:
 *   • a full-screen "plane" view (header + terminal + footer, nothing else) that
 *     reuses the site's existing .plane slide-in machinery purely via CSS class
 *     (see styles.css "PROJECT PLANES"); we do NOT go through createPlaneGroup
 *     in script.js because that binds Arrow keys / couples to card triggers.
 *   • the in-terminal I/O: typed output (honouring reduced-motion) + a prompt
 *     that reads a line of player input (mirrors the hero terminal's dual input
 *     path — an off-screen field for the mobile soft keyboard, plus a
 *     document-level keydown fallback for desktop).
 *   • a scene-graph game loop driven entirely by data.
 *   • open/close + a shareable /play deep-link.
 *
 * A GAME is pure data, registered with TextGame.register({...}); see
 * games/data/datatrail.js for the shape and games/README or dev/COMPONENTS.md
 * for the full contract. Add a new game = add a new data module. The UI never
 * changes.
 *
 * Dependency-free, no build step. Classic IIFE, attaches window.TextGame.
 * MUST load before script.js (so the play command can call it, and so the site's
 * theme-toggle binding in script.js picks up the toggle we build here).
 * ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Clean, shareable URLs only off the github.io project-page host — same gate
  // script.js uses for its plane deep-links.
  var CLEAN_URLS = !location.hostname.endsWith("github.io");

  var registry = {};          // id -> game definition
  var els = null;             // cached DOM refs once built
  var built = false;

  // ---- runtime state for the active session --------------------------------
  var current = null;         // active game definition
  var state = null;           // active game's mutable state object
  var open = false;           // is the plane on screen
  var typing = false;         // output is mid-type (input suppressed)
  var typeToken = 0;          // bump to cancel an in-flight type chain
  var inputActive = false;    // a prompt is waiting for a line
  var lineHandler = null;     // callback fed the submitted line
  var lastFocus = null;       // element to restore focus to on close
  var pushedUrl = false;      // did we push a /play history entry

  /* ------------------------------------------------------------------ build */
  // The brand mark (logo + wordmark) reused from the site nav, so the game view
  // header reads as part of the same site.
  var BRAND =
    '<span class="nav__logo" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" fill="none" focusable="false">' +
    '<path d="M2 19 C 7.5 19, 8 6, 12 6 C 16 6, 16.5 19, 22 19 Z" fill="var(--peach)" opacity="0.20"/>' +
    '<path d="M2 19 C 7.5 19, 8 6, 12 6 C 16 6, 16.5 19, 22 19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '<line x1="2" y1="19" x2="22" y2="19" stroke="currentColor" stroke-width="1" opacity="0.35"/>' +
    '<circle cx="12" cy="6" r="1.8" fill="var(--peach-deep)"/>' +
    '</svg></span>' +
    '<span class="nav__name"><span class="nav__axis" aria-hidden="true"></span>' +
    '<span class="nav__word nav__word--elias">Elias<span class="nav__dot">.</span></span>' +
    '<span class="nav__word nav__word--saile" aria-hidden="true">sailE<span class="nav__dot">.</span></span></span>';

  // Build the plane shell ONCE, eagerly at load, and append to #planes. Eager
  // (not lazy) so that: (a) the .theme-toggle below is present when script.js
  // wires up all theme toggles, and (b) the game terminal ids exist in the DOM.
  // The hero terminal wiring in script.js keys off the FIRST .terminal / #typed,
  // so a second (game) terminal added here never disturbs it.
  function build() {
    if (built) return;
    var planes = document.getElementById("planes");
    if (!planes) return;            // no host container — bail silently

    var plane = document.createElement("article");
    plane.className = "plane plane--game";
    plane.id = "plane-game";
    plane.setAttribute("aria-hidden", "true");
    plane.setAttribute("aria-labelledby", "game-title");
    plane.hidden = true;
    plane.innerHTML =
      '<header class="plane__bar game__bar">' +
        '<div class="container plane__bar-inner">' +
          '<span class="nav__brand game__brand">' + BRAND + '</span>' +
          '<div class="plane__bar-nav">' +
            '<button class="game__exit btn btn--ghost" type="button">← Exit game</button>' +
            '<span class="plane__crumb game__crumb">arcade</span>' +
            '<button class="theme-toggle" type="button" aria-label="Toggle dark mode" aria-pressed="false">' +
              '<span class="theme-toggle__sun" aria-hidden="true">☀</span>' +
              '<span class="theme-toggle__moon" aria-hidden="true">☾</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</header>' +
      '<div class="game__stage">' +
        '<div class="terminal terminal--game">' +
          '<div class="terminal__bar">' +
            '<span class="terminal__dot"></span><span class="terminal__dot"></span><span class="terminal__dot"></span>' +
            '<span class="terminal__file" id="gameFile">elias@analysis — game</span>' +
          '</div>' +
          '<pre class="terminal__body" id="gameBody"><code id="gameTyped"></code>' +
            '<span id="gameInput" class="tok-cmd"></span>' +
            '<span class="cursor" id="gameCursor">▍</span></pre>' +
          '<input id="gameKbd" class="terminal__kbd" type="text" tabindex="-1" ' +
            'autocomplete="off" autocapitalize="off" autocorrect="off" ' +
            'spellcheck="false" inputmode="text" enterkeyhint="go" maxlength="60">' +
        '</div>' +
      '</div>' +
      '<footer class="footer game__footer">' +
        '<div class="container footer__base">' +
          '<span>© <span id="gameYear">2026</span> Saile — the arcade.</span>' +
          '<span class="footer__note">type <b>exit</b> or press Esc to leave</span>' +
        '</div>' +
      '</footer>';

    planes.appendChild(plane);

    els = {
      plane: plane,
      body: plane.querySelector("#gameBody"),
      typed: plane.querySelector("#gameTyped"),
      input: plane.querySelector("#gameInput"),
      cursor: plane.querySelector("#gameCursor"),
      kbd: plane.querySelector("#gameKbd"),
      file: plane.querySelector("#gameFile"),
      terminal: plane.querySelector(".terminal--game"),
      exit: plane.querySelector(".game__exit"),
      year: plane.querySelector("#gameYear")
    };
    try { els.year.textContent = new Date().getFullYear(); } catch (e) {}

    wireInput();
    els.exit.addEventListener("click", function () { close(false); });
    window.addEventListener("popstate", onPopState);
    built = true;
  }

  /* ------------------------------------------------------------------ input */
  function wireInput() {
    // Tap/click the terminal to raise the mobile keyboard and start typing.
    els.terminal.addEventListener("click", function () {
      if (inputActive) { try { els.kbd.focus({ preventScroll: true }); } catch (e) { els.kbd.focus(); } }
    });

    // Primary path: keystrokes land in the off-screen field; mirror its value
    // into the visible prompt. Enter submits, Escape leaves the game.
    els.kbd.addEventListener("input", function () {
      if (!inputActive) return;
      var v = els.kbd.value.replace(/\n/g, "");
      if (v.length > 60) { v = v.slice(0, 60); els.kbd.value = v; }
      els.input.textContent = v;
      scrollToEnd();
    });
    // The focused field is the PRIMARY key path: it owns Enter (skip if mid-type,
    // else submit), Space (skip if mid-type), and Escape. It must fully handle
    // these so the document fallback below can safely ignore kbd-sourced events —
    // otherwise a single submitting Enter would bubble up and immediately skip the
    // NEXT scene that submit() just started typing (making post-answer text appear
    // at once instead of typing out).
    els.kbd.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(false); return; }
      if ((e.key === "Enter" || e.key === " ") && typing) { e.preventDefault(); finishTyping(); return; }
      if (e.key === "Enter") { e.preventDefault(); submit(); els.kbd.value = ""; return; }
    });

    // Fallback for when the off-screen field can't hold focus (desktop with focus
    // blocked): capture typing at the document level. Bails on events sourced from
    // our own kbd (the handler above owns those) and while any real input is
    // focused, so keystrokes are never double-handled. The hero terminal's own
    // fallback bails whenever its inputActive is false (which it is while the game
    // is open), so the two never collide either.
    document.addEventListener("keydown", function (e) {
      if (!open) return;
      if (e.target === els.kbd) return;   // primary handler above already dealt with it
      if (e.key === "Escape") { e.preventDefault(); close(false); return; }
      if (typing) {
        // let the player skip the typing animation with Enter/Space
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); finishTyping(); }
        return;
      }
      if (!inputActive) return;
      var ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); submit(); return; }
      if (e.key === "Backspace") {
        e.preventDefault();
        els.input.textContent = els.input.textContent.slice(0, -1);
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        if (els.input.textContent.length >= 60) return;
        els.input.textContent += e.key;
        scrollToEnd();
      }
    });
  }

  function submit() {
    if (!inputActive || typing) return;
    var raw = els.input.textContent;
    var line = raw.trim();
    appendChunk(els.typed, "tok-cmd", (raw || "") + "\n");   // echo
    els.input.textContent = "";
    inputActive = false;
    var fn = lineHandler; lineHandler = null;
    // `exit`/`quit` leaves the game from any prompt (matches the footer hint).
    if (/^(exit|quit|q)$/i.test(line)) { close(false); return; }
    if (fn) fn(line);
  }

  /* --------------------------------------------------------------- printing */
  function appendChunk(parent, cls, text) {
    var span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text;
    parent.appendChild(span);
    return span;
  }

  function scrollToEnd() { els.body.scrollTop = els.body.scrollHeight; }

  function clearScreen() { els.typed.textContent = ""; els.input.textContent = ""; scrollToEnd(); }

  // Normalise a "block" into an array of [class, text, instant?] chunks.
  // Accepts a string, an array of strings/[cls,text(,instant)] items, or a
  // function(state). A truthy 3rd element renders that chunk instantly (no
  // char-by-char typing) — handy for status readouts / bulk output amid prose.
  function toChunks(block) {
    if (typeof block === "function") block = block(state);
    if (block == null) return [];
    if (typeof block === "string") return [[null, block + "\n"]];
    var out = [];
    for (var i = 0; i < block.length; i++) {
      var item = block[i];
      if (typeof item === "string") out.push([null, item + "\n"]);
      else out.push([item[0], item[1], item[2]]);   // already [cls, text(, instant)]
    }
    return out;
  }

  var pendingChunks = null;   // remaining chunks when finishTyping fast-forwards

  // Gameplay cadence: every line is written out character-by-character, then a
  // beat at each line break, so scenes read like the hero terminal typing itself
  // out line by line. Tunable here.
  var CHAR_MS = 14;     // per-character delay (+ a little jitter)
  var LINE_MS = 90;     // extra pause after a line completes (ends in "\n")
  var GAP_MS = 16;      // pause between chunks that share a line

  // Type a set of chunks, then run done(). Instant under reduced motion.
  // opts.fast → paint quickly (used for the decorative intro banner, which is
  // art rather than prose so it shouldn't drag).
  function typeOut(chunks, done, opts) {
    opts = opts || {};
    var fast = !!opts.fast;
    if (!chunks.length) { if (done) done(); return; }
    if (reduceMotion) {
      chunks.forEach(function (c) { appendChunk(els.typed, c[0], c[1]); });
      scrollToEnd();
      if (done) done();
      return;
    }
    typing = true;
    var token = ++typeToken;
    // Progress is tracked on the shared `st` object so finishTyping() can pick up
    // exactly where the animation is and complete IN PLACE — without wiping the
    // already-rendered content above (prior lines and earlier scenes).
    var st = { chunks: chunks, done: done, seg: 0, i: 0, span: null };
    pendingChunks = st;

    function step() {
      if (token !== typeToken) return;             // cancelled
      if (st.seg >= chunks.length) { typing = false; pendingChunks = null; if (done) done(); return; }
      var cls = chunks[st.seg][0], text = chunks[st.seg][1], instant = chunks[st.seg][2];
      if (st.span === null) st.span = appendChunk(els.typed, cls, "");
      if (instant) {                               // render this chunk at once
        st.span.textContent = text; scrollToEnd();
        st.seg++; st.i = 0; st.span = null;
        setTimeout(step, fast ? 12 : GAP_MS);
        return;
      }
      if (st.i < text.length) {
        st.span.textContent += text[st.i++];
        scrollToEnd();
        setTimeout(step, fast ? 4 : CHAR_MS + Math.random() * 10);
      } else {
        // chunk done — longer beat when it ended a line (line-by-line rhythm)
        var endedLine = text.charAt(text.length - 1) === "\n";
        st.seg++; st.i = 0; st.span = null;
        setTimeout(step, fast ? 22 : (endedLine ? LINE_MS : GAP_MS));
      }
    }
    step();
  }

  // Skip the animation: finish the current type chain instantly, in place. Fills
  // the in-progress chunk, appends any remaining chunks, and leaves everything
  // already on screen untouched (so the scrolling transcript is preserved).
  function finishTyping() {
    if (!typing || !pendingChunks) return;
    var st = pendingChunks;
    typeToken++;                                   // stop the running chain
    if (st.span !== null && st.seg < st.chunks.length) {
      st.span.textContent = st.chunks[st.seg][1];  // complete the partial chunk
      st.seg++;
    }
    for (var k = st.seg; k < st.chunks.length; k++) {
      appendChunk(els.typed, st.chunks[k][0], st.chunks[k][1]);
    }
    typing = false; pendingChunks = null; scrollToEnd();
    if (st.done) st.done();
  }

  // Print typed output then show the "> " prompt and read one line.
  function ask(block, onLine, opts) {
    typeOut(toChunks(block), function () {
      appendChunk(els.typed, "tok-prompt", "> ");
      scrollToEnd();
      inputActive = true;
      lineHandler = onLine;
      try { els.kbd.focus({ preventScroll: true }); } catch (e) {}
    }, opts);
  }

  /* ---------------------------------------------------------- the game loop */
  // A scene is data:
  //   { text, choices?, goto?, onEnter?, end? }
  //   text    : string | string[] | [cls,text][] | (state) => any of those
  //   choices : [{ match:[..], label, goto, effect? }] OR (state) => that array
  //             (a function lets a scene show state-dependent options — e.g. a
  //              life-sim hub whose menu changes with the player's situation)
  //   goto    : id | (state)=>id   (no choices → "press Enter to continue")
  //   onEnter : (state) => void    (run before text is printed)
  //   end     : true               (terminal scene → offer replay/exit)
  function enterScene(id) {
    var scene = current.scenes[id];
    if (!scene) { appendChunk(els.typed, "tok-comment", "\n[scene missing: " + id + "]\n"); return; }
    if (scene.onEnter) scene.onEnter(state);

    // Status/HUD line (optional, supplied by the game) reprinted each scene.
    var head = [];
    if (current.status) {
      var s = current.status(state);
      if (s) head.push(["tok-comment", s + "\n", true]);   // HUD renders instantly
    }
    var bodyChunks = head.concat(toChunks(scene.text));

    if (scene.end) {
      typeOut(bodyChunks, function () {
        appendChunk(els.typed, "tok-out", "\n");
        ask([["tok-out", "play again? ("], ["tok-kw", "y"], ["tok-out", "/"],
             ["tok-kw", "n"], ["tok-out", ")\n"]], function (line) {
          var v = line.toLowerCase();
          if (v === "y" || v === "yes" || v === "again" || v === "restart") startGame();
          else close(false);
        });
      });
      return;
    }

    // Resolve choices once (a function is called with state) so the displayed
    // menu and the number-matching use the exact same list.
    var choices = typeof scene.choices === "function" ? scene.choices(state) : scene.choices;
    if (choices && choices.length) {
      var menu = bodyChunks.concat(renderChoices(choices));
      askChoice(menu, choices);
      return;
    }

    // No choices: a narrative beat. Print, then wait for Enter to continue.
    var next = scene.goto;
    typeOut(bodyChunks, function () {
      appendChunk(els.typed, "tok-comment", "\n[ press ENTER to continue ]\n");
      scrollToEnd();
      inputActive = true;
      lineHandler = function () { go(next); };
      try { els.kbd.focus({ preventScroll: true }); } catch (e) {}
    });
  }

  function renderChoices(choices) {
    var out = [["tok-out", "\n"]];
    for (var i = 0; i < choices.length; i++) {
      out.push(["tok-num", "  " + (i + 1) + ") "]);
      out.push(["tok-out", choices[i].label + "\n"]);
    }
    return out;
  }

  function askChoice(menu, choices) {
    ask(menu, function (line) {
      var pick = matchChoice(line, choices);
      if (!pick) {
        appendChunk(els.typed, "tok-comment", "  (type a number, or a keyword)\n");
        askChoice([], choices);          // re-prompt without reprinting the menu
        return;
      }
      if (pick.effect) pick.effect(state);
      go(pick.goto);
    });
  }

  // Match a line to a choice: by 1-based number, or by any of its `match` tokens
  // appearing in the input.
  function matchChoice(line, choices) {
    var v = line.toLowerCase().trim();
    var n = parseInt(v, 10);
    if (!isNaN(n) && n >= 1 && n <= choices.length && String(n) === v) return choices[n - 1];
    for (var i = 0; i < choices.length; i++) {
      var m = choices[i].match || [];
      for (var j = 0; j < m.length; j++) {
        if (v === m[j] || (m[j] && v.indexOf(m[j]) !== -1)) return choices[i];
      }
    }
    return null;
  }

  // Resolve a goto (string or function) and advance.
  function go(goto) {
    var id = typeof goto === "function" ? goto(state) : goto;
    enterScene(id);
  }

  /* --------------------------------------------------------------- intro/run */
  function renderIntro() {
    clearScreen();
    var intro = current.intro || {};
    var chunks = [];
    // ASCII banner (array of lines) in the brand accent.
    (intro.banner || []).forEach(function (row) { chunks.push(["tok-prompt", row + "\n"]); });
    if (intro.tagline) chunks.push(["tok-out", "\n" + intro.tagline + "\n"]);
    if (intro.blurb) chunks.push(["tok-comment", intro.blurb + "\n"]);
    chunks.push(["tok-out", "\n"]);
    chunks.push(["tok-kw", intro.start || "press ENTER to begin"]);
    chunks.push(["tok-out", "\n"]);
    // The intro is decorative art + a one-line prompt → paint it quickly; the
    // deliberate line-by-line typing is reserved for gameplay.
    ask(chunks, function () { go(current.start); }, { fast: true });
  }

  function startGame() {
    typeToken++;
    typing = false; inputActive = false; lineHandler = null; pendingChunks = null;
    state = current.init ? current.init() : {};
    clearScreen();
    renderIntro();
  }

  /* ------------------------------------------------------------ open / close */
  function showPlane() {
    document.body.classList.add("is-planed");
    els.plane.hidden = false;
    els.plane.setAttribute("aria-hidden", "false");
    void els.plane.offsetWidth;                    // reflow so the transform animates
    els.plane.classList.add("is-open");
    els.body.scrollTop = 0;
  }

  function openGame(id, fromRoute) {
    build();
    if (!built) return;
    var def = registry[id];
    if (!def) { console.warn("TextGame: no game registered as", id); return; }
    if (open) return;
    current = def;
    open = true;
    lastFocus = document.activeElement;
    if (els.file && def.fileLabel) els.file.textContent = def.fileLabel;
    showPlane();
    // reflect in the URL (unless we got here BY routing)
    if (CLEAN_URLS && !fromRoute) {
      try { history.pushState({ peachyGame: true }, "", "/play"); pushedUrl = true; } catch (e) {}
    }
    setTimeout(function () { try { els.exit.focus(); } catch (e) {} }, 60);
    startGame();
  }

  function close(fromPopstate) {
    if (!open) return;
    open = false;
    typeToken++;
    typing = false; inputActive = false; lineHandler = null;
    els.plane.classList.remove("is-open");
    els.plane.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-planed");
    try { els.kbd.blur(); } catch (e) {}

    var hide = function () { els.plane.hidden = true; };
    if (reduceMotion) hide();
    else els.plane.addEventListener("transitionend", function te() {
      els.plane.removeEventListener("transitionend", te); hide();
    });

    // unwind the /play history entry we pushed (unless the pop IS the close)
    if (!fromPopstate && pushedUrl && history.state && history.state.peachyGame) {
      pushedUrl = false; history.back();
    } else { pushedUrl = false; }

    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function onPopState(e) {
    // Back/forward: if we're showing /play-state and it's gone, close; if the
    // URL came back to /play and we're closed, reopen.
    var isGameState = e.state && e.state.peachyGame;
    if (open && !isGameState) close(true);
    else if (!open && CLEAN_URLS && firstSeg() === "play") openGame(defaultId(), true);
  }

  function firstSeg() { return location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0]; }
  function defaultId() {
    // /play opens the game explicitly registered as the default, else the first.
    var keys = Object.keys(registry);
    for (var i = 0; i < keys.length; i++) if (registry[keys[i]].defaultForPlay) return keys[i];
    return keys[0];
  }

  // On cold load, open the game if the path is /play (deep-link). The generic
  // sessionStorage shim in index.html + 404.html has already restored the path.
  function routeOnLoad() {
    if (!CLEAN_URLS) return;
    if (firstSeg() !== "play") return;
    var id = defaultId();
    if (!id) return;
    try { history.replaceState({}, "", "/"); } catch (e) {}   // base entry behind it
    openGame(id, false);                                      // pushes /play on top
  }

  /* ------------------------------------------------------------------ public */
  window.TextGame = {
    register: function (def) {
      if (!def || !def.id) throw new Error("TextGame.register: def.id required");
      registry[def.id] = def;
      return def;
    },
    open: function (id) { openGame(id || defaultId(), false); },
    close: function () { close(false); },
    isOpen: function () { return open; }
  };

  // Build the shell NOW (synchronously). This MUST happen before script.js runs
  // its `$$(".theme-toggle")` binding so the in-game toggle gets wired. Because
  // this file is loaded after #planes in the HTML, the container already exists
  // during parse. (Fallback to DOMContentLoaded only if #planes isn't there yet.)
  if (document.getElementById("planes")) build();
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();

  // The /play deep-link must wait until the game data modules (loaded AFTER this
  // file) have registered — so route on DOMContentLoaded, not during parse.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", routeOnLoad);
  else routeOnLoad();
})();
