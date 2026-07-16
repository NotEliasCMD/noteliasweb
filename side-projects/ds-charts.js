/* =========================================================================
   ds-charts.js — dependency-free animated SVG charts for the six data-story
   planes. No framework, no libraries. One <script> tag.

   Contract (markup):
     <figure class="ds-figure" data-ds-chart
             data-project="pl_moneyball"   <- key into window.DS_SIDE
             data-chart="scatter"          <- renderer name
             data-figure="scatter"         <- data slice on the project object
             data-x="..." data-y="..."     <- axis labels (optional)
             data-mode="diagonal">         <- renderer-specific (optional)
       <h3 class="ds-figure__title">...</h3>
       <p  class="ds-figure__subtitle">...</p>
       <div class="ds-chart"></div>        <- SVG injected here
       <p  class="ds-figure__caption">...</p>
     </figure>

   Behaviour: renders the final-state SVG immediately, then plays an entrance
   animation the first time the figure scrolls into view (IntersectionObserver,
   one-shot). Hero charts (race/draw/morph/reveal) play once and hold, with a
   hover "Replay" control. Honours prefers-reduced-motion by jumping to the
   final frame. Colours come from CSS custom properties, so charts flip with
   the host's dark theme for free.
   ========================================================================= */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var REDUCE = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------- dom helpers */
  function E(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (kids) kids.forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function H(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function T(x, y, str, cls, extra) {
    var a = { x: x, y: y, class: cls };
    if (extra) for (var k in extra) a[k] = extra[k];
    var t = E("text", a); t.textContent = str; return t;
  }
  function cat(i) { return "var(--ds-cat-" + (((i % 8) + 8) % 8) + ")"; }

  /* resolve CSS custom properties → rgb, for cases that need real luminance
     (heatmap cell fills + contrast-correct value labels, per active theme) */
  function cvar(n) {
    return (getComputedStyle(document.documentElement).getPropertyValue(n) || "").trim() || "#888888";
  }
  function hexRGB(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mixRGB(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }); }
  function rgbCss(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
  function textOn(c) { return lum(c) > 0.6 ? "#17150f" : "#ffffff"; }
  function seqStops() { return [0, 1, 2, 3, 4, 5, 6].map(function (i) { return hexRGB(cvar("--ds-seq-" + i)); }); }
  function rampAt(stops, t) {
    t = Math.max(0, Math.min(1, t));
    var f = t * (stops.length - 1), i = Math.floor(f);
    return i >= stops.length - 1 ? stops[stops.length - 1] : mixRGB(stops[i], stops[i + 1], f - i);
  }

  /* ----------------------------------------------------------- scales */
  function linScale(d0, d1, r0, r1) {
    var m = (r1 - r0) / (d1 - d0 || 1);
    return function (v) { return r0 + (v - d0) * m; };
  }
  function logScale(d0, d1, r0, r1) {
    var l0 = Math.log10(d0), l1 = Math.log10(d1), m = (r1 - r0) / (l1 - l0 || 1);
    return function (v) { return r0 + (Math.log10(v) - l0) * m; };
  }
  function niceTicks(min, max, n) {
    n = n || 5;
    var span = max - min || 1, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = (n * step) / span;
    if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5;
    else if (err <= 0.75) step *= 2;
    var t = [], s = Math.ceil(min / step) * step;
    for (; s <= max + 1e-9; s += step) t.push(Math.round(s / step) * step);
    return t;
  }
  function logTicks(min, max) {
    var t = [], p = Math.floor(Math.log10(min));
    for (; p <= Math.ceil(Math.log10(max)); p++) t.push(Math.pow(10, p));
    return t.filter(function (v) { return v >= min * 0.5 && v <= max * 2; });
  }
  function fmtSI(v) {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(v % 1000 ? 1 : 0) + "k";
    if (Math.abs(v) >= 1 || v === 0) return "" + Math.round(v * 100) / 100;
    return v.toFixed(2);
  }

  /* ----------------------------------------------------------- plot frame */
  // Returns a helper that owns an <svg>, plot rect, and axis drawing.
  function Frame(w, h, m) {
    m = m || {};
    var ml = m.l == null ? 52 : m.l, mr = m.r == null ? 18 : m.r,
        mt = m.t == null ? 12 : m.t, mb = m.b == null ? 40 : m.b;
    var svg = E("svg", { viewBox: "0 0 " + w + " " + h, role: "img",
                         preserveAspectRatio: "xMidYMid meet" });
    var g = E("g");
    svg.appendChild(g);
    var self = {
      svg: svg, g: g, w: w, h: h,
      x0: ml, y0: h - mb, pw: w - ml - mr, ph: h - mt - mb,
      x1: w - mr, yTop: mt,
      add: function (node) { g.appendChild(node); return node; },
      title: function (str, desc) {
        svg.insertBefore(E("title", {}, [document.createTextNode(str)]), svg.firstChild);
        if (desc) svg.appendChild(E("desc", {}, [document.createTextNode(desc)]));
      }
    };
    return self;
  }
  function gridX(fr, sc, ticks, fmt, label) {
    ticks.forEach(function (t) {
      var x = sc(t);
      fr.add(E("line", { x1: x, y1: fr.yTop, x2: x, y2: fr.y0, class: "ds-grid-line" }));
      fr.add(T(x, fr.y0 + 16, (fmt || fmtSI)(t), "ds-tick", { "text-anchor": "middle" }));
    });
    if (label) fr.add(T(fr.x0 + fr.pw / 2, fr.h - 3, label, "ds-axis-label",
                        { "text-anchor": "middle" }));
  }
  function gridY(fr, sc, ticks, fmt, label) {
    ticks.forEach(function (t) {
      var y = sc(t);
      fr.add(E("line", { x1: fr.x0, y1: y, x2: fr.x1, y2: y, class: "ds-grid-line" }));
      fr.add(T(fr.x0 - 8, y + 4, (fmt || fmtSI)(t), "ds-tick", { "text-anchor": "end" }));
    });
    if (label) fr.add(T(0, 0, label, "ds-axis-label",
      { "text-anchor": "middle", transform: "translate(13," + (fr.yTop + fr.ph / 2) + ") rotate(-90)" }));
  }

  /* ----------------------------------------------------------- animation */
  function drawStroke(path, dur, delay) {
    if (REDUCE) return;
    var len = path.getTotalLength ? path.getTotalLength() : 0;
    if (!len) return;
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: dur || 900, delay: delay || 0, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "both" });
  }
  function fadeScale(node, dur, delay, ox, oy) {
    if (REDUCE) return;
    node.animate([
      { opacity: 0, transform: "translate(" + (ox || 0) + "px," + (oy || 6) + "px) scale(0.6)" },
      { opacity: 1, transform: "none" }
    ], { duration: dur || 500, delay: delay || 0, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "both" });
  }
  function grow(node, originY, dur, delay) {
    if (REDUCE) return;
    node.style.transformBox = "fill-box";
    node.style.transformOrigin = originY;
    node.animate([{ transform: "scale(1,0)" }, { transform: "scale(1,1)" }],
      { duration: dur || 650, delay: delay || 0, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "both" });
  }
  function growX(node, dur, delay) {
    if (REDUCE) return;
    node.style.transformBox = "fill-box";
    node.style.transformOrigin = "left center";
    node.animate([{ transform: "scale(0,1)" }, { transform: "scale(1,1)" }],
      { duration: dur || 650, delay: delay || 0, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "both" });
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  // rAF ticker helper for hero animations. onFrame(p in 0..1). Returns control.
  function ticker(dur, onFrame, onDone) {
    var start = null, raf = null, done = false;
    function step(ts) {
      if (start == null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      onFrame(p);
      if (p < 1) raf = requestAnimationFrame(step);
      else { done = true; if (onDone) onDone(); }
    }
    raf = requestAnimationFrame(step);
    return { cancel: function () { if (raf) cancelAnimationFrame(raf); } };
  }

  /* ----------------------------------------------------------- legend */
  function legend(items, opts) {
    var ul = H("ul", "ds-legend");
    items.forEach(function (it) {
      var li = H("li");
      var sw = H("span", "swatch" + (opts && opts.line ? " swatch--line" : ""));
      sw.style.background = it.color;
      li.appendChild(sw); li.appendChild(document.createTextNode(it.label));
      ul.appendChild(li);
    });
    return ul;
  }

  /* =====================================================================
     RENDERERS  —  registry[type](host, fig, data) -> { play, still }
     `host` is the .ds-chart div; each returns SVG + optional legend.
     ===================================================================== */
  var R = {};

  /* ---- scatter (plain / bubble / diagonal ref / step overlay / PR curve) */
  R.scatter = function (host, fig, data) {
    var key = fig.dataset.figure, mode = fig.dataset.mode || "";
    var pts, xs, ys, fr, sx, sy, opts = {};
    // gather points from the named slice
    if (key === "scatter") {                 // 01 xPts vs points
      var s = data.scatter; pts = s.points.map(function (p) {
        return { x: p.xp, y: p.pts, c: p.test ? 0 : -1, r: p.test ? 5 : 3.4,
                 test: p.test, label: null };
      });
      opts = { lim: s.lim, diagonal: true, extremes: s.extremes };
    } else if (key === "model" && data.model) {  // could be PR or predVactual
      pts = [];
    }
    if (key === "gamesTime") {                // 06 bubble + record step
      pts = data.gamesTime.points.map(function (p) {
        return { x: p.year, y: p.units, c: 0, r: Math.max(4, Math.sqrt(p.units) * 1.7),
                 label: p.title };
      });
      opts = { step: data.gamesTime.record, ylabel: fig.dataset.y };
    }
    if (key === "predVactual") {              // 06 model
      var mo = data.model;
      pts = mo.points.map(function (p) { return { x: p.actual, y: p.pred, c: 0, r: 4.5, label: p.title }; });
      opts = { lim: mo.lim, logBoth: true, diagonal: true, r2: mo.r2, mae: mo.maeLog };
    }

    var w = 640, h = 420;
    if (mode === "pr") return prCurve(host, fig, data, w, h);

    fr = Frame(w, h, { l: 56, b: 44, r: opts.step ? 18 : 20 });
    var xvals = pts.map(function (p) { return p.x; }), yvals = pts.map(function (p) { return p.y; });
    var xmin, xmax, ymin, ymax;
    if (opts.lim) { xmin = ymin = opts.lim[0]; xmax = ymax = opts.lim[1]; }
    else {
      xmin = Math.min.apply(0, xvals); xmax = Math.max.apply(0, xvals);
      ymin = 0; ymax = Math.max.apply(0, yvals) * 1.08;
      var pad = (xmax - xmin) * 0.05; xmin -= pad; xmax += pad;
    }
    if (opts.logBoth) {
      sx = logScale(opts.lim[0], opts.lim[1], fr.x0, fr.x1);
      sy = logScale(opts.lim[0], opts.lim[1], fr.y0, fr.yTop);
      var lt = logTicks(opts.lim[0], opts.lim[1]);
      gridX(fr, sx, lt, function (v) { return v + "M"; }, fig.dataset.x);
      gridY(fr, sy, lt, function (v) { return v + "M"; }, fig.dataset.y);
    } else {
      sx = linScale(xmin, xmax, fr.x0, fr.x1);
      sy = linScale(ymin, ymax, fr.y0, fr.yTop);
      gridX(fr, sx, niceTicks(xmin, xmax, 6), fmtSI, fig.dataset.x);
      gridY(fr, sy, niceTicks(ymin, ymax, 6), fmtSI, fig.dataset.y);
    }

    // diagonal reference y=x
    if (opts.diagonal) {
      var d0 = Math.max(xmin, ymin), d1 = Math.min(xmax, ymax);
      fr.add(E("line", { x1: sx(d0), y1: sy(d0), x2: sx(d1), y2: sy(d1),
        class: "ds-annotation-line" }));
    }
    // running-record step (06 games)
    var stepPath = null;
    if (opts.step) {
      var dd = "", first = true;
      opts.step.forEach(function (r, i) {
        var X = sx(r.year), Y = sy(r.rec);
        if (first) { dd = "M" + X + "," + Y; first = false; }
        else { dd += "H" + X + "V" + Y; }
      });
      stepPath = fr.add(E("path", { d: dd, fill: "none", stroke: "var(--ds-label)",
        "stroke-width": 1.4, "stroke-dasharray": "4 3" }));
    }
    // dots
    var dots = pts.map(function (p) {
      var c = p.c < 0 ? "var(--ds-label)" : cat(p.c);
      var circ = E("circle", { cx: sx(p.x), cy: sy(p.y), r: p.r, fill: c,
        "fill-opacity": p.c < 0 ? 0.5 : 0.8, class: "ds-dot" });
      fr.add(circ); return circ;
    });
    // labels for extremes / named points
    if (opts.extremes) opts.extremes.forEach(function (e) {
      fr.add(T(sx(e.xp) + 7, sy(e.pts) + (e.resid > 0 ? -6 : 14),
        e.team + " " + (e.resid > 0 ? "+" : "") + Math.round(e.resid),
        "ds-datalabel"));
    });
    if (opts.step || opts.logBoth) pts.forEach(function (p) {
      if (["Minecraft", "Grand Theft Auto V", "Wii Sports", "Tetris (EA, mobile)"].indexOf(p.label) >= 0)
        fr.add(T(sx(p.x) + 6, sy(p.y) - 6, p.label.split(":")[0], "ds-datalabel"));
    });
    if (opts.r2 != null) {
      var box = fr.add(T(fr.x0 + 6, fr.yTop + 16,
        "LOO-CV  R² " + opts.r2.toFixed(2) + "  ·  MAE " + opts.mae.toFixed(2) + " log₁₀",
        "ds-datalabel"));
    }
    fr.title(fig.querySelector(".ds-figure__title") ?
      fig.querySelector(".ds-figure__title").textContent : "scatter");
    host.appendChild(fr.svg);

    return {
      still: function () {},
      play: function () {
        if (stepPath) drawStroke(stepPath, 1100);
        dots.forEach(function (d, i) { fadeScale(d, 420, i * 12); });
      }
    };
  };

  function prCurve(host, fig, data, w, h) {
    var mo = data.model, fr = Frame(w, h, { l: 56, b: 44 });
    var sx = linScale(0, 1, fr.x0, fr.x1), sy = linScale(0, 1.02, fr.y0, fr.yTop);
    gridX(fr, sx, [0, 0.25, 0.5, 0.75, 1], null, fig.dataset.x || "Recall");
    gridY(fr, sy, [0, 0.25, 0.5, 0.75, 1], null, fig.dataset.y || "Precision");
    // baseline prevalence
    fr.add(E("line", { x1: fr.x0, y1: sy(mo.baseAP), x2: fr.x1, y2: sy(mo.baseAP),
      class: "ds-annotation-line" }));
    fr.add(T(fr.x1 - 4, sy(mo.baseAP) - 5, "baseline " + mo.baseAP.toFixed(2),
      "ds-tick", { "text-anchor": "end" }));
    var d = "M" + mo.pr.map(function (p) { return sx(p.r) + "," + sy(p.p); }).join("L");
    var path = fr.add(E("path", { d: d, class: "ds-series-line", stroke: cat(0) }));
    var op = fr.add(E("circle", { cx: sx(mo.operating.rec), cy: sy(mo.operating.prec),
      r: 6, fill: cat(5), class: "ds-dot" }));
    fr.add(T(fr.x0 + 6, fr.yTop + 16, "PR-AUC " + mo.ap.toFixed(2) +
      "  ·  ROC-AUC " + mo.roc.toFixed(2), "ds-datalabel"));
    fr.title("Precision-recall curve");
    host.appendChild(fr.svg);
    return { still: function () {}, play: function () { drawStroke(path, 1200); fadeScale(op, 500, 1000); } };
  }

  /* ---- dumbbell (01 over/under-performance) */
  R.dumbbell = function (host, fig, data) {
    var d = data.dumbbell, w = 640, rowH = 22, h = d.length * rowH + 60;
    var fr = Frame(w, h, { l: 118, t: 16, b: 34, r: 40 });
    var all = d.reduce(function (a, r) { return a.concat([r.xp, r.pts]); }, []);
    var xmin = Math.min.apply(0, all) - 3, xmax = Math.max.apply(0, all) + 3;
    var sx = linScale(xmin, xmax, fr.x0, fr.x1);
    gridX(fr, sx, niceTicks(xmin, xmax, 6), fmtSI, fig.dataset.x || "Points");
    var rows = d.map(function (r, i) {
      var y = fr.yTop + (i + 0.5) * (fr.ph / d.length);
      var col = r.over ? "var(--ds-crit)" : cat(0);
      var g = E("g");
      var ln = E("line", { x1: sx(r.xp), y1: y, x2: sx(r.pts), y2: y, stroke: col,
        "stroke-width": 2.4, "stroke-opacity": 0.8 });
      var e = E("circle", { cx: sx(r.xp), cy: y, r: 4.5, fill: "var(--ds-label)" });
      var a = E("circle", { cx: sx(r.pts), cy: y, r: 5.5, fill: col, class: "ds-dot" });
      g.appendChild(ln); g.appendChild(e); g.appendChild(a);
      g.appendChild(T(fr.x0 - 8, y + 4, r.team, "ds-tick", { "text-anchor": "end" }));
      g.appendChild(T(sx(r.pts) + (r.over ? 9 : -9), y + 4,
        (r.resid > 0 ? "+" : "") + Math.round(r.resid), "ds-datalabel",
        { "text-anchor": r.over ? "start" : "end" }));
      fr.add(g);
      return { g: g, ln: ln, a: a, cx: sx(r.pts), y: y };
    });
    fr.title("Over/under-performance dumbbell");
    host.appendChild(fr.svg);
    host.appendChild(legend([
      { label: "expected (shots)", color: "var(--ds-label)" },
      { label: "actual — over-performed", color: "var(--ds-crit)" },
      { label: "actual — under-performed", color: cat(0) }]));
    return {
      still: function () {},
      play: function () {
        rows.forEach(function (r, i) {
          if (REDUCE) return;
          r.ln.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: i * 22, fill: "both" });
          fadeScale(r.a, 380, i * 22 + 120, 6, 0);
        });
      }
    };
  };

  /* ---- bar (vertical / horizontal / diverging / stacked) */
  R.bar = function (host, fig, data) {
    var key = fig.dataset.figure, mode = fig.dataset.mode || "";
    if (mode === "race") return R._barRace(host, fig, data);
    if (mode === "morph") return R._barMorph(host, fig, data);
    if (mode === "stacked") return stackedBar(host, fig, data);

    var items, horizontal = (mode === "h" || key === "predictors" ||
      key === "rank" || key === "lexical" || key === "coefs"), diverging = false;
    if (key === "predictors") { items = data.predictors.map(function (p) {
        return { label: p.label, v: p.r, c: p.r > 0 ? 0 : 5 }; }); diverging = true; }
    else if (key === "coefs") { items = data.model.coefs.map(function (c) {
        return { label: c.stat, v: c.coef, c: 6 }; }); }
    else if (key === "rank") { items = data.rank.map(function (r) {
        return { label: r.console, v: r.units, c: r.brandIdx }; }); }
    else if (key === "lexical") { items = data.stats.map(function (s) {
        return { label: s.book, v: s.mattr, c: s.catIdx }; }); }
    else if (key === "badges") { items = data.regions.map(function (r) {
        var bc = { "Gym Badges": 0, "Orange Badges": 2, "Grand Trials": 1 };
        return { label: r.region, v: r.badges, c: bc[r.badgeType] != null ? bc[r.badgeType] : 4 }; }); }

    var w = 640;
    if (horizontal) {
      var rowH = 24, h = items.length * rowH + 56;
      var fr = Frame(w, h, { l: key === "rank" ? 118 : 138, t: 12, b: 34, r: 44 });
      var vmax = Math.max.apply(0, items.map(function (i) { return i.v; }));
      var vmin = diverging ? Math.min.apply(0, items.map(function (i) { return i.v; })) : 0;
      if (diverging) { vmin = Math.min(vmin, -vmax); vmax = Math.max(vmax, -vmin); }
      var sx = linScale(vmin, vmax, fr.x0, fr.x1);
      gridX(fr, sx, niceTicks(vmin, vmax, 6), fmtSI, fig.dataset.x);
      var zero = sx(diverging ? 0 : vmin);
      if (diverging) fr.add(E("line", { x1: zero, y1: fr.yTop, x2: zero, y2: fr.y0, class: "ds-baseline" }));
      var bars = items.map(function (it, i) {
        var y = fr.yTop + i * (fr.ph / items.length) + 3;
        var bh = fr.ph / items.length - 6;
        var x = it.v >= 0 ? zero : sx(it.v);
        var bw = Math.abs(sx(it.v) - zero);
        var rect = E("rect", { x: x, y: y, width: bw, height: bh, rx: 2, fill: cat(it.c) });
        fr.add(rect);
        fr.add(T(fr.x0 - 8, y + bh / 2 + 4, it.label, "ds-tick", { "text-anchor": "end" }));
        fr.add(T(it.v >= 0 ? sx(it.v) + 5 : sx(it.v) - 5, y + bh / 2 + 4,
          (it.v > 0 && diverging ? "+" : "") + fmtSI(it.v), "ds-datalabel",
          { "text-anchor": it.v >= 0 ? "start" : "end" }));
        return rect;
      });
      fr.title(key);
      host.appendChild(fr.svg);
      return { still: function () {}, play: function () {
        bars.forEach(function (b, i) { growX(b, 620, i * 30); }); } };
    }
    // vertical
    var h = 380, fr2 = Frame(w, h, { l: 48, b: 46, r: 16 });
    var vmax2 = Math.max.apply(0, items.map(function (i) { return i.v; })) * 1.14;
    var sy = linScale(0, vmax2, fr2.y0, fr2.yTop);
    gridY(fr2, sy, niceTicks(0, vmax2, 6), fmtSI, fig.dataset.y);
    var bw2 = fr2.pw / items.length;
    var bars2 = items.map(function (it, i) {
      var x = fr2.x0 + i * bw2 + bw2 * 0.16, wbar = bw2 * 0.68;
      var rect = E("rect", { x: x, y: sy(it.v), width: wbar, height: fr2.y0 - sy(it.v),
        rx: 2, fill: cat(it.c) });
      fr2.add(rect);
      fr2.add(T(x + wbar / 2, fr2.y0 + 15, it.label, "ds-tick",
        { "text-anchor": "middle", "font-size": 9.5 }));
      fr2.add(T(x + wbar / 2, sy(it.v) - 5, fmtSI(it.v), "ds-datalabel", { "text-anchor": "middle" }));
      return rect;
    });
    fr2.title(key);
    host.appendChild(fr2.svg);
    return { still: function () {}, play: function () {
      bars2.forEach(function (b, i) { grow(b, "bottom", 620, i * 40); }); } };
  };

  function stackedBar(host, fig, data) {
    var gs = data.genShare, w = 640, h = 400, fr = Frame(w, h, { l: 44, b: 42, r: 96 });
    var sy = linScale(0, 100, fr.y0, fr.yTop);
    gridY(fr, sy, [0, 25, 50, 75, 100], function (v) { return v + "%"; }, fig.dataset.y);
    var bw = fr.pw / gs.gens.length;
    var segs = [];
    gs.gens.forEach(function (gen, gi) {
      var x = fr.x0 + gi * bw + bw * 0.14, wbar = bw * 0.72, acc = 0;
      gs.manufacturers.forEach(function (m, mi) {
        var val = gs.matrix[gi][mi]; if (val <= 0) return;
        var y = sy(acc + val), hh = sy(acc) - sy(acc + val);
        var rect = E("rect", { x: x, y: y, width: wbar, height: hh, fill: cat(m.brandIdx) });
        fr.add(rect); segs.push(rect); acc += val;
      });
      fr.add(T(x + bw * 0.36, fr.y0 + 15, "Gen " + gen, "ds-tick", { "text-anchor": "middle" }));
    });
    fr.title("Manufacturer share by generation");
    host.appendChild(fr.svg);
    host.appendChild(legend(gs.manufacturers.map(function (m) {
      return { label: m.name, color: cat(m.brandIdx) }; })));
    return { still: function () {}, play: function () {
      segs.forEach(function (s, i) { grow(s, "bottom", 500, i * 26); }); } };
  }

  /* ---- line (multi / area / log-log / draw) */
  R.line = function (host, fig, data) {
    var key = fig.dataset.figure, mode = fig.dataset.mode || "";
    if (mode === "race") return R._lineRace(host, fig, data);
    if (mode === "draw") return R._lineDraw(host, fig, data);

    var series, dates, logY = false, area = false, loglog = false, xLabels = null;
    if (key === "growth") { var g = data.growth; series = g.series; dates = g.dates; }
    else if (key === "vol") { series = data.vol.series; dates = data.vol.dates; }
    else if (key === "underwater") { series = data.underwater.series; dates = data.underwater.dates; area = true; }
    else if (key === "zipf") { loglog = true; }

    var w = 660, h = 400, fr = Frame(w, h, { l: 56, b: 42, r: mode === "endlabels" ? 96 : 20 });

    if (loglog) return zipfChart(host, fig, data, fr);

    // x is a date index
    var n = dates.length, sx = linScale(0, n - 1, fr.x0, fr.x1);
    var allv = [];
    series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) allv.push(v); }); });
    var ymin = area ? Math.min.apply(0, allv) : Math.min(0, Math.min.apply(0, allv));
    var ymax = Math.max.apply(0, allv);
    if (area) ymax = 0;
    var pad = (ymax - ymin) * 0.06;
    var sy = linScale(ymin - (area ? pad : 0), ymax + (area ? 0 : pad), fr.y0, fr.yTop);
    gridY(fr, sy, niceTicks(ymin, ymax, 6), area ? function (v) { return v + "%"; } : fmtSI, fig.dataset.y);
    // sparse x ticks (year labels)
    var xt = [];
    for (var i = 0; i < n; i += Math.ceil(n / 6)) xt.push(i);
    xt.forEach(function (i) {
      fr.add(T(sx(i), fr.y0 + 16, ("" + dates[i]).slice(0, 4), "ds-tick", { "text-anchor": "middle" }));
    });
    if (fig.dataset.x) fr.add(T(fr.x0 + fr.pw / 2, h - 3, fig.dataset.x, "ds-axis-label", { "text-anchor": "middle" }));
    if (area) fr.add(E("line", { x1: fr.x0, y1: sy(0), x2: fr.x1, y2: sy(0), class: "ds-baseline" }));

    var paths = series.map(function (s) {
      var dd = "", started = false;
      s.values.forEach(function (v, i) {
        if (v == null) return;
        dd += (started ? "L" : "M") + sx(i) + "," + sy(v); started = true;
      });
      var grp = E("g");
      if (area) {
        var fillD = dd + "L" + sx(s.values.length - 1) + "," + sy(0) + "L" + sx(0) + "," + sy(0) + "Z";
        grp.appendChild(E("path", { d: fillD, class: "ds-series-fill", fill: cat(s.catIdx) }));
      }
      var p = E("path", { d: dd, class: "ds-series-line", stroke: cat(s.catIdx) });
      grp.appendChild(p); fr.add(grp);
      // end label
      var last = s.values.length - 1;
      while (s.values[last] == null && last > 0) last--;
      fr.add(T(sx(last) + 5, sy(s.values[last]) + 3, s.name, "ds-datalabel",
        { fill: cat(s.catIdx), "font-size": 10 }));
      return p;
    });
    fr.title(key);
    host.appendChild(fr.svg);
    return { still: function () {}, play: function () {
      paths.forEach(function (p, i) { drawStroke(p, 1300, i * 90); }); } };
  };

  function zipfChart(host, fig, data, fr) {
    var z = data.zipf;
    var maxRank = 0, maxFreq = 0;
    z.series.forEach(function (s) {
      maxRank = Math.max(maxRank, s.ranks[s.ranks.length - 1]);
      maxFreq = Math.max(maxFreq, s.freqs[0]);
    });
    var sx = logScale(1, maxRank, fr.x0, fr.x1), sy = logScale(1, maxFreq, fr.y0, fr.yTop);
    gridX(fr, sx, logTicks(1, maxRank), fmtSI, fig.dataset.x || "Word rank (log)");
    gridY(fr, sy, logTicks(1, maxFreq), fmtSI, fig.dataset.y || "Frequency (log)");
    // ideal 1/rank ref
    var refD = "M" + sx(1) + "," + sy(z.refTop) + "L" + sx(maxRank) + "," + sy(z.refTop / maxRank);
    fr.add(E("path", { d: refD, class: "ds-annotation-line", fill: "none" }));
    var paths = z.series.map(function (s) {
      var dd = "M" + s.ranks.map(function (r, i) { return sx(r) + "," + sy(s.freqs[i]); }).join("L");
      var p = E("path", { d: dd, class: "ds-series-line", stroke: cat(s.catIdx), "stroke-width": 1.8 });
      fr.add(p); return p;
    });
    fr.title("Zipf's law");
    host.appendChild(fr.svg);
    host.appendChild(legend(z.series.map(function (s) {
      return { label: s.name, color: cat(s.catIdx) }; }).concat(
      [{ label: "ideal 1/rank", color: "var(--ds-label)" }]), { line: true }));
    return { still: function () {}, play: function () {
      paths.forEach(function (p, i) { drawStroke(p, 1400, i * 120); }); } };
  }

  /* ---- histogram (with fitted Normal + sigma lines; strip for pokedex BST) */
  R.histogram = function (host, fig, data) {
    var key = fig.dataset.figure, w = 660, h = 400, fr = Frame(w, h, { l: 52, b: 44, r: 18 });
    var bins, counts, mu, sigma, strip = null, xlabel = fig.dataset.x, unit = "";
    if (key === "distSpy" || key === "distBtc") {
      var dd = key === "distSpy" ? data.dist.spy : data.dist.btc;
      bins = dd.bins; counts = dd.counts; mu = dd.mu; sigma = dd.sigma; unit = "%";
    } else if (key === "bst") {               // pokedex: build bins from nonLeg
      var vals = data.bst.nonLeg, lo = 180, hi = 720, step = 25;
      bins = []; for (var b = lo; b <= hi; b += step) bins.push(b);
      counts = new Array(bins.length - 1).fill(0);
      vals.forEach(function (v) { var idx = Math.floor((v - lo) / step); if (idx >= 0 && idx < counts.length) counts[idx]++; });
      strip = data.bst.legendary;
    }
    var xmin = bins[0], xmax = bins[bins.length - 1];
    var cmax = Math.max.apply(0, counts) * 1.18;
    var sx = linScale(xmin, xmax, fr.x0, fr.x1), sy = linScale(0, cmax, fr.y0, fr.yTop);
    gridY(fr, sy, niceTicks(0, cmax, 5), fmtSI, fig.dataset.y || "Count");
    gridX(fr, sx, niceTicks(xmin, xmax, 6), function (v) { return fmtSI(v) + unit; }, xlabel);
    var bars = counts.map(function (c, i) {
      var x = sx(bins[i]), wbar = sx(bins[i + 1]) - sx(bins[i]) - 1;
      var rect = E("rect", { x: x + 0.5, y: sy(c), width: Math.max(1, wbar), height: fr.y0 - sy(c),
        fill: strip ? "var(--ds-seq-4)" : cat(0), "fill-opacity": 0.85 });
      fr.add(rect); return rect;
    });
    // fitted normal (for SPY/BTC dist) scaled to bin width * n
    var curve = null;
    if (mu != null && !strip) {
      var binW = bins[1] - bins[0], n = counts.reduce(function (a, b) { return a + b; }, 0);
      var dpath = "", first = true;
      for (var xx = xmin; xx <= xmax; xx += (xmax - xmin) / 120) {
        var pdf = Math.exp(-0.5 * Math.pow((xx - mu) / sigma, 2)) / (sigma * Math.sqrt(2 * Math.PI));
        var yc = pdf * binW * n;
        dpath += (first ? "M" : "L") + sx(xx) + "," + sy(yc); first = false;
      }
      curve = fr.add(E("path", { d: dpath, fill: "none", stroke: "var(--ds-crit)", "stroke-width": 2 }));
      [-3, 3].forEach(function (k) {
        var X = sx(mu + k * sigma);
        if (X > fr.x0 && X < fr.x1) fr.add(E("line", { x1: X, y1: fr.yTop, x2: X, y2: fr.y0, class: "ds-annotation-line" }));
      });
    }
    // legendary strip (pokedex)
    var stripDots = [];
    if (strip) {
      var sy2 = fr.yTop + fr.ph * 0.12;
      strip.forEach(function (m, i) {
        var c = E("circle", { cx: sx(m.bst), cy: sy2 + (i % 2 ? 8 : -8), r: 5, fill: cat(5), class: "ds-dot" });
        fr.add(c); stripDots.push(c);
      });
      var medAll = data.bst.medianAll, medLeg = data.bst.medianLeg;
      fr.add(E("line", { x1: sx(medAll), y1: fr.yTop, x2: sx(medAll), y2: fr.y0, class: "ds-annotation-line" }));
      fr.add(T(sx(medAll) + 4, fr.y0 - 6, "median " + medAll, "ds-tick"));
      fr.add(E("line", { x1: sx(medLeg), y1: fr.yTop, x2: sx(medLeg), y2: fr.y0,
        class: "ds-annotation-line", stroke: cat(5) }));
      fr.add(T(sx(medLeg) - 4, fr.yTop + 12, "legendary " + medLeg, "ds-tick",
        { "text-anchor": "end", fill: cat(5) }));
    }
    fr.title(key);
    host.appendChild(fr.svg);
    return { still: function () {}, play: function () {
      bars.forEach(function (b, i) { grow(b, "bottom", 450, i * 14); });
      if (curve) drawStroke(curve, 1200, 500);
      stripDots.forEach(function (d, i) { fadeScale(d, 400, 700 + i * 40); });
    } };
  };

  /* ---- heatmap (corr / confusion / type-stat / type-region) */
  R.heatmap = function (host, fig, data) {
    var key = fig.dataset.figure, rows, cols, matrix, diverging = false, valfmt, hi = null;
    if (key === "corr") { var c = data.corr; rows = cols = c.labels; matrix = c.matrix;
      diverging = true; valfmt = function (v) { return v.toFixed(2); }; }
    else if (key === "confusion") { var cf = data.confusion; rows = cols = cf.labels; matrix = cf.matrix;
      valfmt = function (v) { return v ? v.toFixed(2) : ""; }; }
    else if (key === "typeStats") { var ts = data.typeStats; rows = ts.types; cols = ts.stats;
      matrix = ts.matrix; valfmt = function (v) { return Math.round(v); };
      // highlight global max
      var mx = -1; matrix.forEach(function (r, i) { r.forEach(function (v, j) { if (v > mx) { mx = v; hi = [i, j]; } }); }); }
    else if (key === "teamHeatmap") { var th = data.teamHeatmap; rows = th.types; cols = th.regions;
      matrix = th.matrix; valfmt = function (v) { return v || ""; }; }

    var flat = [].concat.apply([], matrix);
    var vmin = Math.min.apply(0, flat), vmax = Math.max.apply(0, flat);
    var lm = key === "corr" || key === "confusion" ? 96 : (key === "typeStats" ? 92 : 78);
    var cell = Math.min(46, 520 / cols.length);
    var w = lm + cols.length * cell + 20, h = 30 + rows.length * cell + 64;
    var fr = Frame(w, h, { l: lm, t: 12, b: 64, r: 20 });
    var gx = fr.x0, gy = fr.yTop;

    var seq = seqStops();
    var dLow = hexRGB(cvar("--ds-div-low")), dMid = hexRGB(cvar("--ds-div-mid")),
        dHigh = hexRGB(cvar("--ds-div-high"));
    function color(v) {                                  // → rgb array (real colour)
      if (diverging) {                                   // blue ↔ pink on [-1,1]
        var t = (v + 1) / 2;
        return t < 0.5 ? mixRGB(dLow, dMid, t * 2) : mixRGB(dMid, dHigh, (t - 0.5) * 2);
      }
      return rampAt(seq, (v - vmin) / (vmax - vmin || 1));  // sequential
    }
    var cells = [];
    matrix.forEach(function (row, i) {
      row.forEach(function (v, j) {
        var x = gx + j * cell, y = gy + i * cell, rgb = color(v);
        var rect = E("rect", { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 2, fill: rgbCss(rgb) });
        fr.add(rect); cells.push(rect);
        var label = valfmt(v);
        if (label !== "") {
          fr.add(T(x + cell / 2, y + cell / 2 + 4, label, "ds-datalabel",
            { "text-anchor": "middle", "font-size": 10, fill: textOn(rgb) }));
        }
      });
      fr.add(T(gx - 6, gy + i * cell + cell / 2 + 4, shorten(rows[i]), "ds-tick", { "text-anchor": "end" }));
    });
    cols.forEach(function (cn, j) {
      fr.add(T(gx + j * cell + cell / 2, gy + rows.length * cell + 16, shorten(cn), "ds-tick",
        { "text-anchor": "end", transform: "rotate(-35 " + (gx + j * cell + cell / 2) + " " + (gy + rows.length * cell + 16) + ")" }));
    });
    if (hi) fr.add(E("rect", { x: gx + hi[1] * cell + 1, y: gy + hi[0] * cell + 1,
      width: cell - 2, height: cell - 2, fill: "none", stroke: cat(5), "stroke-width": 2.4, rx: 2 }));
    if (key === "teamHeatmap")   // box the Electric (Pikachu) row
      fr.add(E("rect", { x: gx, y: gy, width: cols.length * cell, height: cell,
        fill: "none", stroke: "var(--ds-good)", "stroke-width": 2.4, rx: 2 }));
    fr.title(key);
    host.appendChild(fr.svg);
    return { still: function () {}, play: function () {
      cells.forEach(function (c, i) { fadeScale(c, 360, i * 8); }); } };
  };
  function shorten(s) {
    return s.replace("A Tale of Two Cities", "Two Cities").replace(" in Wonderland", "")
      .replace("Pride & Prejudice", "Pride & Prej.").replace("US Treasuries 20Y+", "Treasuries 20Y+");
  }

  /* ---- radar (small multiples) */
  R.radar = function (host, fig, data) {
    var key = fig.dataset.figure, axes, mons, rmax;
    if (key === "radar" && data.radar && data.radar.mons) {   // pokedex
      axes = data.radar.stats; mons = data.radar.mons; rmax = data.radar.rmax;
    } else if (key === "radar") {                             // moneyball squad DNA
      axes = data.radar.axes; rmax = 1;
      mons = data.radar.clubs.map(function (c) { return { name: c.name, values: c.values, catIdx: c.catIdx }; });
    }
    var perRow = mons.length <= 4 ? 2 : 4;
    var rows = Math.ceil(mons.length / perRow);
    var cw = perRow === 2 ? 288 : 244, ch = 214, w = perRow * cw, h = rows * ch + 10;
    var svg = E("svg", { viewBox: "0 0 " + w + " " + h, role: "img" });
    var polys = [];
    mons.forEach(function (mon, idx) {
      var col = idx % perRow, rw = Math.floor(idx / perRow);
      var cx = col * cw + cw / 2, cy = rw * ch + ch / 2, R0 = 68;
      var g = E("g");
      // spokes + rings
      [0.5, 1].forEach(function (rr) {
        var pts = axes.map(function (_, i) {
          var ang = -Math.PI / 2 + i * 2 * Math.PI / axes.length;
          return (cx + Math.cos(ang) * R0 * rr) + "," + (cy + Math.sin(ang) * R0 * rr);
        }).join(" ");
        g.appendChild(E("polygon", { points: pts, fill: "none", stroke: "var(--ds-grid)", "stroke-width": 0.8 }));
      });
      axes.forEach(function (ax, i) {
        var ang = -Math.PI / 2 + i * 2 * Math.PI / axes.length;
        g.appendChild(E("line", { x1: cx, y1: cy, x2: cx + Math.cos(ang) * R0, y2: cy + Math.sin(ang) * R0,
          class: "ds-grid-line" }));
        var lx = cx + Math.cos(ang) * (R0 + 15), ly = cy + Math.sin(ang) * (R0 + 15);
        g.appendChild(T(lx, ly + 3, ax, "ds-tick",
          { "text-anchor": Math.abs(Math.cos(ang)) < 0.3 ? "middle" : (Math.cos(ang) > 0 ? "start" : "end"),
            "font-size": 8.5 }));
      });
      var pts = mon.values.map(function (v, i) {
        var ang = -Math.PI / 2 + i * 2 * Math.PI / axes.length, rr = R0 * (v / rmax);
        return (cx + Math.cos(ang) * rr) + "," + (cy + Math.sin(ang) * rr);
      }).join(" ");
      var poly = E("polygon", { points: pts, fill: cat(mon.catIdx), "fill-opacity": 0.22,
        stroke: cat(mon.catIdx), "stroke-width": 2 });
      g.appendChild(poly); polys.push({ poly: poly, cx: cx, cy: cy });
      g.appendChild(T(cx, rw * ch + 16, mon.name, "ds-callout", { "text-anchor": "middle" }));
      if (mon.bst) g.appendChild(T(cx, rw * ch + ch - 8, "BST " + mon.bst + " · #" + mon.rank,
        "ds-tick", { "text-anchor": "middle" }));
      svg.appendChild(g);
    });
    var ttl = E("title"); ttl.textContent = "radar"; svg.insertBefore(ttl, svg.firstChild);
    host.appendChild(svg);
    return { still: function () {}, play: function () {
      polys.forEach(function (p, i) {
        if (REDUCE) return;
        p.poly.style.transformBox = "fill-box"; p.poly.style.transformOrigin = "center";
        p.poly.animate([{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }],
          { duration: 600, delay: i * 90, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "both" });
      });
    } };
  };

  /* ---- lollipop / stem (ash trajectory; static + reveal hero) */
  R.lollipop = function (host, fig, data) {
    var mode = fig.dataset.mode || "", regions = data.regions, tn = data.tierNames;
    var w = 660, h = 400, fr = Frame(w, h, { l: 108, t: 16, b: 46, r: 24 });
    var n = regions.length;
    var sx = linScale(1, n, fr.x0 + 10, fr.x1 - 10);
    var sy = linScale(0.5, 6.5, fr.y0, fr.yTop);
    // tier gridlines + labels
    [1, 2, 3, 4, 5, 6].forEach(function (t) {
      fr.add(E("line", { x1: fr.x0, y1: sy(t), x2: fr.x1, y2: sy(t), class: "ds-grid-line" }));
      fr.add(T(fr.x0 - 8, sy(t) + 4, tn[t], "ds-tick", { "text-anchor": "end", "font-size": 9 }));
    });
    regions.forEach(function (r) {
      fr.add(T(sx(r.order), fr.y0 + 16, r.region, "ds-tick",
        { "text-anchor": "middle", "font-size": 8.5 }));
    });
    if (fig.dataset.x) fr.add(T(fr.x0 + fr.pw / 2, h - 3, fig.dataset.x, "ds-axis-label", { "text-anchor": "middle" }));
    var circColor = { official: cat(0), minor: cat(2), world: "var(--ds-good)" };
    // trend line over official leagues
    var tr = data.trend;
    fr.add(E("line", { x1: sx(tr.x0), y1: sy(tr.slope * tr.x0 + tr.intercept),
      x2: sx(tr.x1), y2: sy(tr.slope * tr.x1 + tr.intercept), class: "ds-annotation-line" }));
    // connecting dotted path
    var pathD = "M" + regions.map(function (r) { return sx(r.order) + "," + sy(r.tier); }).join("L");
    var connector = fr.add(E("path", { d: pathD, fill: "none", stroke: "var(--ds-label)",
      "stroke-width": 1.2, "stroke-dasharray": "2 3" }));
    var nodes = regions.map(function (r) {
      var g = E("g");
      var stem = E("line", { x1: sx(r.order), y1: sy(0.5), x2: sx(r.order), y2: sy(r.tier),
        stroke: "var(--ds-grid)", "stroke-width": 2 });
      var glow = null;
      if (r.tier >= 5) glow = E("circle", { cx: sx(r.order), cy: sy(r.tier), r: 16, fill: "none",
        stroke: r.circuit === "world" ? "var(--ds-good)" : circColor[r.circuit], "stroke-width": 2.2, opacity: 0.9 });
      var dot = E("circle", { cx: sx(r.order), cy: sy(r.tier), r: 8, fill: circColor[r.circuit], class: "ds-dot" });
      g.appendChild(stem); if (glow) g.appendChild(glow); g.appendChild(dot);
      fr.add(g);
      return { g: g, stem: stem, glow: glow, dot: dot, r: r };
    });
    fr.title("Ash's league trajectory");
    host.appendChild(fr.svg);
    host.appendChild(legend([
      { label: "official league", color: cat(0) },
      { label: "minor circuit (Orange)", color: cat(2) },
      { label: "World Coronation Series", color: "var(--ds-good)" }]));

    function revealTo(k) {
      nodes.forEach(function (nd, i) {
        var on = i < k;
        nd.g.style.opacity = on ? 1 : 0;
        if (nd.glow) nd.glow.style.opacity = on ? 0.9 : 0;
      });
      // connector partial
    }
    return {
      still: function () {},
      play: function () {
        if (REDUCE) { return; }
        if (mode === "reveal") {
          nodes.forEach(function (nd) { nd.g.style.opacity = 0; });
          drawStroke(connector, 2400);
          nodes.forEach(function (nd, i) {
            setTimeout(function () {
              nd.g.style.opacity = 1;
              fadeScale(nd.dot, 400, 0, 0, 0);
              if (nd.glow) nd.glow.animate([{ r: 8, opacity: 0 }, { r: 16, opacity: 0.9 }],
                { duration: 600, fill: "both" });
            }, i * 260);
          });
        } else {
          drawStroke(connector, 1400);
          nodes.forEach(function (nd, i) {
            nd.stem.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: i * 40, fill: "both" });
            fadeScale(nd.dot, 420, i * 40 + 100, 0, 0);
          });
        }
      }
    };
  };

  /* ---- HERO: line race (01 title race, 02 horse race) */
  R._lineRace = function (host, fig, data) {
    var key = fig.dataset.figure, race, logY = false, xLabels, xkey;
    if (key === "race" && data.race && data.race.teams) {   // 01 matchday race
      race = { series: data.race.teams.map(function (t) {
          return { name: t.name, catIdx: t.catIdx, values: t.series }; }),
        x: data.race.matchdays, xlabel: "Matches played", ylabel: "Cumulative points" };
    } else if (key === "race") {                            // 02 horse race
      race = { series: data.race.series, x: data.race.dates.map(function (_, i) { return i; }),
        dates: data.race.dates, logY: data.race.logY, xlabel: "", ylabel: "Growth of $100" };
      logY = data.race.logY;
    }
    var w = 720, h = 420, fr = Frame(w, h, { l: 56, b: 42, r: 104 });
    var n = race.x.length;
    var sx = linScale(0, n - 1, fr.x0, fr.x1);
    var allv = [];
    race.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) allv.push(v); }); });
    var ymin = logY ? Math.max(1, Math.min.apply(0, allv)) : 0;
    var ymax = Math.max.apply(0, allv) * (logY ? 1.1 : 1.06);
    var sy = logY ? logScale(ymin, ymax, fr.y0, fr.yTop) : linScale(ymin, ymax, fr.y0, fr.yTop);
    gridY(fr, sy, logY ? logTicks(ymin, ymax) : niceTicks(0, ymax, 6),
      logY ? function (v) { return "$" + fmtSI(v); } : fmtSI, fig.dataset.y || race.ylabel);
    // x ticks
    var lbl = race.dates || race.x;
    for (var i = 0; i < n; i += Math.ceil(n / 6)) {
      var s2 = race.dates ? ("" + race.dates[i]).slice(0, 4) : "" + race.x[i];
      fr.add(T(sx(i), fr.y0 + 16, s2, "ds-tick", { "text-anchor": "middle" }));
    }
    if (race.xlabel) fr.add(T(fr.x0 + fr.pw / 2, h - 3, race.xlabel, "ds-axis-label", { "text-anchor": "middle" }));
    // big date/matchday readout
    var readout = fr.add(T(fr.x1 - 4, fr.yTop + 26, "", "ds-callout",
      { "text-anchor": "end", "font-size": 22, "fill-opacity": 0.5 }));

    var lines = race.series.map(function (s) {
      var p = E("path", { d: "", class: "ds-series-line", stroke: cat(s.catIdx) });
      fr.add(p);
      var dot = E("circle", { r: 4.5, fill: cat(s.catIdx), class: "ds-dot", opacity: 0 });
      fr.add(dot);
      var lab = T(0, 0, "", "ds-datalabel", { fill: cat(s.catIdx), "font-size": 10, opacity: 0 });
      fr.add(lab);
      // Pre-resolve the non-null points to pixel space once (they never change), so
      // the per-frame loop never re-walks nulls or recomputes sx/sy. Series are
      // cumulative: null until they start, then contiguous — one clean run.
      var pts = [];
      s.values.forEach(function (v, i) { if (v != null) pts.push({ x: sx(i), y: sy(v), v: v, i: i }); });
      return { s: s, p: p, dot: dot, lab: lab, pts: pts, pk: -1, pd: "", pj: 0 };
    });

    // g is a fractional index in [0, n-1]. The integer-index prefix path is cached
    // and rebuilt only when floor(g) advances; each frame just appends one
    // interpolated head segment so the tip/dot/label glide continuously.
    function drawTo(g) {
      var gi = Math.floor(g), frac = g - gi;
      lines.forEach(function (L) {
        var pts = L.pts;
        if (!pts.length || pts[0].i > g) {          // series not started yet → hidden
          if (L.pk !== -1) {
            L.p.setAttribute("d", ""); L.dot.setAttribute("opacity", 0); L.lab.setAttribute("opacity", 0);
            L.pk = -1; L.pd = ""; L.pj = 0;
          }
          return;
        }
        if (gi !== L.pk) {                           // rebuild cached prefix (rare)
          var dd = "", cnt = 0;
          for (var j = 0; j < pts.length && pts[j].i <= gi; j++) {
            dd += (cnt ? "L" : "M") + pts[j].x + "," + pts[j].y; cnt++;
          }
          L.pd = dd; L.pk = gi; L.pj = cnt;
        }
        var a = pts[L.pj - 1], b = pts[L.pj];        // last prefix point + next point
        var hx, hy, hv;
        if (b && b.i === gi + 1) {                   // consecutive → glide toward it
          hx = lerp(a.x, b.x, frac); hy = lerp(a.y, b.y, frac); hv = lerp(a.v, b.v, frac);
        } else { hx = a.x; hy = a.y; hv = a.v; }     // final point (or held) → stay put
        L.p.setAttribute("d", L.pd + "L" + hx + "," + hy);
        L.dot.setAttribute("cx", hx); L.dot.setAttribute("cy", hy); L.dot.setAttribute("opacity", 1);
        L.lab.setAttribute("x", hx + 6); L.lab.setAttribute("y", hy + 3); L.lab.setAttribute("opacity", 1);
        L.lab.textContent = L.s.name + " " + Math.round(hv);
      });
      var li = Math.min(n - 1, gi);
      readout.textContent = race.dates ? fmtDate(race.dates[li]) : (race.x[li] + " played");
    }
    fr.title("Race");
    host.appendChild(fr.svg);
    var ctl = null;
    function run() { if (ctl) ctl.cancel();
      ctl = ticker(Math.min(8500, n * 130), function (p) { drawTo(ease(p) * (n - 1)); }); }
    return {
      still: function () { drawTo(n - 1); },
      play: function () { if (REDUCE) { drawTo(n - 1); return; } drawTo(0); run(); },
      replay: function () { drawTo(0); run(); }
    };
  };
  function fmtDate(s) {
    var m = { "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
      "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec" };
    var p = ("" + s).split("-"); return (m[p[1]] || p[1]) + " " + p[0];
  }

  /* ---- HERO: bar race (06 console cumulative) */
  R._barRace = function (host, fig, data) {
    // Animated "hyperlapse" bar race: bars grow + re-sort over race.years. Options
    // (all optional, back-compatible with the console race): m.color (entity colour,
    // else cat(brandIdx)); race.unit (value suffix, default "M"); race.dp (decimals);
    // race.asc (true = smallest on top, e.g. least time = leader); race.durMs; race.title.
    var race = data.race, mans = race.manufacturers, N = mans.length, n = race.years.length;
    var w = 660, h = Math.max(360, N * 17 + 74);
    var fr = Frame(w, h, { l: 102, t: 34, b: 40, r: 52 });
    var sx = linScale(0, race.xmax, fr.x0, fr.x1);
    var suffix = race.unit != null ? race.unit : "M", dp = race.dp || 0;
    function lab(v) { return (dp ? v.toFixed(dp) : Math.round(v)) + suffix; }
    gridX(fr, sx, niceTicks(0, race.xmax, 6), lab, fig.dataset.x);
    var rowH = fr.ph / N;
    var year = fr.add(T(fr.x1 - 4, fr.yTop + 30, "", "ds-callout",
      { "text-anchor": "end", "font-size": 30, "fill-opacity": 0.4 }));
    var bars = mans.map(function (m) {
      var g = E("g");
      var col = m.color || cat(m.brandIdx);
      var rect = E("rect", { x: fr.x0, y: 0, width: 0, height: rowH * 0.72, rx: 2, fill: col });
      var name = T(fr.x0 - 6, 0, m.name, "ds-tick", { "text-anchor": "end", "font-size": N > 12 ? 9 : 11 });
      var val = T(0, 0, "", "ds-datalabel", { "font-size": N > 12 ? 9 : 11 });
      g.appendChild(rect); g.appendChild(name); g.appendChild(val); fr.add(g);
      return { m: m, rect: rect, name: name, val: val };
    });
    // g is a CONTINUOUS round index (0..n-1): values are interpolated between the
    // two bracketing rounds so bars grow smoothly, and each bar's row position is
    // eased toward its rank so re-orderings glide rather than jump. snap=true sets
    // everything immediately (initial / still / reduced-motion).
    function frame(g, snap) {
      var fi0 = Math.floor(g), fi1 = Math.min(n - 1, fi0 + 1), tt = g - fi0;
      var vals = mans.map(function (m, i) {
        return { i: i, v: m.cum[fi0] + (m.cum[fi1] - m.cum[fi0]) * tt }; });
      var ranked = vals.slice().sort(function (a, b) { return a.v - b.v; });  // ascending
      if (!race.asc) ranked.reverse();                                        // default: biggest on top
      var ty = []; ranked.forEach(function (r, rank) { ty[r.i] = fr.yTop + rank * rowH + rowH * 0.14; });
      vals.forEach(function (r) {
        var b = bars[r.i];
        b.y = (snap || b.y == null) ? ty[r.i] : b.y + (ty[r.i] - b.y) * 0.2;   // ease row swaps
        var yc = b.y + rowH * 0.36 + 3.5;
        b.rect.setAttribute("y", b.y); b.rect.setAttribute("width", Math.max(0, sx(r.v) - fr.x0));
        b.name.setAttribute("y", yc);
        b.val.setAttribute("x", sx(r.v) + 6); b.val.setAttribute("y", yc);
        b.val.textContent = r.v > 0 ? lab(r.v) : "";
      });
      year.textContent = race.years[Math.min(n - 1, Math.round(g))];
    }
    fr.title(race.title || "Bar race");
    host.appendChild(fr.svg);
    if (N <= 8) host.appendChild(legend(mans.map(function (m) {
      return { label: m.name, color: m.color || cat(m.brandIdx) }; })));
    var ctl = null;
    function run() { if (ctl) ctl.cancel();
      ctl = ticker(race.durMs || 6000, function (p) { frame(ease(p) * (n - 1), false); }); }
    return { still: function () { if (ctl) ctl.cancel(); frame(n - 1, true); },
      play: function () { if (REDUCE) { frame(n - 1, true); return; } frame(0, true); run(); },
      replay: function () { frame(0, true); run(); } };
  };

  /* ---- HERO: bar morph (04 evolution) */
  R._barMorph = function (host, fig, data) {
    var evo = data.evo, stages = evo.stages, labels = evo.statLabels;
    var w = 620, h = 380, fr = Frame(w, h, { l: 46, t: 40, b: 42, r: 16 });
    var ymax = 130, sy = linScale(0, ymax, fr.y0, fr.yTop);
    gridY(fr, sy, niceTicks(0, ymax, 6), fmtSI, "Base stat");
    var colors = [0, 1, 2, 3, 6, 5];
    var bw = fr.pw / 6;
    var bars = labels.map(function (lab, i) {
      var x = fr.x0 + i * bw + bw * 0.16, wbar = bw * 0.68;
      var rect = E("rect", { x: x, y: sy(0), width: wbar, height: 0, rx: 2, fill: cat(colors[i]) });
      fr.add(rect);
      fr.add(T(x + wbar / 2, fr.y0 + 15, lab, "ds-tick", { "text-anchor": "middle", "font-size": 9.5 }));
      var vl = T(x + wbar / 2, sy(0) - 5, "", "ds-datalabel", { "text-anchor": "middle" });
      fr.add(vl);
      return { rect: rect, vl: vl, x: x, w: wbar };
    });
    var nameLab = fr.add(T(fr.x1 - 4, fr.yTop + 6, "", "ds-callout", { "text-anchor": "end", "font-size": 16, fill: cat(2) }));
    var bstLab = fr.add(T(fr.x1 - 4, fr.yTop + 26, "", "ds-datalabel", { "text-anchor": "end" }));
    function setVals(vals, name, bst) {
      vals.forEach(function (v, i) {
        var b = bars[i];
        b.rect.setAttribute("y", sy(v)); b.rect.setAttribute("height", fr.y0 - sy(v));
        b.vl.setAttribute("y", sy(v) - 5); b.vl.textContent = Math.round(v);
      });
      nameLab.textContent = name; bstLab.textContent = "BST " + Math.round(bst);
    }
    fr.title("Charmander → Charizard");
    host.appendChild(fr.svg);
    // frame plan: hold + tween like the GIF
    var plan = [];
    var hold = 10, between = 18;
    for (var si = 0; si < stages.length; si++) {
      for (var k = 0; k < hold; k++) plan.push({ v: stages[si].vals, nm: stages[si].name, bst: stages[si].bst });
      if (si < stages.length - 1) {
        var a = stages[si], b = stages[si + 1];
        for (var t = 1; t <= between; t++) {
          var f = t / (between + 1);
          plan.push({ v: a.vals.map(function (vv, j) { return lerp(vv, b.vals[j], f); }),
            nm: a.name + " → " + b.name, bst: lerp(a.bst, b.bst, f) });
        }
      }
    }
    var ctl = null;
    function run() { if (ctl) ctl.cancel();
      ctl = ticker(plan.length * 55, function (p) {
        var idx = Math.min(plan.length - 1, Math.floor(p * plan.length));
        setVals(plan[idx].v, plan[idx].nm, plan[idx].bst); }); }
    return { still: function () { var s = stages[stages.length - 1]; setVals(s.vals, s.name, s.bst); },
      play: function () { if (REDUCE) { this.still(); return; } setVals(stages[0].vals, stages[0].name, stages[0].bst); run(); },
      replay: function () { run(); } };
  };

  /* ---- arcs (03 sentiment small-multiples) */
  R.arcs = function (host, fig, data) {
    var a = data.arcs, xpos = a.xpos, books = a.books;
    var perRow = 3, rows = Math.ceil(books.length / perRow);
    var cw = 220, ch = 150, w = perRow * cw, h = rows * ch + 8;
    var svg = E("svg", { viewBox: "0 0 " + w + " " + h, role: "img" });
    // shared y-range across books
    var allv = [];
    books.forEach(function (b) { b.arc.forEach(function (v) { allv.push(v); }); });
    var ymin = Math.min.apply(0, allv), ymax = Math.max.apply(0, allv);
    var pad = (ymax - ymin) * 0.2 + 0.1;
    var elems = [];
    books.forEach(function (b, idx) {
      var col = idx % perRow, rw = Math.floor(idx / perRow);
      var ox = col * cw + 42, oy = rw * ch + 26, pw = cw - 58, ph = ch - 52;
      var sx = linScale(0, 100, ox, ox + pw), sy = linScale(ymin - pad, ymax + pad, oy + ph, oy);
      var g = E("g");
      g.appendChild(E("line", { x1: ox, y1: sy(0), x2: ox + pw, y2: sy(0), class: "ds-baseline" }));
      var dd = "M" + xpos.map(function (x, i) { return sx(x) + "," + sy(b.arc[i]); }).join("L");
      var fillD = dd + "L" + sx(100) + "," + sy(0) + "L" + sx(0) + "," + sy(0) + "Z";
      g.appendChild(E("path", { d: fillD, class: "ds-series-fill", fill: cat(b.catIdx) }));
      var p = E("path", { d: dd, class: "ds-series-line", stroke: cat(b.catIdx), "stroke-width": 1.8 });
      g.appendChild(p);
      var mi = b.minIdx;
      g.appendChild(E("circle", { cx: sx(xpos[mi]), cy: sy(b.arc[mi]), r: 3.2, fill: "var(--ds-title)" }));
      g.appendChild(T(ox, rw * ch + 14, b.name, "ds-callout", { "font-size": 11 }));
      svg.appendChild(g); elems.push(p);
    });
    var ttl = E("title"); ttl.textContent = "sentiment arcs"; svg.insertBefore(ttl, svg.firstChild);
    host.appendChild(svg);
    return { still: function () {}, play: function () {
      elems.forEach(function (p, i) { drawStroke(p, 900, i * 120); }); } };
  };

  /* ---- HERO: single sentiment arc drawing itself (03 Frankenstein) */
  R._lineDraw = function (host, fig, data) {
    var a = data.arcs, xpos = a.xpos;
    var which = fig.dataset.book || "Frankenstein";
    var b = a.books.filter(function (x) { return x.name === which; })[0] || a.books[1];
    var w = 660, h = 380, fr = Frame(w, h, { l: 52, b: 44, r: 24 });
    var ymin = Math.min.apply(0, b.arc), ymax = Math.max.apply(0, b.arc);
    var pad = (ymax - ymin) * 0.25 + 0.2;
    var sx = linScale(0, 100, fr.x0, fr.x1), sy = linScale(ymin - pad, ymax + pad, fr.y0, fr.yTop);
    gridY(fr, sy, niceTicks(ymin - pad, ymax + pad, 5), function (v) { return v.toFixed(1); },
      fig.dataset.y || "Mean AFINN valence");
    gridX(fr, sx, [0, 25, 50, 75, 100], function (v) { return v + "%"; },
      fig.dataset.x || "Narrative position (%)");
    fr.add(E("line", { x1: fr.x0, y1: sy(0), x2: fr.x1, y2: sy(0), class: "ds-baseline" }));
    var fill = fr.add(E("path", { d: "", class: "ds-series-fill", fill: cat(b.catIdx) }));
    var line = fr.add(E("path", { d: "", class: "ds-series-line", stroke: cat(b.catIdx) }));
    var dot = fr.add(E("circle", { r: 5, fill: "var(--ds-title)", class: "ds-dot", opacity: 0 }));
    var n = xpos.length;
    // Pre-resolve points to pixel space once; cache the integer-index prefix and
    // only rebuild it when floor(g) advances (see _lineRace for the rationale).
    var pts = xpos.map(function (x, i) { return { x: sx(x), y: sy(b.arc[i]) }; });
    var baseY = sy(0), leftX = sx(0), pk = -1, pd = "";
    function drawTo(g) {              // g = fractional index in [0, n-1]
      var gi = Math.floor(g), frac = g - gi;
      if (gi !== pk) {
        var dd = "", j;
        for (j = 0; j <= gi; j++) dd += (j ? "L" : "M") + pts[j].x + "," + pts[j].y;
        pd = dd; pk = gi;
      }
      var p0 = pts[gi], p1 = pts[gi + 1], hx, hy;
      if (p1) { hx = lerp(p0.x, p1.x, frac); hy = lerp(p0.y, p1.y, frac); }
      else { hx = p0.x; hy = p0.y; }
      var d = pd + "L" + hx + "," + hy;
      line.setAttribute("d", d);
      fill.setAttribute("d", d + "L" + hx + "," + baseY + "L" + leftX + "," + baseY + "Z");
      dot.setAttribute("cx", hx); dot.setAttribute("cy", hy); dot.setAttribute("opacity", 1);
    }
    fr.title(which + " sentiment arc");
    host.appendChild(fr.svg);
    var ctl = null;
    function run() { if (ctl) ctl.cancel();
      ctl = ticker(3800, function (p) { drawTo(ease(p) * (n - 1)); }); }
    return { still: function () { drawTo(n - 1); },
      play: function () { if (REDUCE) { drawTo(n - 1); return; } drawTo(0); run(); },
      replay: function () { drawTo(0); run(); } };
  };

  /* ---- board3d (09 chess: HERO animated 3D board-visitation terrain) -------
     data.boardPhases = { files:[a..h], ranks:[1..8], phases:[g0,g1,g2] } where
     each gN is an 8x8 grid (ranks 1..8 rows x files a..h cols) of raw landing
     counts for the opening / middlegame / endgame. This is the SVG+JS twin of
     the report's board_visits.gif: 64 bars projected in dimetric 3D, whose
     terrain BUILDS phase by phase (centre first, then spreads to the wings)
     while the board slowly rotates, then holds on the full terrain. Colours
     come from the sequential ramp so it flips with the host's dark theme. */
  R.board3d = function (host, fig, data) {
    var bp = data.boardPhases, P = bp.phases;                // P[0..2] = 8x8 grids
    var N = 8, s = 0.46;                                      // grid size, bar half-footprint
    // cumulative grids: opening -> +middlegame -> +endgame
    function addGrid(a, b) { return a.map(function (row, i) {
      return row.map(function (v, j) { return v + b[i][j]; }); }); }
    var C0 = P[0], C1 = addGrid(C0, P[1]), C2 = addGrid(C1, P[2]);
    var total = 0; C2.forEach(function (r) { r.forEach(function (v) { total += v; }); });
    function per1k(g) { return g.map(function (r) { return r.map(function (v) { return v / total * 1000; }); }); }
    var Z0 = per1k(C0), Z1 = per1k(C1), Z2 = per1k(C2);
    var zmaxC = 0; Z2.forEach(function (r) { r.forEach(function (v) { if (v > zmaxC) zmaxC = v; }); });
    var zmax = zmaxC * 1.05;
    // interpolated height (per-1,000) at animation time t in [0,1] — matches the
    // GIF's frame_z: three linear segments across the three phases.
    function heightAt(i, j, t) {
      var p = t * 3;
      if (p <= 1) return Z0[i][j] * p;
      if (p <= 2) return Z0[i][j] + (Z1[i][j] - Z0[i][j]) * (p - 1);
      return Z1[i][j] + (Z2[i][j] - Z1[i][j]) * Math.min(1, p - 2);
    }

    var W = 700, H = 540, CX = 350, CY = 336, SX = 40, SY = 20, MAXH = 168;
    var svg = E("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
                         preserveAspectRatio: "xMidYMid meet" });
    var gBoard = E("g"); svg.appendChild(gBoard);
    var phaseTxt = T(20, 34, "", "ds-callout", { "font-size": 15 });
    var subTxt = T(20, 52, "", "ds-tick", { "font-size": 11 });
    svg.appendChild(phaseTxt); svg.appendChild(subTxt);
    var ttl = E("title"); ttl.textContent = "Board-visitation terrain, built phase by phase";
    svg.insertBefore(ttl, svg.firstChild);
    svg.appendChild(E("desc", {}, [document.createTextNode(
      "3D bar terrain of how often each of the 64 squares is landed on across " +
      "~2,000 champion games; the d/e-file centre dominates.")]));

    var seq = seqStops();
    function darken(rgb, f) { return [Math.round(rgb[0] * f), Math.round(rgb[1] * f), Math.round(rgb[2] * f)]; }
    var CORN = [[-s, -s], [s, -s], [s, s], [-s, s]];
    // one reusable <g> per cell: floor tile + two side faces + top face
    var cells = [];
    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
      var g = E("g");
      var floor = E("polygon", { "fill-opacity": ((i + j) % 2 ? 0.10 : 0.04) });
      var faceL = E("polygon", {}), faceR = E("polygon", {}), top = E("polygon", {});
      g.appendChild(floor); g.appendChild(faceR); g.appendChild(faceL); g.appendChild(top);
      gBoard.appendChild(g);
      cells.push({ i: i, j: j, g: g, floor: floor, faceL: faceL, faceR: faceR, top: top });
    }

    // board-coordinate labels (files a–h, ranks 1–8) — overlaid above the bars,
    // repositioned each frame so they orbit with the rotating board.
    var gLabels = E("g"); svg.appendChild(gLabels);
    var fileLabels = [], rankLabels = [];
    for (var lj = 0; lj < N; lj++) {
      var tf = T(0, 0, bp.files[lj], "ds-tick", { "text-anchor": "middle", "font-size": 11 });
      gLabels.appendChild(tf); fileLabels.push(tf);
    }
    for (var li = 0; li < N; li++) {
      var tr = T(0, 0, String(bp.ranks[li]), "ds-tick", { "text-anchor": "middle", "font-size": 11 });
      gLabels.appendChild(tr); rankLabels.push(tr);
    }
    // fade labels by depth so ones that rotate to the back recede behind the terrain
    function depthOpacity(y) { return Math.max(0.15, Math.min(1, 0.2 + 0.8 * ((y - CY + 150) / 300))); }

    function pts(a) { return a.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "); }
    var PHASE = ["Opening", "+ Middlegame", "+ Endgame"];
    var PHASE_SUB = ["moves 1–12 · the centre first", "moves 13–30 · spreading out", "moves 31+ · to the wings"];

    // hp = build/height progress in [0,1]; ang = rotation angle (radians).
    // Rotation is decoupled from the build so the board can keep turning after
    // the terrain is full.
    function draw(hp, ang) {
      var co = Math.cos(ang), si = Math.sin(ang);
      function proj(fx, fy, hpx) {
        var u = fx - (N - 1) / 2, v = fy - (N - 1) / 2;
        var ru = u * co - v * si, rv = u * si + v * co;
        return [CX + (ru - rv) * SX, CY + (ru + rv) * SY - hpx];
      }
      var order = [];
      cells.forEach(function (c) {
        var z = heightAt(c.i, c.j, hp);
        var hpx = z / zmax * MAXH;
        var bc = CORN.map(function (d) { return proj(c.j + d[0], c.i + d[1], 0); });
        var tc = CORN.map(function (d) { return proj(c.j + d[0], c.i + d[1], hpx); });
        // front corner = max screen-Y at the base; its two edges face the viewer
        var F = 0; for (var k = 1; k < 4; k++) if (bc[k][1] > bc[F][1]) F = k;
        var R1 = (F + 1) % 4, L1 = (F + 3) % 4;
        var norm = Math.max(0, Math.min(1, z / (zmaxC || 1)));
        var topRgb = rampAt(seq, 0.15 + 0.85 * norm);
        c.floor.setAttribute("points", pts(bc));
        c.floor.setAttribute("fill", rgbCss(rampAt(seq, 0.5)));
        c.faceR.setAttribute("points", pts([bc[F], bc[R1], tc[R1], tc[F]]));
        c.faceR.setAttribute("fill", rgbCss(darken(topRgb, 0.78)));
        c.faceL.setAttribute("points", pts([bc[F], bc[L1], tc[L1], tc[F]]));
        c.faceL.setAttribute("fill", rgbCss(darken(topRgb, 0.6)));
        c.top.setAttribute("points", pts(tc));
        c.top.setAttribute("fill", rgbCss(topRgb));
        c.top.setAttribute("stroke", "var(--ds-panel, rgba(255,255,255,0.15))");
        c.top.setAttribute("stroke-width", "0.4");
        order.push({ g: c.g, y: proj(c.j, c.i, 0)[1] });
      });
      order.sort(function (a, b) { return a.y - b.y; });        // back (small Y) first
      order.forEach(function (o) { gBoard.appendChild(o.g); });  // painter's restack
      // labels sit just outside the footprint at floor level and orbit with ang
      fileLabels.forEach(function (t1, j) {
        var p = proj(j, 7.85, 0);
        t1.setAttribute("x", p[0].toFixed(1)); t1.setAttribute("y", (p[1] + 4).toFixed(1));
        t1.setAttribute("opacity", depthOpacity(p[1]).toFixed(2));
      });
      rankLabels.forEach(function (t2, i) {
        var p = proj(7.85, i, 0);
        t2.setAttribute("x", p[0].toFixed(1)); t2.setAttribute("y", (p[1] + 4).toFixed(1));
        t2.setAttribute("opacity", depthOpacity(p[1]).toFixed(2));
      });
      var pi = hp < 1 / 3 ? 0 : (hp < 2 / 3 ? 1 : 2);
      phaseTxt.textContent = PHASE[pi];
      subTxt.textContent = PHASE_SUB[pi];
    }

    host.appendChild(svg);
    // Continuous animation: the terrain builds over BUILD ms, then the board
    // keeps rotating indefinitely (ANG0 + OMEGA*elapsed). An elapsed accumulator
    // lets us pause/resume (off-screen) without a jump. Background tabs already
    // throttle rAF, so an IntersectionObserver is enough to stop wasted work.
    var BUILD = 5200, ANG0 = -0.42, OMEGA = 2 * Math.PI / 40000;   // ~1 turn / 40s
    var raf = null, elapsed = 0, last = null, running = false, onScreen = true;
    function frame(ts) {
      if (last == null) last = ts;
      elapsed += ts - last; last = ts;
      draw(ease(Math.min(1, elapsed / BUILD)), ANG0 + OMEGA * elapsed);
      raf = requestAnimationFrame(frame);
    }
    function start(fromZero) {
      if (fromZero) elapsed = 0;
      last = null;
      if (!running) { running = true; raf = requestAnimationFrame(frame); }
    }
    function stop() {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      last = null;
    }
    if (typeof IntersectionObserver !== "undefined") {
      new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          onScreen = e.isIntersecting;
          if (onScreen) { if (!REDUCE) start(false); } else stop();
        });
      }, { threshold: 0.05 }).observe(svg);
    }
    return {
      still: function () { stop(); draw(1, ANG0); },
      play: function () { if (REDUCE) { draw(1, ANG0); return; } start(true); },
      replay: function () { stop(); start(true); },
      _draw: function (hp, ang) { stop(); draw(hp, ang); }   // test seam: render a fixed frame
    };
  };

  /* ---- f1track (10 F1: HERO — the season as one long endurance race) --------
     The 24 real 2025 circuits are stitched into ONE polyline (data.track). Every
     driver (data.drivers[i] = {code,name,cid,color,dur[NR]}) drives all 24
     circuits in sequence; dur[k] is the animation-time to complete circuit k,
     longer the further behind that race's WINNER they finished — so the field
     strings out and distance along the course = cumulative TIME BEHIND THE RACE
     WINNERS, a race-PACE ranking (deliberately NOT the points title). A camera
     follows the pack, zooming out as the gaps widen, while dots/labels stay a
     constant size (fixed viewBox + a transformed world <g> for the track, marks
     projected on top). Holds when the pace leader finishes; driver colours come
     from the site --ds-cat-* brand palette (each team a fixed index, set in the
     data) so it flips with the theme; team-mates share a hue so the 2nd driver of
     a team gets a dark ring. Plays once, holds, replay. */
  R.f1track = function (host, fig, data) {
    var RN = data.rounds, DR = data.drivers;
    var pts = data.track.pts, segs = data.track.segments || [];
    var NR = RN.length;

    // arc length along the stitched track (world coords) -> posAt(s), s in [0,1]
    var cum = [0];
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    var total = cum[cum.length - 1] || 1;
    function posAt(s) {
      var target = Math.max(0, Math.min(1, s)) * total, lo = 0, hi = cum.length - 1;
      while (lo < hi - 1) { var m = (lo + hi) >> 1; if (cum[m] <= target) lo = m; else hi = m; }
      var seg = cum[lo + 1] - cum[lo], f = seg === 0 ? 0 : (target - cum[lo]) / seg;
      return [pts[lo][0] + (pts[lo + 1][0] - pts[lo][0]) * f,
              pts[lo][1] + (pts[lo + 1][1] - pts[lo][1]) * f];
    }
    // circuit i occupies arc-length fraction [seg0[i], seg1[i]] of the course
    var seg0 = segs.map(function (s) { return cum[s.i0] / total; });
    var seg1 = segs.map(function (s) { return cum[s.i1] / total; });
    // per-circuit tag anchor (centroid x, top y) in world coords
    var tagPos = segs.map(function (s) {
      var x = 0, top = 1e9;
      for (var k = s.i0; k <= s.i1; k++) { x += pts[k][0]; if (pts[k][1] < top) top = pts[k][1]; }
      return [x / (s.i1 - s.i0 + 1), top];
    });

    // per-driver arrival times (cumulative durations) + the leader's finish time
    DR.forEach(function (d) {
      var a = [0]; for (var k = 0; k < NR; k++) a.push(a[k] + (d.dur[k] || 1)); d._arr = a;
    });
    var T_END = Math.min.apply(null, DR.map(function (d) { return d._arr[NR]; }));
    function heroS(d, t) {                       // arc-length fraction at clock t
      var a = d._arr; if (t >= a[NR]) return 1;
      var lo = 0, hi = NR; while (lo < hi - 1) { var m = (lo + hi) >> 1; if (a[m] <= t) lo = m; else hi = m; }
      var dd = a[lo + 1] - a[lo], f = dd <= 0 ? 0 : Math.max(0, Math.min(1, (t - a[lo]) / dd));
      return seg0[lo] + f * (seg1[lo] - seg0[lo]);
    }
    function heroCircuit(d, t) {                  // which race (1-based) they're on
      var a = d._arr; if (t >= a[NR]) return NR;
      var lo = 0, hi = NR; while (lo < hi - 1) { var m = (lo + hi) >> 1; if (a[m] <= t) lo = m; else hi = m; }
      return Math.max(1, Math.min(NR, lo + 1));
    }

    var W = 760, H = 470, CAM_ASP = W / H, TOTAL_MS = 105000;   // slow, ~1:45 (tunable)
    var svg = E("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
                         preserveAspectRatio: "xMidYMid meet" });
    var ttl = E("title"); ttl.textContent = "The 2025 F1 season as one long endurance race";
    svg.appendChild(ttl);
    svg.appendChild(E("desc", {}, [document.createTextNode(
      "Every driver drives all 24 stitched circuits in turn; the camera follows the "
      + "field as it strings out by cumulative time behind each race's winner.")]));

    // clip everything to the panel so the zoomed-out track can't bleed past the frame
    R.f1track._n = (R.f1track._n || 0) + 1;
    var clipId = "ds-f1clip-" + R.f1track._n;
    var defs = E("defs"), cpp = E("clipPath", { id: clipId });
    cpp.appendChild(E("rect", { x: 0, y: 0, width: W, height: H }));
    defs.appendChild(cpp); svg.appendChild(defs);
    var root = E("g", { "clip-path": "url(#" + clipId + ")" }); svg.appendChild(root);

    // world layer: the stitched track (transformed each frame; stroke counter-scaled)
    var world = E("g");
    var trackD = "M" + pts.map(function (p) { return p[0].toFixed(4) + "," + p[1].toFixed(4); }).join("L");
    var trackPath = E("path", { d: trackD, fill: "none", stroke: "var(--ds-label)",
      "stroke-opacity": 0.32, "stroke-linecap": "round", "stroke-linejoin": "round" });
    world.appendChild(trackPath); root.appendChild(world);

    // overlay marks (screen coords, constant size): circuit tags, dots, labels, readout
    var tags = tagPos.map(function (_, i) {
      var t = T(0, 0, "" + segs[i].round, "ds-tick",
        { "text-anchor": "middle", "font-size": 8, "fill-opacity": 0.55 });
      root.appendChild(t); return t;
    });
    var seen = {}, dots = DR.map(function (d) {
      var n = seen[d.cid] || 0; seen[d.cid] = n + 1;
      var c = E("circle", { r: 6, fill: d.color,
        stroke: n ? "var(--ds-title)" : "var(--ds-surface)", "stroke-width": n ? 1.6 : 0.9 });
      root.appendChild(c); return c;
    });
    // label EVERY driver, at its dot (labels may overlap while the field is
    // bunched early, and separate as it strings out over the season)
    var labels = DR.map(function (d) {
      var lb = T(0, 0, d.name, "ds-datalabel", { "font-size": 9, "font-weight": 700, fill: d.color });
      root.appendChild(lb); return lb;
    });
    var readout = T(14, 22, "", "ds-callout", { "font-size": 15, "font-weight": 700 });
    var subread = T(14, 40, "", "ds-tick", { "font-size": 10.5 });
    root.appendChild(readout); root.appendChild(subread);

    host.appendChild(svg);

    // camera: eased {cx,cy,hw} in world units; world→screen is an affine matrix.
    var cam = null, MIN_HW = 0.14, PAD = 1.12;
    function drawAt(t, ease) {
      var P = DR.map(function (d) { return posAt(heroS(d, t)); });
      var xmin = 1e9, ymin = 1e9, xmax = -1e9, ymax = -1e9;
      P.forEach(function (p) {
        if (p[0] < xmin) xmin = p[0]; if (p[0] > xmax) xmax = p[0];
        if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1];
      });
      var tcx = (xmin + xmax) / 2, tcy = (ymin + ymax) / 2;
      var thw = Math.max((xmax - xmin) / 2 * PAD, (ymax - ymin) / 2 * PAD * CAM_ASP, MIN_HW);
      if (!cam || !ease) { cam = { cx: tcx, cy: tcy, hw: thw }; }
      else { var e = 0.08; cam.cx += (tcx - cam.cx) * e; cam.cy += (tcy - cam.cy) * e; cam.hw += (thw - cam.hw) * e; }
      var k = (W / 2) / cam.hw, tx = W / 2 - cam.cx * k, ty = H / 2 + cam.cy * k;   // y flipped
      world.setAttribute("transform", "matrix(" + k + " 0 0 " + (-k) + " " + tx + " " + ty + ")");
      trackPath.setAttribute("stroke-width", (1.5 / k).toFixed(4));
      function proj(w) { return [k * w[0] + tx, -k * w[1] + ty]; }
      // circuit round tags (projected; hidden when off-screen)
      tags.forEach(function (tg, idx) {
        var p = proj(tagPos[idx]);
        if (p[0] < 8 || p[0] > W - 8 || p[1] < 54 || p[1] > H - 6) { tg.setAttribute("opacity", 0); return; }
        tg.setAttribute("opacity", 1);
        tg.setAttribute("x", p[0].toFixed(1)); tg.setAttribute("y", (p[1] - 6).toFixed(1));
      });
      var scr = P.map(proj);
      dots.forEach(function (c, idx) { c.setAttribute("cx", scr[idx][0].toFixed(1)); c.setAttribute("cy", scr[idx][1].toFixed(1)); });
      // reposition every driver's name label at its dot; track the pace leader
      var leadIdx = 0;
      labels.forEach(function (lab, idx) {
        lab.setAttribute("x", Math.max(6, Math.min(W - 48, scr[idx][0] + 8)).toFixed(1));
        lab.setAttribute("y", Math.max(56, Math.min(H - 6, scr[idx][1] + 3.2)).toFixed(1));
        if (heroS(DR[idx], t) > heroS(DR[leadIdx], t)) leadIdx = idx;
      });
      var lead = DR[leadIdx], ci = heroCircuit(lead, t);
      readout.textContent = "Pace leader on race " + ci + "/" + NR + " — " + RN[ci - 1].name;
      subread.textContent = "Leading on pace: " + lead.name
        + "  ·  the field strung out by time behind the race winners";
    }

    var ctl = null;
    function run() { if (ctl) ctl.cancel(); cam = null;      // reset zoom to circuit 1
      ctl = ticker(TOTAL_MS, function (p) { drawAt(p * T_END, true); },
        function () { drawAt(T_END, true); }); }
    return {
      still: function () { if (ctl) ctl.cancel(); drawAt(T_END, false); },   // snap to full spread
      play: function () { if (REDUCE) { drawAt(T_END, false); return; } run(); },
      replay: function () { run(); },
      _seek: function (frac) { if (ctl) ctl.cancel(); drawAt(frac * T_END, false); }  // debug/QA
    };
  };

  /* =====================================================================
     controller
     ===================================================================== */
  function setup(fig, opts) {
    opts = opts || {};
    if (fig._dsDone && !opts.force) return;
    fig._dsDone = true;
    var proj = fig.dataset.project, type = fig.dataset.chart;
    var data = (window.DS_SIDE || {})[proj];
    var host = fig.querySelector(".ds-chart") || fig.appendChild(H("div", "ds-chart"));
    if (fig._dsIO) { fig._dsIO.disconnect(); fig._dsIO = null; }
    host.textContent = "";                         // clear (supports re-render)
    if (!data || !R[type]) { host.appendChild(H("p", "ds-figure__source", "· data unavailable ·")); return; }
    var inst;
    try { inst = R[type](host, fig, data); }
    catch (err) { host.appendChild(H("p", "ds-figure__source", "· render error: " + err.message + " ·")); throw err; }
    fig._dsInst = inst;
    if (inst.replay && !REDUCE) {                  // replay control for hero charts
      var btn = H("button", "ds-replay", "↻ Replay");
      btn.type = "button";
      btn.addEventListener("click", function () { inst.replay(); });
      host.appendChild(btn);
    }
    if (inst.still) inst.still();                  // final frame now (no-JS / reduced-motion correct)
    if (REDUCE || opts.noPlay) return;             // re-renders (theme flips) skip the entrance
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(fig); inst.play(); } });
    }, { threshold: 0.35 });
    fig._dsIO = io; io.observe(fig);
  }

  function mount(root) {
    (root || document).querySelectorAll("[data-ds-chart]").forEach(function (f) { setup(f); });
  }

  // Cancel any pending scroll-in observers for figures in `root`. Callers that are
  // about to re-show a subtree call this FIRST (while it's still animating/off-screen)
  // so a stale one-shot observer can't fire mid-transition, then call replay() once
  // the subtree has settled.
  function reset(root) {
    (root || document).querySelectorAll("[data-ds-chart]").forEach(function (f) {
      if (f._dsIO) { f._dsIO.disconnect(); f._dsIO = null; }
    });
  }

  // Replay the scroll-in entrance for already-mounted figures in `root`. The initial
  // observer is one-shot, so a figure otherwise animates only once; the portfolio's
  // project "planes" call this each time a plane is shown (open or prev/next) so the
  // hero chart re-runs from the start, like the planes' other entrance animations.
  // Figures already in the viewport play immediately (deterministic — no dependency
  // on catching a transform transition); off-screen ones re-arm a one-shot observer
  // to play when scrolled into view.
  function replay(root) {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var vw = window.innerWidth || document.documentElement.clientWidth;
    (root || document).querySelectorAll("[data-ds-chart]").forEach(function (f) {
      var inst = f._dsInst;
      if (!inst) { setup(f); return; }            // never mounted → normal setup
      if (!inst.play) { if (inst.still) inst.still(); return; }  // static chart, nothing to replay
      if (REDUCE) { inst.still(); return; }        // reduced motion → hold final frame, no anim
      if (f._dsIO) { f._dsIO.disconnect(); f._dsIO = null; }
      var r = f.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) { inst.play(); return; }  // in view now
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(f); inst.play(); } });
      }, { threshold: 0.35 });
      f._dsIO = io; io.observe(f);
    });
  }

  // Live theme flips: colours resolved to real RGB (heatmaps) must be recomputed,
  // so re-render every chart to its final frame when [data-theme] changes.
  var _themeTimer = null;
  new MutationObserver(function (muts) {
    if (!muts.some(function (m) { return m.attributeName === "data-theme"; })) return;
    clearTimeout(_themeTimer);
    _themeTimer = setTimeout(function () {
      document.querySelectorAll("[data-ds-chart]").forEach(function (f) { setup(f, { force: true, noPlay: true }); });
    }, 30);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  window.DSCharts = { mount: mount, reset: reset, replay: replay, render: setup, registry: R };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () { mount(); });
  else mount();
})();
