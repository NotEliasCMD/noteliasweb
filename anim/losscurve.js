/*
 * losscurve — a training loss curve on ASCII axes: the loss descends
 * epoch by epoch with noisy wiggle and flattens as it converges, a marker
 * rides the newest point, live epoch/loss readouts tick and a faint dashed
 * target line sits near the floor.
 */
ASCII.register({
  id: 'losscurve',
  title: 'Training Loss',
  description: 'A training loss curve descending epoch by epoch with noisy wiggle, a marker on the newest point, live epoch/loss readouts and a dashed target line.',
  cols: 62, rows: 26, fps: 16,
  create: function (cols, rows) {
    var ramp = ASCII.util.LUMINANCE;              // '.,-~:;=!*#$@' dim -> bright
    var clamp = ASCII.util.clamp;
    var noise2 = ASCII.util.noise2;
    var hash = ASCII.util.hash;

    var MAXLOSS = 2.5;          // loss at the very top of the plot
    var TARGET_FRAC = 0.14;     // converged / target loss as a fraction of MAXLOSS
    var TOTAL_EPOCHS = 120;     // "reported" epoch budget (decoupled from grid width)

    function pad3(n) {
      n = n | 0;
      if (n < 10) return '00' + n;
      if (n < 100) return '0' + n;
      return '' + n;
    }

    // Loss (as a fraction of MAXLOSS, 0=floor .. 1=top) at sample e of a run.
    function lossFrac(e, runCols, seed) {
      var frac = runCols > 0 ? e / runCols : 0;
      var decayed = Math.exp(-3.2 * frac);                // 1 -> ~0.04
      var base = TARGET_FRAC + (1 - TARGET_FRAC) * decayed;
      var amp = 0.10 * decayed + 0.02;                    // wiggle shrinks as it converges
      var wobble = (noise2(e * 0.35, seed * 7.0 + 1.5) - 0.5) * 2.0;
      var jitter = (hash(e, seed * 13 + 3) - 0.5);
      var v = base + wobble * amp + jitter * amp * 0.8;
      return clamp(v, 0.02, 0.99);
    }

    return function frame(screen, t, frameCount) {
      // --- layout (all derived from the passed grid size) ---------------
      var marginL = cols >= 30 ? 6 : 3;
      if (marginL > cols - 4) marginL = Math.max(1, cols - 4);
      var top = 1;                                         // row 0 is the header
      var bottom = rows - 2;                               // last row is x-axis caption
      if (bottom <= top) bottom = top + 1;
      var axisX = marginL;
      var plotW = (cols - 1) - axisX;                      // columns of plot area
      if (plotW < 1) plotW = 1;
      var plotH = bottom - top;
      if (plotH < 1) plotH = 1;

      // --- training progress: one column per epoch-sample, then loop ----
      var runCols = plotW;
      var pause = Math.max(4, Math.floor(runCols * 0.4));
      var cycle = runCols + pause;
      var speed = cycle / 11.0;                            // full run+pause ~= 11s
      var walk = t * speed;
      var phase = walk % cycle;
      var idx = Math.min(runCols, Math.floor(phase));      // newest drawn sample
      var seed = Math.floor(walk / cycle) + 1;             // per-run seed (curves vary)
      var converged = phase >= runCols;

      function yOf(v) {
        var y = Math.round(bottom - v * plotH);
        if (y < top) y = top;
        if (y > bottom) y = bottom;
        return y;
      }

      // --- axes ---------------------------------------------------------
      for (var ay = top; ay <= bottom; ay++) screen.set(axisX, ay, '|');
      for (var ax = axisX; ax <= cols - 1; ax++) screen.set(ax, bottom, '-');
      screen.set(axisX, bottom, '+');

      // --- faint dashed target line -------------------------------------
      var ty = yOf(TARGET_FRAC);
      if (ty !== bottom) {
        for (var tx = axisX + 1; tx <= cols - 1; tx++) {
          if (((tx - axisX) & 1) === 0) screen.set(tx, ty, '.');
        }
      }

      // --- the loss curve -----------------------------------------------
      var prevX = -1, prevY = -1;
      for (var e = 0; e <= idx; e++) {
        var v = lossFrac(e, runCols, seed);
        var px = axisX + 1 + e;
        if (px > cols - 1) px = cols - 1;
        var py = yOf(v);
        // connect samples with a dim trail so it reads as a continuous line
        if (prevX >= 0) screen.line(prevX, prevY, px, py, ':');
        prevX = px;
        prevY = py;
      }
      // overdraw sample points, brighter toward the newest epoch
      for (var e2 = 0; e2 <= idx; e2++) {
        var v2 = lossFrac(e2, runCols, seed);
        var sx = axisX + 1 + e2;
        if (sx > cols - 1) sx = cols - 1;
        var sy = yOf(v2);
        var recency = idx > 0 ? e2 / idx : 1;
        var b = 0.35 + 0.6 * recency;
        screen.set(sx, sy, screen.shade(clamp(b, 0, 1), ramp));
      }

      // --- marker riding the newest point -------------------------------
      var curFrac = lossFrac(idx, runCols, seed);
      var mx = axisX + 1 + idx;
      if (mx > cols - 1) mx = cols - 1;
      var my = yOf(curFrac);
      // faint vertical guide down to the axis
      for (var gy = my + 1; gy < bottom; gy++) {
        if (screen.get(mx, gy) === ' ') screen.set(mx, gy, ':');
      }
      screen.set(mx, my, converged && (frameCount & 4) ? '@' : 'O');

      var curLoss = curFrac * MAXLOSS;
      var epShown = Math.round((runCols > 0 ? idx / runCols : 0) * TOTAL_EPOCHS);

      // --- header readout ----------------------------------------------
      var head = 'TRAINING LOSS  epoch ' + pad3(epShown) + '/' + TOTAL_EPOCHS +
                 '  loss ' + curLoss.toFixed(4);
      if (head.length > cols) head = 'ep ' + pad3(epShown) + ' loss ' + curLoss.toFixed(3);
      if (head.length > cols) head = 'loss ' + curLoss.toFixed(3);
      screen.text(0, 0, head.slice(0, cols));

      // --- y-axis tick labels (only when there is room) -----------------
      if (marginL >= 5) {
        var topLbl = MAXLOSS.toFixed(1);
        var midLbl = (MAXLOSS * 0.5).toFixed(1);
        screen.text(Math.max(0, axisX - topLbl.length - 1), top, topLbl);
        screen.text(Math.max(0, axisX - midLbl.length - 1),
                    Math.floor((top + bottom) / 2), midLbl);
        screen.text(Math.max(0, axisX - 4), bottom, '0.0');
      }

      // --- x-axis caption + target label / status -----------------------
      var capY = rows - 1;
      if (capY > bottom) {
        screen.text(axisX + 1, capY, 'epochs');
        var tgtLoss = (TARGET_FRAC * MAXLOSS).toFixed(2);
        var status = converged ? '[converged]' : 'target ' + tgtLoss;
        if (converged && (frameCount & 8)) status = ' converged ';
        var sxpos = cols - status.length;
        if (sxpos > axisX + 8) screen.text(sxpos, capY, status);
      }
    };
  }
});
