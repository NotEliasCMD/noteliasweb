/*
 * candlestick — a live scrolling OHLC candlestick chart. Candles march
 * right-to-left; up candles use a bright glyph set and down candles a
 * dimmer one, wicks are vertical lines. A moving-average line threads
 * behind the candles, volume bars tick along the bottom and a live
 * price / % change readout blinks in the header.
 */
ASCII.register({
  id: 'candlestick',
  title: 'Candlestick Chart',
  description: 'A scrolling OHLC candlestick chart with a moving-average line, volume bars and a live price / % change readout.',
  cols: 64, rows: 26, fps: 12,
  create: function (cols, rows) {
    var clamp = ASCII.util.clamp;
    var hash = ASCII.util.hash;

    // --- glyph sets ---------------------------------------------------
    var UP   = { body: '#', wick: '|', vol: '#' };  // bullish  (bright)
    var DOWN = { body: '=', wick: ':', vol: ':' };  // bearish  (dim)

    // --- one candle per integer index, generated on demand -----------
    var series = [];        // rolling window of candle objects
    var baseIndex = 0;      // absolute index of series[0]
    var genIndex = -1;      // highest absolute index generated so far
    var lastClose = 128.0;  // running close for the random walk

    function generateUpTo(upto) {
      while (genIndex < upto) {
        genIndex++;
        var i = genIndex;
        var o = lastClose;
        // Random walk with gentle cyclic drift + mean reversion so the
        // price stays in a readable band forever.
        var noise = (hash(i, 1.7) - 0.5) * 6.0;
        var drift = Math.cos(i * 0.11) * 1.3 + Math.sin(i * 0.037) * 1.0;
        var revert = (128.0 - o) * 0.02;
        var c = o + noise + drift + revert;
        if (c < 8) c = 8;
        var top = Math.max(o, c);
        var bot = Math.min(o, c);
        var hi = top + hash(i, 3.3) * 3.0 + 0.4;
        var lo = bot - hash(i, 9.1) * 3.0 - 0.4;
        if (lo < 4) lo = 4;
        series.push({ o: o, c: c, hi: hi, lo: lo, up: c >= o });
        lastClose = c;
      }
      // Trim the front so memory stays bounded on long runs.
      if (series.length > 900) {
        var drop = series.length - 600;
        series.splice(0, drop);
        baseIndex += drop;
      }
    }

    function candle(i) {
      if (i > genIndex) generateUpTo(i);
      var p = i - baseIndex;
      if (p < 0) p = 0;
      if (p >= series.length) p = series.length - 1;
      return series[p];
    }

    function fmt(p) { return p.toFixed(2); }
    function pad2(n) { n = n | 0; return n < 10 ? '0' + n : '' + n; }

    var slot = 2;                 // columns per candle (1 candle + 1 gap)
    var scrollSpeed = 0.3;        // columns per frame
    var MA = 12;                  // moving-average window
    var LOOKBACK = 24;            // bars used for the % change readout

    return function frame(screen, t, frameCount) {
      // --- layout ----------------------------------------------------
      var volH = rows >= 18 ? 3 : (rows >= 14 ? 2 : 0);
      var labelW = cols >= 40 ? 7 : 0;

      var plotLeft = 0;
      var plotRight = cols - 1 - labelW;
      if (plotRight < plotLeft + 1) { plotRight = cols - 1; labelW = 0; }

      var volTop = rows - volH;                 // first row of volume band
      var chartTop = 1;                          // row 0 is the header
      var chartBot = (volH > 0 ? volTop - 1 : rows - 1);
      if (chartBot <= chartTop) chartBot = chartTop + 1;
      if (chartBot >= rows) chartBot = rows - 1;

      var chartW = plotRight - plotLeft + 1;
      var numVisible = Math.max(1, Math.floor(chartW / slot));

      // --- scrolling state ------------------------------------------
      var scrollPx = frameCount * scrollSpeed;
      var headFloat = scrollPx / slot;           // fractional lead index
      var headIdx = Math.floor(headFloat);
      generateUpTo(headIdx + 2);

      var anchorX = plotRight - 1;               // where the newest candle sits
      var iMax = headIdx + 1;
      var iMin = iMax - numVisible - 2;
      if (iMin < 0) iMin = 0;

      function screenX(i) {
        return Math.round(anchorX - (headFloat - i) * slot);
      }

      // --- price range over what's visible --------------------------
      var pMin = Infinity, pMax = -Infinity;
      for (var i = iMin; i <= iMax; i++) {
        var cd = candle(i);
        if (cd.hi > pMax) pMax = cd.hi;
        if (cd.lo < pMin) pMin = cd.lo;
      }
      if (!isFinite(pMin) || !isFinite(pMax)) { pMin = 0; pMax = 1; }
      var pad = (pMax - pMin) * 0.08 + 0.5;
      pMin -= pad; pMax += pad;
      var span = pMax - pMin;
      if (span < 1e-6) span = 1e-6;

      function mapY(p) {
        var f = (p - pMin) / span;               // 0 bottom .. 1 top
        var y = chartBot - f * (chartBot - chartTop);
        return clamp(Math.round(y), chartTop, chartBot);
      }

      // --- current price + % change ---------------------------------
      var cur = candle(headIdx);
      var curClose = cur.c;
      var refIdx = headIdx - LOOKBACK;
      if (refIdx < 0) refIdx = 0;
      var refClose = candle(refIdx).c;
      var pct = refClose !== 0 ? (curClose - refClose) / refClose * 100 : 0;
      var rising = pct >= 0;
      var curY = mapY(curClose);

      // --- current-price guide line (drawn first, behind candles) ----
      for (var gx = plotLeft; gx <= plotRight; gx += 2) {
        if (screen.get(gx, curY) === ' ') screen.set(gx, curY, '-');
      }

      // --- moving-average line (behind candles) ---------------------
      var prevMx = -1, prevMy = -1;
      for (var im = iMin; im <= iMax; im++) {
        var mx = screenX(im);
        if (mx < plotLeft || mx > plotRight) { prevMx = -1; continue; }
        var sum = 0, cnt = 0;
        for (var k = 0; k < MA; k++) {
          var idx = im - k;
          if (idx < 0) break;
          sum += candle(idx).c; cnt++;
        }
        if (cnt === 0) continue;
        var my = mapY(sum / cnt);
        if (prevMx >= 0) screen.line(prevMx, prevMy, mx, my, '~');
        else screen.set(mx, my, '~');
        prevMx = mx; prevMy = my;
      }

      // --- candles ---------------------------------------------------
      for (var ic = iMin; ic <= iMax; ic++) {
        var x = screenX(ic);
        if (x < plotLeft || x > plotRight) continue;
        var d = candle(ic);
        var g = d.up ? UP : DOWN;
        var hY = mapY(d.hi), lY = mapY(d.lo);
        var oY = mapY(d.o),  cY = mapY(d.c);
        var bTop = Math.min(oY, cY), bBot = Math.max(oY, cY);
        // wick first (full high..low), then body over the middle
        for (var wy = hY; wy <= lY; wy++) screen.set(x, wy, g.wick);
        for (var by = bTop; by <= bBot; by++) screen.set(x, by, g.body);
      }

      // --- volume band ----------------------------------------------
      if (volH > 0) {
        for (var iv = iMin; iv <= iMax; iv++) {
          var vx = screenX(iv);
          if (vx < plotLeft || vx > plotRight) continue;
          var vd = candle(iv);
          var bodySize = Math.abs(vd.c - vd.o);
          var vol01 = clamp(0.25 + hash(iv, 5.5) * 0.45 + bodySize * 0.05, 0, 1);
          var vh = Math.max(1, Math.round(vol01 * volH));
          var vg = vd.up ? UP.vol : DOWN.vol;
          for (var vy = 0; vy < vh; vy++) {
            screen.set(vx, rows - 1 - vy, vg);
          }
        }
      }

      // --- axis labels (right margin) -------------------------------
      if (labelW > 0) {
        var ax = plotRight + 2;
        screen.text(ax, chartTop, fmt(pMax));
        screen.text(ax, chartBot, fmt(pMin));
        // live current-price tag on its own row, blinking marker
        if (curY !== chartTop && curY !== chartBot) {
          var mk = (frameCount % 8 < 4) ? '>' : '-';
          screen.set(plotRight + 1, curY, mk);
          screen.text(ax, curY, fmt(curClose));
        }
      }

      // --- header readout -------------------------------------------
      var arrow = rising ? '^' : 'v';
      var sign = rising ? '+' : '-';
      var priceStr = fmt(curClose);
      var pctStr = sign + Math.abs(pct).toFixed(2) + '%';
      // ticking session clock derived from frameCount
      var secs = frameCount;
      var clock = pad2((secs / 3600) % 24) + ':' + pad2((secs / 60) % 60) + ':' + pad2(secs % 60);

      screen.text(0, 0, 'VRSK');
      var hx = 5;
      screen.text(hx, 0, priceStr); hx += priceStr.length + 1;
      screen.set(hx, 0, arrow); hx += 2;
      screen.text(hx, 0, pctStr); hx += pctStr.length + 1;
      // right-align the clock in the header if there's room
      var clkX = cols - clock.length;
      if (clkX > hx + 1) screen.text(clkX, 0, clock);
    };
  }
});
