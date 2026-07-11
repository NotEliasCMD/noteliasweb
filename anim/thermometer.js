/*
 * thermometer — a classic bulb-and-tube thermometer whose mercury rises and
 * falls with a live, scrolling temperature time-series. Tick scale, shimmering
 * shaded column and a ticking 'deg C' readout with lo/hi trackers.
 */
ASCII.register({
  id: 'thermometer',
  title: 'Thermometer',
  description: 'A bulb-and-tube thermometer whose shaded mercury tracks a scrolling temperature time-series, with a tick scale and a live deg C readout.',
  cols: 46, rows: 28, fps: 16,
  create: function (cols, rows) {
    var ramp = ASCII.util.LUMINANCE;   // '.,-~:;=!*#$@'  dim -> bright
    var util = ASCII.util;
    var TAU = util.TAU;

    var DEG_MIN = -10;                 // bottom of the scale
    var DEG_MAX = 42;                  // top of the scale
    var RANGE = DEG_MAX - DEG_MIN;

    // Normalized (0..1) temperature for a given integer sample index.
    // Deterministic so the scrolling history stays coherent at every size.
    function tempAt(n) {
      var s = n * 0.11;
      var v = 0.52
            + 0.30 * Math.sin(s)
            + 0.13 * Math.sin(s * 0.41 + 2.0)
            + 0.06 * Math.sin(s * 1.7 + 0.5);
      v += (util.noise2(n * 0.05, 3.7) - 0.5) * 0.12;
      return util.clamp(v, 0.02, 0.98);
    }

    function shadeChar(b) {
      var idx = (b * (ramp.length - 1) + 0.5) | 0;
      if (idx < 0) idx = 0;
      if (idx > ramp.length - 1) idx = ramp.length - 1;
      return ramp[idx];
    }

    // "+23.4" style label from a normalized value.
    function fmtDeg(v) {
      var d = DEG_MIN + v * RANGE;
      var sign = d >= 0 ? '+' : '-';
      return sign + Math.abs(d).toFixed(1);
    }

    return function frame(screen, t, frameCount) {
      var W = screen.cols, H = screen.rows;

      // ---- layout (all derived from W/H so it survives every grid size) --
      var gutter = 4;                          // left area for scale numbers
      if (gutter > W - 6) gutter = W - 6;
      if (gutter < 0) gutter = 0;

      var tubeX = gutter + 1;
      var wallL = tubeX - 1, wallR = tubeX + 1;

      var bulbR = Math.max(1, Math.min(2, Math.floor(H / 10)));
      var bulbCX = tubeX;
      var bulbCY = H - 2 - bulbR;
      var capY = 1;                            // rounded top cap row
      var tubeBottomY = bulbCY - bulbR;        // where the column meets the bulb
      if (tubeBottomY < capY + 2) tubeBottomY = capY + 2;
      var tubeTop = capY + 1;                  // first inner tube row

      // ---- current reading + windowed lo/hi over the visible history -----
      var head = frameCount;                   // newest sample index
      var vNow = tempAt(head);

      // ---- graph geometry ------------------------------------------------
      var gx = tubeX + bulbR + 3;              // graph left edge, clear of bulb
      if (gx < wallR + 2) gx = wallR + 2;
      var gyTop = 1;
      var gyBot = H - 2;
      if (gyBot < gyTop) gyBot = gyTop;
      var gw = W - gx - 1;
      if (gw < 0) gw = 0;
      var gh = gyBot - gyTop;
      if (gh < 1) gh = 1;

      // Sample the visible window, track lo/hi.
      var ys = [];
      var loV = 1, hiV = 0;
      for (var i = 0; i < gw; i++) {
        var n = head - (gw - 1 - i);
        var v = tempAt(n);
        if (v < loV) loV = v;
        if (v > hiV) hiV = v;
        var gy = Math.round(util.lerp(gyBot, gyTop, v));
        if (gy < gyTop) gy = gyTop;
        if (gy > gyBot) gy = gyBot;
        ys.push(gy);
      }
      if (gw === 0) { loV = vNow; hiV = vNow; }

      // ---- thermometer: cap, walls -------------------------------------
      screen.set(tubeX, capY, '_');
      for (var y = tubeTop; y <= tubeBottomY; y++) {
        screen.set(wallL, y, '|');
        screen.set(wallR, y, '|');
      }

      // Mercury level for the current reading (higher v -> higher up).
      var mercY = Math.round(util.lerp(tubeBottomY, tubeTop, vNow));
      if (mercY < tubeTop) mercY = tubeTop;
      if (mercY > tubeBottomY) mercY = tubeBottomY;

      // Shaded, shimmering mercury column from the level down to the bulb.
      var span = (tubeBottomY - tubeTop) || 1;
      for (var my = mercY; my <= tubeBottomY; my++) {
        var frac = (tubeBottomY - my) / span;        // 0 at bulb .. 1 near cap
        var b = 0.45 + vNow * 0.55 - frac * 0.18
              + 0.09 * Math.sin(t * 4 + my * 0.7);
        var ch = shadeChar(util.clamp(b, 0.08, 0.99));
        if (my === mercY) ch = '~';                  // meniscus at the top
        screen.set(tubeX, my, ch);
      }

      // ---- bulb: a bright, gently pulsing reservoir --------------------
      for (var by = -bulbR; by <= bulbR; by++) {
        for (var bx = -bulbR - 1; bx <= bulbR + 1; bx++) {
          var ex = bx / 1.7;
          if (ex * ex + by * by <= bulbR * bulbR + 0.5) {
            var edge = (ex * ex + by * by) / (bulbR * bulbR + 0.5);
            var bb = 0.55 + vNow * 0.45 - edge * 0.35
                   + 0.06 * Math.sin(t * 3.0);
            screen.set(bulbCX + bx, bulbCY + by,
                       edge > 0.75 ? '(' : shadeChar(util.clamp(bb, 0.2, 0.99)));
          }
        }
      }
      // Clean rounded bulb sides.
      screen.set(bulbCX - bulbR - 1, bulbCY, '(');
      screen.set(bulbCX + bulbR + 1, bulbCY, ')');

      // ---- tick scale + numeric labels in the gutter -------------------
      for (var T = DEG_MIN; T <= DEG_MAX; T += 10) {
        var tv = (T - DEG_MIN) / RANGE;
        var ty = Math.round(util.lerp(tubeBottomY, tubeTop, tv));
        if (ty < tubeTop || ty > tubeBottomY) continue;
        screen.set(wallL - 1, ty, '-');            // tick pointing at the tube
        var lbl = String(T);
        var lx = wallL - 2 - lbl.length + 1;       // right-align near the wall
        if (lx >= 0) screen.text(lx, ty, lbl);
      }

      // Level pointer next to the current mercury height.
      screen.set(wallR + 1, mercY, '>');

      // ---- scrolling temperature trend line ----------------------------
      if (gw > 0) {
        // faint mean baseline across the plot
        var midY = Math.round(util.lerp(gyBot, gyTop, 0.5));
        for (var mx = 0; mx < gw; mx++) {
          if (mx % 2 === 0 && screen.get(gx + mx, midY) === ' ') {
            screen.set(gx + mx, midY, '.');
          }
        }
        // connect consecutive samples so it reads as a live trace
        var prevY = ys[0];
        for (var xi = 0; xi < gw; xi++) {
          var cy = ys[xi];
          screen.line(gx + xi - (xi > 0 ? 1 : 0),
                      xi > 0 ? prevY : cy,
                      gx + xi, cy, '*');
          prevY = cy;
        }
        // newest sample marker (rightmost), pulses between O and 0
        var mk = (Math.floor(t * 4) % 2 === 0) ? 'O' : '0';
        screen.set(gx + gw - 1, ys[gw - 1], mk);
      }

      // ---- title + live readout (top row) ------------------------------
      screen.text(0, 0, 'THERMOMETER'.slice(0, Math.max(0, W)));
      var read = fmtDeg(vNow) + 'C';
      var rx = W - read.length;
      if (rx < 0) rx = 0;
      screen.text(rx, 0, read.slice(0, W));

      // ---- bottom status line: lo / hi / now + trend arrow -------------
      var trend = vNow - tempAt(head - 3);
      var arrow = trend > 0.01 ? '^' : (trend < -0.01 ? 'v' : '=');
      var status = 'lo' + fmtDeg(loV) + ' hi' + fmtDeg(hiV)
                 + ' now' + fmtDeg(vNow) + arrow;
      screen.text(0, H - 1, status.slice(0, Math.max(0, W)));
    };
  }
});
