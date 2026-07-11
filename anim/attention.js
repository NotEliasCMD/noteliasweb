/*
 * attention — a transformer self-attention map in ASCII: a row of query
 * tokens on top and key tokens on the bottom, with weighted links fanning
 * between them. The active query sweeps across the sequence while a
 * LAYER/HEAD readout cycles and a live attention-entropy metric ticks.
 */
ASCII.register({
  id: 'attention',
  title: 'Attention Map',
  description: 'A transformer self-attention map: tokens top and bottom, weighted links lighting up as the query sweeps and the layer/head readout cycles.',
  cols: 62, rows: 24, fps: 14,
  create: function (cols, rows) {
    var ramp = ASCII.util.LUMINANCE;              // '.,-~:;=!*#$@' dim -> bright
    var clamp = ASCII.util.clamp;
    var noise2 = ASCII.util.noise2;

    // Token vocabulary — a little sentence the transformer is "reading".
    var VOCAB = ['[BOS]', 'the', 'trans', 'former', 'reads', 'every',
                 'token', 'with', 'full', 'ctx', '[EOS]'];

    var NLAYERS = 12;
    var NHEADS = 8;
    var SPEED = 0.85;                             // query tokens per second

    function pad2(n) { n = n | 0; return n < 10 ? '0' + n : '' + n; }
    function pad5(n) {
      n = n | 0; var s = '' + n;
      while (s.length < 5) s = '0' + s;
      return s;
    }

    return function frame(screen, t, frameCount) {
      // ---- layout (all derived from the passed grid size) -------------
      var headerY = 0;
      var footerY = rows - 1;
      var topLabelY = Math.min(2, Math.max(1, (rows * 0.12) | 0));
      var botLabelY = Math.max(topLabelY + 2, rows - 2);
      var y0 = topLabelY + 1;                     // link start row
      var y1 = botLabelY - 1;                     // link end row
      if (y1 < y0) y1 = y0;

      var nTok = clamp(Math.floor(cols / 8), 2, VOCAB.length);
      var slotW = cols / nTok;
      var maxLen = Math.max(1, Math.floor(slotW) - 1);

      // token center x for slot i
      function slotX(i) { return Math.floor((i + 0.5) * slotW); }

      // ---- cycling query / head / layer -------------------------------
      var step = Math.floor(t * SPEED);
      var q = ((step % nTok) + nTok) % nTok;
      var head = (Math.floor(step / nTok) % NHEADS);
      var layer = (Math.floor(step / (nTok * NHEADS)) % NLAYERS);

      // ---- attention weights for the active query ---------------------
      var focus = (q * 3 + head + layer) % nTok; // where this head looks
      var sig = 1.1;
      var raw = new Array(nTok);
      var sum = 0, maxRaw = 1e-6;
      for (var j = 0; j < nTok; j++) {
        var d = j - focus;
        var base = Math.exp(-(d * d) / (2 * sig * sig));
        var self = (j === q) ? 0.55 : 0;
        var bos = (j === 0) ? 0.30 : 0;
        var flick = 0.80 + 0.40 * noise2(j * 0.9 + head, t * 0.8 + layer);
        var r = (base + self + bos) * flick;
        raw[j] = r;
        sum += r;
        if (r > maxRaw) maxRaw = r;
      }
      // probabilities + top key + entropy (the live "data" motif)
      var topKey = 0, topProb = 0, entropy = 0;
      for (var k = 0; k < nTok; k++) {
        var p = raw[k] / sum;
        if (p > topProb) { topProb = p; topKey = k; }
        if (p > 1e-6) entropy -= p * (Math.log(p) / Math.LN2);
      }

      var qx = slotX(q);

      // ---- draw the attention links (dim first, bright on top) --------
      var order = [];
      for (var o = 0; o < nTok; o++) order.push(o);
      order.sort(function (a, b) { return raw[a] - raw[b]; });

      var pulsePos = (t * 1.6) % 1;              // travelling dot on top link
      for (var oi = 0; oi < order.length; oi++) {
        var key = order[oi];
        var bright = raw[key] / maxRaw;          // 0..1 relative brightness
        var kx = slotX(key);
        var n = Math.max(Math.abs(kx - qx), y1 - y0, 1);
        for (var s = 0; s <= n; s++) {
          var f = s / n;
          var px = Math.round(qx + (kx - qx) * f);
          var py = Math.round(y0 + (y1 - y0) * f);
          // slight brightening toward the query source for directionality
          var b = bright * (0.72 + 0.28 * (1 - f));
          var ch = screen.shade(clamp(b, 0, 1), ramp);
          // the strongest link carries a bright travelling pulse
          if (key === topKey && Math.abs(f - pulsePos) < (0.6 / n + 0.03)) {
            ch = '@';
          }
          screen.set(px, py, ch);
        }
      }

      // ---- top query tokens -------------------------------------------
      for (var ti = 0; ti < nTok; ti++) {
        var lbl = VOCAB[ti];
        if (lbl.length > maxLen) lbl = lbl.slice(0, maxLen);
        var cx = slotX(ti);
        var sx = cx - (lbl.length >> 1);
        if (ti === q) {
          // highlight the active query
          screen.set(sx - 1, topLabelY, '>');
          screen.text(sx, topLabelY, lbl.toUpperCase());
          screen.set(sx + lbl.length, topLabelY, '<');
          screen.set(cx, topLabelY + 1, '|');    // connector into the fan
        } else {
          screen.text(sx, topLabelY, lbl);
        }
      }

      // ---- bottom key tokens ------------------------------------------
      for (var bi = 0; bi < nTok; bi++) {
        var blbl = VOCAB[bi];
        if (blbl.length > maxLen) blbl = blbl.slice(0, maxLen);
        var bcx = slotX(bi);
        var bsx = bcx - (blbl.length >> 1);
        screen.set(bcx, botLabelY - 1, '|');     // connector out of the fan
        if (bi === topKey) {
          screen.set(bsx - 1, botLabelY, '[');
          screen.text(bsx, botLabelY, blbl.toUpperCase());
          screen.set(bsx + blbl.length, botLabelY, ']');
        } else {
          screen.text(bsx, botLabelY, blbl);
        }
      }

      // ---- header readout: LAYER / HEAD -------------------------------
      var hdr = 'LAYER ' + pad2(layer + 1) + '/' + NLAYERS +
                '  HEAD ' + pad2(head + 1) + '/' + NHEADS;
      screen.text(0, headerY, hdr);
      var title = 'self-attention';
      var tx = cols - title.length;
      if (tx > hdr.length + 2) screen.text(tx, headerY, title);

      // ---- footer readout: query -> top key, weight, entropy, step ----
      var qName = VOCAB[q], kName = VOCAB[topKey];
      var wPct = Math.round(topProb * 100);
      var foot = 'q=' + qName + ' -> ' + kName + ' ' + pad2(wPct) + '%' +
                 '  H=' + entropy.toFixed(2) + 'b  step ' + pad5(frameCount);
      screen.text(0, footerY, foot);
    };
  }
});
