/*
 * riskcurve — a bell-shaped risk/probability distribution shaded with the
 * luminance ramp. A vertical premium marker sweeps across the curve; where it
 * lands drives a live premium '$' readout that climbs in the fat tails.
 * Standard-deviation ticks run along the bottom axis.
 */
ASCII.register({
  id: 'riskcurve',
  title: 'Risk Curve',
  description: 'A bell-shaped risk distribution with a sweeping premium marker and a live tail-priced $ readout.',
  cols: 60, rows: 26, fps: 16,
  create: function (cols, rows) {
    var util = ASCII.util;
    var ramp = util.LUMINANCE;              // '.,-~:;=!*#$@' dim -> bright
    var ZMAX = 3.2;                          // horizontal span in std-devs
    var BASE_PREM = 480;                     // premium at the mean
    var PREM_K = 165;                        // per z^2 loading (tails cost more)

    function fmtZ(z) { return (z >= 0 ? '+' : '') + z.toFixed(2); }

    return function frame(screen, t, frameCount) {
      // ---- layout derived entirely from the passed grid size -------------
      var topPad = 2;
      var axisRow = rows - 3;                // baseline of the plot
      if (axisRow <= topPad + 1) axisRow = rows - 1, topPad = 0;
      var labelRow = axisRow + 1;
      var capRow = rows - 1;
      var plotH = axisRow - topPad;
      if (plotH < 1) plotH = 1;

      var xL = 2;
      var xR = cols - 2;
      if (xR <= xL) { xL = 0; xR = cols - 1; }
      var span = (xR - xL) || 1;

      var full = cols >= 44;                 // room for word labels?
      var mid = cols >= 30;

      // ---- animated distribution shape -----------------------------------
      // The spread breathes slightly over time so the fill shimmers.
      var breathe = 1 + 0.10 * Math.sin(t * 0.7);
      var effZmax = ZMAX * breathe;

      // ---- sweeping premium marker ---------------------------------------
      var mfrac = 0.5 + 0.46 * Math.sin(t * 0.55);
      var mx = Math.round(xL + mfrac * span);
      if (mx < xL) mx = xL; if (mx > xR) mx = xR;
      var mz = ((mx - xL) / span * 2 - 1) * effZmax;
      var mDens = Math.exp(-mz * mz / 2);
      var premium = Math.round(BASE_PREM + PREM_K * mz * mz);
      var absz = Math.abs(mz);
      var band = absz < 1 ? 'CORE' : absz < 2 ? 'WATCH' : 'TAIL';

      // ---- fill the area under the bell curve ----------------------------
      for (var x = xL; x <= xR; x++) {
        var frac = (x - xL) / span;
        var z = (frac * 2 - 1) * effZmax;
        var d = Math.exp(-z * z / 2);        // 0..1 density
        var topY = axisRow - Math.round(d * plotH);
        if (topY >= axisRow) continue;        // negligible density -> tail floor
        var isMark = (x === mx);
        for (var y = topY; y < axisRow; y++) {
          var fy = plotH > 1 ? (y - topY) / (axisRow - 1 - topY || 1) : 0;
          // brighter near the curve's crest, softly dimming toward baseline
          var b = d * (0.45 + 0.55 * (1 - fy * 0.65));
          // gentle deterministic shimmer so the fill is alive
          b *= 0.9 + 0.1 * util.noise2(x * 0.6, y * 0.6 + t * 1.3);
          if (isMark) b = Math.min(1, b + 0.25);
          screen.set(x, y, screen.shade(util.clamp(b, 0, 1), ramp));
        }
        // crest glyph traces the bell outline
        var oc = d > 0.66 ? '@' : d > 0.33 ? '*' : '+';
        screen.set(x, topY, oc);
      }

      // ---- axes ----------------------------------------------------------
      for (var ax = xL - 1; ax <= xR; ax++) {
        if (screen.get(ax, axisRow) === ' ') screen.set(ax, axisRow, '-');
      }
      for (var ay = topPad; ay < axisRow; ay++) {
        if (screen.get(xL - 1, ay) === ' ') screen.set(xL - 1, ay, '|');
      }
      screen.set(xL - 1, axisRow, '+');

      // ---- standard-deviation ticks + labels -----------------------------
      var zt;
      for (zt = -3; zt <= 3; zt++) {
        var tx = Math.round(xL + ((zt / ZMAX) * 0.5 + 0.5) * span);
        if (tx < xL || tx > xR) continue;
        screen.set(tx, axisRow, zt === 0 ? '+' : '\'');
        if (mid && labelRow < rows) {
          var s = zt === 0 ? '0' : (zt > 0 ? '+' + zt : String(zt));
          var sx = tx - Math.floor((s.length - 1) / 2);
          screen.text(sx, labelRow, s);
        }
      }
      if (full && capRow > labelRow) {
        var cap = 'std deviations (sigma)';
        screen.text(Math.floor((cols - cap.length) / 2), capRow, cap);
      }

      // ---- sweeping marker line ------------------------------------------
      for (var my = topPad; my <= axisRow; my++) {
        var cur = screen.get(mx, my);
        screen.set(mx, my, my === axisRow ? '^' : (cur === ' ' || cur === '.' ? ':' : '|'));
      }
      // marker head sits where the line meets the curve crest
      var headY = axisRow - Math.round(mDens * plotH);
      if (headY < topPad) headY = topPad;
      screen.set(mx, headY, 'O');

      // ---- live data readouts (the "data science" motif) -----------------
      if (full) {
        screen.text(1, 0, 'RISK CURVE');
        var pStr = 'PREMIUM $' + premium;
        screen.text(cols - 1 - pStr.length, 0, pStr);
        var info = 'z=' + fmtZ(mz) + '  p=' + mDens.toFixed(3) + '  ' + band;
        screen.text(1, 1, info);
      } else if (mid) {
        screen.text(1, 0, '$' + premium);
        var zStr = 'z=' + fmtZ(mz);
        screen.text(cols - 1 - zStr.length, 0, zStr);
      } else {
        var tiny = '$' + premium;
        screen.text(Math.max(0, cols - tiny.length), 0, tiny);
      }
    };
  }
});
