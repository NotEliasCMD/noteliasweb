/*
 * ascii.js — a tiny terminal/ASCII animation engine.
 *
 * Style reference: Andy Sloane's spinning ASCII donut
 *   https://www.a1k0n.net/2011/07/20/donut-math.html
 *
 * Everything is rendered as monospace characters into a <pre> grid,
 * white text on a black background. Each animation writes into a
 * Screen (a 2D character buffer, with an optional z-buffer for the
 * 3D pieces) and the engine paints that buffer to the DOM every frame.
 *
 * The whole thing is a single classic <script> (no modules, no build
 * step) so any animation can be dropped onto a plain static webpage:
 *
 *   <pre id="stage"></pre>
 *   <script src="engine/ascii.js"></script>
 *   <script src="animations/donut.js"></script>
 *   <script>ASCII.mount(document.getElementById('stage'), 'donut');</script>
 */
(function (global) {
  'use strict';

  // Luminance ramp, dim -> bright. This is the exact ramp from the
  // donut article; most brightness-based effects reuse it.
  var LUMINANCE = '.,-~:;=!*#$@';

  /**
   * A character screen: a flat array of `cols*rows` characters plus a
   * matching z-buffer for depth-tested 3D plotting.
   */
  function Screen(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.size = cols * rows;
    this.buffer = new Array(this.size);
    this.zbuffer = new Float32Array(this.size);
    this.clear();
  }

  Screen.prototype.clear = function (ch) {
    var c = ch || ' ';
    for (var i = 0; i < this.size; i++) {
      this.buffer[i] = c;
      this.zbuffer[i] = 0;
    }
  };

  // Plot a character at integer (x,y) with no depth test.
  Screen.prototype.set = function (x, y, ch) {
    x = x | 0;
    y = y | 0;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.buffer[y * this.cols + x] = ch;
  };

  Screen.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return ' ';
    return this.buffer[y * this.cols + x];
  };

  // Depth-tested plot: only draw if `ooz` (one-over-z) is nearer than
  // whatever is already there. This is the donut's z-buffer trick.
  Screen.prototype.plot = function (x, y, ooz, ch) {
    x = x | 0;
    y = y | 0;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    var idx = y * this.cols + x;
    if (ooz > this.zbuffer[idx]) {
      this.zbuffer[idx] = ooz;
      this.buffer[idx] = ch;
    }
  };

  // Map a 0..1 brightness to a ramp character.
  Screen.prototype.shade = function (b, ramp) {
    ramp = ramp || LUMINANCE;
    if (b <= 0) return ramp[0];
    if (b >= 1) return ramp[ramp.length - 1];
    return ramp[(b * (ramp.length - 1)) | 0];
  };

  // Write a horizontal string starting at (x,y). Spaces are drawn too
  // so callers can use them to erase.
  Screen.prototype.text = function (x, y, str) {
    for (var i = 0; i < str.length; i++) this.set(x + i, y, str[i]);
  };

  // Bresenham line, useful for wireframes and vector effects.
  Screen.prototype.line = function (x0, y0, x1, y1, ch) {
    x0 = x0 | 0; y0 = y0 | 0; x1 = x1 | 0; y1 = y1 | 0;
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy, e2;
    for (;;) {
      this.set(x0, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  Screen.prototype.toString = function () {
    var out = '';
    var b = this.buffer, cols = this.cols, rows = this.rows;
    for (var y = 0; y < rows; y++) {
      var start = y * cols;
      // Build the row with a slice+join — fast and avoids per-char concat.
      out += b.slice(start, start + cols).join('') + (y < rows - 1 ? '\n' : '');
    }
    return out;
  };

  // ---- registry ----------------------------------------------------

  var registry = [];
  var byId = {};

  /**
   * Register an animation.
   *   spec = {
   *     id, title, description,
   *     cols, rows,           // preferred grid size
   *     fps,                  // preferred frame rate (default 30)
   *     create(cols, rows)    // -> function frame(screen, t, frameCount)
   *   }
   */
  function register(spec) {
    if (!spec || !spec.id || typeof spec.create !== 'function') {
      throw new Error('ASCII.register: spec needs { id, create }');
    }
    if (byId[spec.id]) throw new Error('ASCII.register: duplicate id "' + spec.id + '"');
    spec.cols = spec.cols || 80;
    spec.rows = spec.rows || 24;
    spec.fps = spec.fps || 30;
    spec.title = spec.title || spec.id;
    spec.description = spec.description || '';
    registry.push(spec);
    byId[spec.id] = spec;
    return spec;
  }

  // ---- player -------------------------------------------------------

  /**
   * Mount an animation into a <pre> (or any element) and start it.
   * Returns a controller: { stop, start, running, spec }.
   *
   * opts: { cols, rows, fps, autostart(=true), scale }
   */
  function mount(el, idOrSpec, opts) {
    opts = opts || {};
    var spec = typeof idOrSpec === 'string' ? byId[idOrSpec] : idOrSpec;
    if (!spec) throw new Error('ASCII.mount: unknown animation "' + idOrSpec + '"');

    var cols = opts.cols || spec.cols;
    var rows = opts.rows || spec.rows;
    var fps = opts.fps || spec.fps;
    var interval = 1000 / fps;

    // Make the target look like a terminal.
    el.textContent = '';
    el.classList.add('ascii-screen');
    el.style.whiteSpace = 'pre';
    el.style.fontFamily = el.style.fontFamily || 'monospace';

    var screen = new Screen(cols, rows);
    var frame = spec.create(cols, rows);
    if (typeof frame !== 'function') {
      throw new Error('ASCII animation "' + spec.id + '" create() must return a frame function');
    }

    var running = false;
    var rafId = null;
    var startTime = 0;
    var lastPaint = 0;
    var frameCount = 0;

    function loop(now) {
      if (!running) return;
      rafId = global.requestAnimationFrame(loop);
      if (now - lastPaint < interval) return;
      lastPaint = now;
      var t = (now - startTime) / 1000; // seconds since start
      screen.clear();
      frame(screen, t, frameCount);
      el.textContent = screen.toString();
      frameCount++;
    }

    var ctrl = {
      spec: spec,
      screen: screen,
      get running() { return running; },
      start: function () {
        if (running) return ctrl;
        running = true;
        startTime = performance.now() - frameCount * interval;
        lastPaint = 0;
        rafId = global.requestAnimationFrame(loop);
        return ctrl;
      },
      stop: function () {
        running = false;
        if (rafId != null) global.cancelAnimationFrame(rafId);
        rafId = null;
        return ctrl;
      },
      resize: function (c, r) {
        cols = c; rows = r;
        screen = new Screen(cols, rows);
        frame = spec.create(cols, rows);
        ctrl.screen = screen;
      }
    };

    if (opts.autostart !== false) ctrl.start();
    return ctrl;
  }

  // ---- small shared math helpers ------------------------------------

  var util = {
    LUMINANCE: LUMINANCE,
    TAU: Math.PI * 2,
    clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    // Cheap, deterministic value-noise-ish hash in [0,1).
    hash: function (x, y) {
      var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    },
    // Smooth 2D value noise built on the hash above.
    noise2: function (x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf);
      var v = yf * yf * (3 - 2 * yf);
      var a = util.hash(xi, yi), b = util.hash(xi + 1, yi);
      var c = util.hash(xi, yi + 1), d = util.hash(xi + 1, yi + 1);
      return util.lerp(util.lerp(a, b, u), util.lerp(c, d, u), v);
    }
  };

  global.ASCII = {
    Screen: Screen,
    register: register,
    mount: mount,
    get animations() { return registry.slice(); },
    byId: function (id) { return byId[id]; },
    util: util,
    LUMINANCE: LUMINANCE
  };
})(typeof window !== 'undefined' ? window : this);
