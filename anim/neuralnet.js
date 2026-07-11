/*
 * neuralnet — a layered feed-forward neural network in ASCII. Node circles
 * in 3-4 columns are wired by a sparse mesh of edges; a bright activation
 * front sweeps left-to-right, firing nodes and sending pulses along the
 * wires. A live accuracy % climbs, loss decays, an epoch counter ticks and
 * a sparkline trends the accuracy history.
 */
ASCII.register({
  id: 'neuralnet',
  title: 'Neural Network',
  description: 'A feed-forward neural net with activation pulses flowing left-to-right, firing nodes, a climbing accuracy % and a ticking epoch counter.',
  cols: 62, rows: 26, fps: 18,
  create: function (cols, rows) {
    var ramp = ASCII.util.LUMINANCE;              // '.,-~:;=!*#$@' dim -> bright
    var clamp = ASCII.util.clamp;
    var hash = ASCII.util.hash;

    // ---- vertical layout -------------------------------------------------
    var metricsRow = rows - 1;                    // acc / loss readout
    var sparkRow = rows >= 8 ? rows - 2 : -1;     // accuracy trend sparkline
    var netTop = 1;                               // row 0 = header
    var netBot = (sparkRow >= 0 ? sparkRow : metricsRow) - 1;
    if (netBot < netTop) netBot = netTop;

    // ---- pick a layer topology that fits the width -----------------------
    var template = cols >= 40 ? [4, 6, 5, 3] : (cols >= 22 ? [4, 5, 3] : [3, 4, 2]);
    var L = template.length;
    var maxNodes = Math.max(1, netBot - netTop + 1);

    var leftMargin = 2;
    var rightMargin = 2;
    var xspan = Math.max(1, (cols - 1) - leftMargin - rightMargin);

    // Precompute node positions + per-node activation bias (deterministic).
    var layers = [];
    for (var li = 0; li < L; li++) {
      var n = Math.min(template[li], maxNodes);
      if (n < 1) n = 1;
      var lx = L > 1
        ? Math.round(leftMargin + (li / (L - 1)) * xspan)
        : Math.floor(cols / 2);
      var nodes = [];
      for (var ni = 0; ni < n; ni++) {
        var frac = (ni + 0.5) / n;
        var ly = Math.round(netTop + frac * (netBot - netTop));
        nodes.push({ x: lx, y: ly, bias: hash(li * 7 + 3, ni * 5 + 1) });
      }
      layers.push(nodes);
    }

    // Precompute a sparse edge list between adjacent layers.
    var edges = [];
    for (var g = 0; g < L - 1; g++) {
      var A = layers[g], B = layers[g + 1];
      for (var a = 0; a < A.length; a++) {
        for (var b = 0; b < B.length; b++) {
          var w = hash(g * 131 + a * 17, b * 29 + 5);
          if (w < 0.28) continue;                 // sparse, like a real net
          edges.push({ gap: g, a: a, b: b, w: w });
        }
      }
    }

    // ---- data-science state (persists across frames) ---------------------
    var sparkW = sparkRow >= 0 ? Math.max(4, cols - 2) : 0;
    var accHist = [];
    var lastEpoch = -1;
    var epRate = 3.2;                             // epochs per second

    function pad(n, width) {
      n = '' + (n | 0);
      while (n.length < width) n = '0' + n;
      return n;
    }

    function fixed1(v) {
      var s = (Math.round(v * 10) / 10).toFixed(1);
      return s;
    }

    return function frame(screen, t, frameCount) {
      var frontSpeed = 0.9;
      var front = (t * frontSpeed) % (L + 0.6);   // sweeps 0..L then brief gap

      // ---- training metrics ---------------------------------------------
      var epoch = Math.floor(t * epRate);
      var acc = 99.3 * (1 - Math.exp(-epoch / 42)) +
                (ASCII.util.noise2(epoch * 0.3, 7.5) - 0.5) * 0.8;
      acc = clamp(acc, 0, 99.9);
      var loss = clamp(2.6 * Math.exp(-epoch / 34) +
                (ASCII.util.noise2(epoch * 0.3, 2.5) - 0.5) * 0.05, 0.001, 9);

      if (epoch !== lastEpoch) {
        lastEpoch = epoch;
        accHist.push(acc);
        if (sparkW > 0 && accHist.length > sparkW) accHist.shift();
      }

      // ---- edges (dim mesh) ---------------------------------------------
      for (var e = 0; e < edges.length; e++) {
        var ed = edges[e];
        var na = layers[ed.gap][ed.a];
        var nb = layers[ed.gap + 1][ed.b];
        var ech = ed.w > 0.7 ? ',' : '.';
        screen.line(na.x + 1, na.y, nb.x - 1, nb.y, ech);
      }

      // ---- activation pulses (bright, on the currently-sweeping gap) -----
      for (var e2 = 0; e2 < edges.length; e2++) {
        var eg = edges[e2];
        var p = front - eg.gap;                   // pulse fraction along edge
        if (p <= 0 || p >= 1) continue;
        var sa = layers[eg.gap][eg.a];
        var sb = layers[eg.gap + 1][eg.b];
        // only pulse the stronger connections, for a livelier flow
        if (eg.w < 0.45) continue;
        var trail = [ [p, '@'], [p - 0.16, '*'], [p - 0.30, '='] ];
        for (var ti = 0; ti < trail.length; ti++) {
          var pf = trail[ti][0];
          if (pf <= 0 || pf >= 1) continue;
          var px = Math.round(sa.x + 1 + (sb.x - 1 - (sa.x + 1)) * pf);
          var py = Math.round(sa.y + (sb.y - sa.y) * pf);
          screen.set(px, py, trail[ti][1]);
        }
      }

      // ---- nodes (drawn last, on top) -----------------------------------
      for (var lyi = 0; lyi < L; lyi++) {
        var layer = layers[lyi];
        // how strongly this layer is firing as the front passes it
        var fireAmt = clamp(1 - Math.abs(front - lyi) * 1.6, 0, 1);
        for (var k = 0; k < layer.length; k++) {
          var node = layer[k];
          // node-specific liveliness so a layer doesn't fire uniformly
          var live = fireAmt * (0.55 + 0.45 * node.bias);
          var glyph;
          if (live > 0.6) glyph = '@';
          else if (live > 0.3) glyph = 'O';
          else glyph = 'o';
          if (node.x - 1 >= 0) screen.set(node.x - 1, node.y, '(');
          if (node.x + 1 < cols) screen.set(node.x + 1, node.y, ')');
          screen.set(node.x, node.y, glyph);
        }
      }

      // ---- header --------------------------------------------------------
      var title = 'NEURAL NET';
      if (cols >= title.length) screen.text(0, 0, title);
      var epLabel = 'epoch ' + pad(epoch, 5);
      var epX = cols - epLabel.length;
      if (epX > title.length) screen.text(epX, 0, epLabel);

      // ---- accuracy sparkline -------------------------------------------
      if (sparkRow >= 0 && sparkW > 0) {
        var startX = cols - accHist.length;
        if (startX < 0) startX = 0;
        for (var h = 0; h < accHist.length; h++) {
          var b = clamp(accHist[h] / 100, 0, 1);
          screen.set(startX + h, sparkRow, screen.shade(b, ramp));
        }
      }

      // ---- metrics readout ----------------------------------------------
      for (var mx = 0; mx < cols; mx++) screen.set(mx, metricsRow, ' ');
      var accStr = 'acc ' + fixed1(acc) + '%';
      var lossStr = 'loss ' + loss.toFixed(3);
      if (cols >= accStr.length) screen.text(0, metricsRow, accStr);
      var lx2 = cols - lossStr.length;
      if (lx2 > accStr.length + 1) screen.text(lx2, metricsRow, lossStr);
      // blinking "training" tick in the middle when there's room
      if (cols >= accStr.length + lossStr.length + 12) {
        var dots = frameCount % 4;
        var tr = 'train' + (dots === 0 ? '   ' : dots === 1 ? '.  ' : dots === 2 ? '.. ' : '...');
        screen.text(Math.floor(cols / 2) - 4, metricsRow, tr);
      }
    };
  }
});
