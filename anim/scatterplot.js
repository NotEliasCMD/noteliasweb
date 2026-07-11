/*
 * scatterplot — a live scatter plot: points stream in and drift from a
 * random cloud into two clusters, a best-fit regression line is redrawn
 * through them every frame, and an 'r =' correlation plus a growing
 * point-count tick along the top. Axes with '+' tick marks frame it.
 */
ASCII.register({
  id: 'scatterplot',
  title: 'Scatter Plot',
  description: 'Points drift into two clusters while a best-fit line, correlation r and a growing point count update live.',
  cols: 60, rows: 26, fps: 14,
  create: function (cols, rows) {
    var util = ASCII.util;
    var TAU = util.TAU;
    var clamp = util.clamp;
    var lerp = util.lerp;
    var hash = util.hash;

    // How many points can ever appear — scales with the drawable area.
    var nMax = clamp(Math.round((cols * rows) / 9), 10, 140);

    // Two cluster centres in normalized [0,1] data space, arranged on a
    // diagonal so the emergent correlation is positive.
    var C = [
      { x: 0.28, y: 0.30 },
      { x: 0.70, y: 0.72 }
    ];
    var clusterR = 0.12;

    // One-time per-point setup: where it starts (scattered), where it
    // belongs (its cluster), and its personal drift wobble.
    var pts = [];
    for (var i = 0; i < nMax; i++) {
      var cl = i % 2;
      var ang = hash(i + 1, 3.1) * TAU;
      var rr = Math.sqrt(hash(i + 1, 7.7)) * clusterR;
      pts.push({
        cl: cl,
        // scattered origin, spread across the whole field
        sx: 0.06 + hash(i + 1, 1.3) * 0.88,
        sy: 0.06 + hash(i + 1, 2.9) * 0.88,
        // clustered target
        tx: clamp(C[cl].x + Math.cos(ang) * rr, 0.05, 0.95),
        ty: clamp(C[cl].y + Math.sin(ang) * rr * 0.9, 0.05, 0.95),
        // wobble
        phx: hash(i + 1, 5.2) * TAU,
        phy: hash(i + 1, 8.4) * TAU,
        fr: 0.5 + hash(i + 1, 9.1) * 0.9,
        am: 0.010 + hash(i + 1, 4.6) * 0.020
      });
    }

    var CYCLE = 16; // seconds for one scatter -> cluster -> reset loop

    function smooth(u) { return u * u * (3 - 2 * u); }

    return function frame(screen, t, frameCount) {
      // ---- layout (all derived from the passed grid size) ------------
      var mLeft = clamp(Math.floor(cols * 0.08), 2, 5);
      var axisRow = rows - 2;                 // x-axis row
      var topRow = 0;                         // readout row
      var plotTop = topRow + 1;               // first plottable row
      var plotLeft = mLeft + 1;               // first plottable col
      var plotRight = cols - 2;               // last plottable col
      var plotW = plotRight - plotLeft;       // width in cells
      var plotH = axisRow - 1 - plotTop;      // height in cells

      var havePlot = plotW > 1 && plotH > 1 && axisRow > plotTop;

      // ---- cycle progression -----------------------------------------
      var prog = (t % CYCLE) / CYCLE;         // 0..1 repeating
      var conv = smooth(prog);                // scatter -> clustered
      var reveal = clamp(0.15 + prog * 1.05, 0, 1);
      var nVis = clamp(Math.round(3 + reveal * (nMax - 3)), 1, nMax);

      // ---- compute live positions + running stats --------------------
      var sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
      var dx = new Float64Array(nVis);
      var dy = new Float64Array(nVis);
      for (var k = 0; k < nVis; k++) {
        var p = pts[k];
        var x = lerp(p.sx, p.tx, conv) + Math.sin(t * p.fr + p.phx) * p.am;
        var y = lerp(p.sy, p.ty, conv) + Math.cos(t * p.fr + p.phy) * p.am;
        x = clamp(x, 0.02, 0.98);
        y = clamp(y, 0.02, 0.98);
        dx[k] = x; dy[k] = y;
        sumX += x; sumY += y; sumXX += x * x; sumYY += y * y; sumXY += x * y;
      }
      var n = nVis;
      var mx = sumX / n, my = sumY / n;
      var covXY = sumXY / n - mx * my;
      var varX = sumXX / n - mx * mx;
      var varY = sumYY / n - my * my;
      var haveFit = n >= 2 && varX > 1e-6 && varY > 1e-6;
      var slope = haveFit ? covXY / varX : 0;
      var icept = my - slope * mx;
      var r = haveFit ? covXY / Math.sqrt(varX * varY) : 0;

      // ---- helpers to map data space -> screen cells -----------------
      function px(x) { return plotLeft + Math.round(x * plotW); }
      function py(y) { return axisRow - 1 - Math.round(y * plotH); }

      if (havePlot) {
        // faint grid dots
        var gstepX = Math.max(4, Math.round(plotW / 6));
        var gstepY = Math.max(3, Math.round(plotH / 4));
        for (var gy = plotTop; gy <= axisRow - 1; gy += gstepY) {
          for (var gx = plotLeft; gx <= plotRight; gx += gstepX) {
            if (screen.get(gx, gy) === ' ') screen.set(gx, gy, '.');
          }
        }

        // best-fit regression line, drawn across the visible x-range
        if (haveFit) {
          var xa = 0.03, xb = 0.97;
          var ya = clamp(icept + slope * xa, 0, 1);
          var yb = clamp(icept + slope * xb, 0, 1);
          var ax = px(xa), ay = py(ya), bx = px(xb), by = py(yb);
          var adx = Math.abs(bx - ax), ady = Math.abs(by - ay);
          var lch = ady <= adx * 0.4 ? '-'
                  : adx <= ady * 0.4 ? '|'
                  : (by - ay) * (bx - ax) < 0 ? '/' : '\\';
          screen.line(ax, ay, bx, by, lch);
        }

        // the points themselves (drawn on top; overplot -> '#')
        for (var j = 0; j < nVis; j++) {
          var gxp = px(dx[j]);
          var gyp = py(dy[j]);
          var cur = screen.get(gxp, gyp);
          var glyph = pts[j].cl === 0 ? 'o' : '*';
          if (cur === 'o' || cur === '*' || cur === '#') glyph = '#';
          screen.set(gxp, gyp, glyph);
        }
      }

      // ---- axes with tick marks --------------------------------------
      if (axisRow > plotTop) {
        for (var xx = mLeft; xx <= cols - 2; xx++) screen.set(xx, axisRow, '-');
        for (var yy = plotTop; yy <= axisRow; yy++) screen.set(mLeft, yy, '|');
        screen.set(mLeft, axisRow, '+');
        // x ticks
        var tfx = [0.25, 0.5, 0.75];
        for (var ti = 0; ti < tfx.length; ti++) {
          screen.set(plotLeft + Math.round(tfx[ti] * plotW), axisRow, '+');
        }
        // y ticks
        for (var tj = 0; tj < tfx.length; tj++) {
          screen.set(mLeft, axisRow - 1 - Math.round(tfx[tj] * plotH), '+');
        }
      }

      // ---- readouts along the top ------------------------------------
      var rTxt;
      if (haveFit) {
        var rs = (r >= 0 ? '+' : '-') + Math.abs(r).toFixed(2);
        rTxt = 'r=' + rs;
      } else {
        rTxt = 'r= ----';
      }
      var nTxt = 'n=' + nVis;
      // blink the point count when a fresh point streams in
      var streaming = nVis < nMax;
      var label = 'SCATTER';

      if (cols >= 24) screen.text(mLeft, topRow, rTxt);
      // n= count on the right, guarded so it never runs off-grid
      var nx = cols - 1 - nTxt.length;
      if (nx > mLeft + rTxt.length + 1) {
        screen.text(nx, topRow, nTxt);
        if (streaming && (frameCount % 2 === 0)) {
          screen.set(nx + nTxt.length + 0 < cols ? nx - 1 : nx, topRow, ' ');
          screen.set(clamp(nx - 2, 0, cols - 1), topRow, '>');
        }
      }
      // slope/equation readout centered on top if there's room
      if (haveFit && cols >= 44) {
        var eq = 'y=' + icept.toFixed(2) + (slope >= 0 ? '+' : '-') + Math.abs(slope).toFixed(2) + 'x';
        var ex = Math.floor((cols - eq.length) / 2);
        if (ex > mLeft + rTxt.length + 1 && ex + eq.length < nx - 1) {
          screen.text(ex, topRow, eq);
        }
      }

      // axis labels on the bottom row
      var brow = rows - 1;
      if (brow > axisRow) {
        if (cols >= 12) screen.text(mLeft + 1, brow, label.slice(0, Math.max(0, cols - mLeft - 2)));
        var xl = 'x';
        screen.set(cols - 2, brow, xl);
      }
      // 'y' marker at the top of the axis
      if (plotTop <= axisRow && mLeft - 1 >= 0) screen.set(mLeft - 1, plotTop, 'y');
    };
  }
});
