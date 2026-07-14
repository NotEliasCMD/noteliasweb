/*
 * crttv — an old CRT television: rounded bezel, twin antenna and control
 * knobs. On the tube a wireframe product box turns, "AS SEEN ON TV" flashes,
 * a tiny sales chart climbs, and scanlines shimmer down the glass. A channel
 * readout and a units-sold counter tick on the side panel.
 */
ASCII.register({
  id: 'crttv',
  title: 'CRT Television',
  description: 'A retro CRT set spinning a product box under a flashing "AS SEEN ON TV" caption, with a climbing sales chart and shimmering scanlines.',
  cols: 56, rows: 28, fps: 16,
  create: function (cols, rows) {
    var ramp = ASCII.util.LUMINANCE;      // '.,-~:;=!*#$@'
    var clamp = ASCII.util.clamp;
    var TAU = ASCII.util.TAU;
    var noise2 = ASCII.util.noise2;

    // Unit cube: 8 corners, 12 edges.
    var V = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
    ];
    var E = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    function rot(p, ax, ay) {
      var x = p[0], y = p[1], z = p[2], c, s, tmp;
      c = Math.cos(ax); s = Math.sin(ax);
      tmp = y * c - z * s; z = y * s + z * c; y = tmp;      // pitch
      c = Math.cos(ay); s = Math.sin(ay);
      tmp = x * c + z * s; z = -x * s + z * c; x = tmp;     // yaw
      return [x, y, z];
    }

    var knobTicks = ['-', '\\', '|', '/'];

    return function frame(screen, t, frameCount) {
      var cx = Math.floor(cols / 2);

      // ---- overall TV body geometry (all derived from cols/rows) -------
      var topPad = rows >= 18 ? 3 : rows >= 12 ? 2 : 1;
      var by0 = topPad;
      var by1 = rows - 1;
      var bx0 = Math.max(0, Math.floor(cols * 0.06));
      var bx1 = cols - 1 - bx0;
      var innerW = bx1 - bx0 - 1;

      // Side control panel width (drop it on very narrow grids).
      var cpw = innerW >= 30 ? 10 : innerW >= 22 ? 7 : innerW >= 15 ? 6 : 0;

      // ---- antenna ------------------------------------------------------
      var sway = Math.sin(t * 1.4);
      var spread = Math.max(2, Math.floor(cols * 0.22));
      var baseY = by0;
      var lx = clamp(cx - spread + Math.round(sway), 0, cols - 1);
      var rx = clamp(cx + spread - Math.round(sway), 0, cols - 1);
      screen.line(cx, baseY, lx, 0, '/');
      screen.line(cx, baseY, rx, 0, '\\');
      screen.set(lx, 0, 'o');
      screen.set(rx, 0, 'o');
      screen.set(cx, baseY, 'T');

      // ---- outer bezel (rounded) ---------------------------------------
      for (var x = bx0 + 1; x < bx1; x++) { screen.set(x, by0, '-'); screen.set(x, by1, '-'); }
      for (var y = by0 + 1; y < by1; y++) { screen.set(bx0, y, '|'); screen.set(bx1, y, '|'); }
      screen.set(bx0, by0, '.'); screen.set(bx1, by0, '.');
      screen.set(bx0, by1, "'"); screen.set(bx1, by1, "'");

      // ---- picture (tube) area -----------------------------------------
      var sx0 = bx0 + 2;
      var sy0 = by0 + 1;
      var sx1 = bx1 - 2 - cpw;
      var sy1 = by1 - 1;
      var picW = sx1 - sx0 + 1;
      var picH = sy1 - sy0 + 1;

      if (picW >= 4 && picH >= 3) {
        // Tube frame.
        for (var fx = sx0 - 1; fx <= sx1 + 1; fx++) { screen.set(fx, sy0 - 1, '-'); screen.set(fx, sy1 + 1, '-'); }
        for (var fy = sy0 - 1; fy <= sy1 + 1; fy++) { screen.set(sx0 - 1, fy, '|'); screen.set(sx1 + 1, fy, '|'); }
        screen.set(sx0 - 1, sy0 - 1, '+'); screen.set(sx1 + 1, sy0 - 1, '+');
        screen.set(sx0 - 1, sy1 + 1, '+'); screen.set(sx1 + 1, sy1 + 1, '+');

        // How much of the picture the bottom widgets claim.
        var chartMaxH = picH >= 8 ? 3 : picH >= 6 ? 2 : 0;
        var drawText = picW >= 2;
        var textRow = drawText ? sy1 : sy1 + 1;
        var chartBaseY = textRow - 1;
        var cubeBottom = sy1 - (chartMaxH > 0 ? chartMaxH : 0) - (drawText ? 1 : 0);
        if (cubeBottom < sy0 + 1) cubeBottom = Math.min(sy1, sy0 + 1);

        // Scanline shimmer: dim moving dot bands, only inside the tube.
        for (var yy = sy0; yy <= sy1; yy++) {
          for (var xx = sx0; xx <= sx1; xx++) {
            var sh = 0.5 + 0.5 * Math.sin(yy * 2.15 - t * 5.0 + Math.sin(xx * 0.35) * 0.6);
            if (sh > 0.78) screen.set(xx, yy, '.');
            else if (sh > 0.68) screen.set(xx, yy, ',');
          }
        }

        // ---- rotating product box -------------------------------------
        var cubeH = cubeBottom - sy0 + 1;
        var pcx = (sx0 + sx1) / 2;
        var pcy = sy0 + cubeH / 2;
        var scaleX = Math.max(1.2, Math.min(picW * 0.30, cubeH * 0.9));
        var scaleY = scaleX * 0.45;
        var ay = t * 0.9, ax = 0.5 + Math.sin(t * 0.6) * 0.35;

        var proj = [];
        for (var vi = 0; vi < V.length; vi++) {
          var r = rot(V[vi], ax, ay);
          proj.push({ x: pcx + r[0] * scaleX, y: pcy - r[1] * scaleY, z: r[2] });
        }
        for (var ei = 0; ei < E.length; ei++) {
          var a = proj[E[ei][0]], b = proj[E[ei][1]];
          var dx = b.x - a.x, dy = b.y - a.y;
          var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
          for (var s2 = 0; s2 <= steps; s2++) {
            var f = s2 / steps;
            var px = a.x + dx * f;
            var py = a.y + dy * f;
            var pz = a.z + (b.z - a.z) * f;
            var ix = Math.round(px), iy = Math.round(py);
            if (ix < sx0 || ix > sx1 || iy < sy0 || iy > cubeBottom) continue;
            var bright = clamp(0.35 + 0.6 * ((pz + 1.7) / 3.4), 0, 1);
            var ch = ramp[Math.min(ramp.length - 1, Math.floor(bright * (ramp.length - 1)))];
            screen.plot(ix, iy, 1 / (6 - pz), ch);
          }
        }

        // ---- flashing caption -----------------------------------------
        if (drawText) {
          var on = (Math.floor(t * 2) % 4) !== 3;   // brief flicker off
          if (on) {
            var label = 'AS SEEN ON TV';
            if (label.length > picW) label = 'AS SEEN';
            if (label.length > picW) label = 'ON TV';
            if (label.length > picW) label = 'TV';
            var tX = sx0 + Math.floor((picW - label.length) / 2);
            screen.text(tX, textRow, label);
          }
        }

        // ---- climbing sales chart -------------------------------------
        if (chartMaxH > 0 && chartBaseY >= sy0) {
          var nb = Math.min(picW, 8);
          for (var bi = 0; bi < nb; bi++) {
            var wave = 0.5 + 0.5 * Math.sin(t * 1.0 - bi * 0.55);
            var climb = 0.5 + 0.5 * Math.sin(t * 0.35 + bi * 0.3);
            var h = 1 + Math.floor((wave * 0.6 + climb * 0.4) * (chartMaxH - 1) + 0.5);
            h = Math.max(1, Math.min(chartMaxH, h));
            var bx = sx0 + bi;
            for (var hh = 0; hh < h; hh++) {
              var yb = chartBaseY - hh;
              if (yb < sy0) break;
              screen.set(bx, yb, hh === h - 1 ? '#' : '|');
            }
          }
        }
      }

      // ---- control panel (knobs, meters, ticking readouts) -------------
      if (cpw > 0) {
        var cpx0 = sx1 + 2;
        var cpx1 = bx1 - 1;
        var cpMid = Math.floor((cpx0 + cpx1) / 2);
        var panH = by1 - by0 - 1;

        // Two rotating knobs.
        function knob(kx, ky, phase) {
          if (ky <= by0 || ky >= by1) return;
          screen.set(kx - 1, ky, '(');
          screen.set(kx + 1, ky, ')');
          screen.set(kx, ky, knobTicks[phase & 3]);
        }
        var kFast = Math.floor(t * 5) & 3;
        var kSlow = Math.floor(t * 1.5) & 3;
        knob(cpMid, by0 + 2, kFast);
        if (panH >= 6) knob(cpMid, by0 + 5, kSlow);

        // Vertical VU meter (a live, flickering metric) at the right edge.
        var meterX = cpx1 - 1;
        var meterTop = by0 + 2;
        var meterBot = by1 - 3;
        if (meterBot > meterTop && meterX > cpx0) {
          var span = meterBot - meterTop;
          var lvl = 0.5 + 0.5 * Math.sin(t * 6.0) * 0.7 + 0.3 * (noise2(t * 3, 7) - 0.5);
          lvl = clamp(lvl, 0, 1);
          var fill = Math.round(lvl * span);
          for (var mv = 0; mv <= span; mv++) {
            var my = meterBot - mv;
            screen.set(meterX, my, mv <= fill ? '=' : ':');
          }
        }

        // Channel readout + climbing units-sold counter along the bottom.
        var ch2 = 2 + (Math.floor(t * 0.5) % 98);
        var chStr = 'CH' + (ch2 < 10 ? '0' + ch2 : ch2);
        if (by1 - 3 > by0 && cpw >= 4) screen.text(cpx0, by1 - 3, chStr.slice(0, cpw));

        var sold = Math.floor(t * 17) % 100000;
        var soldStr = '' + sold;
        while (soldStr.length < 5) soldStr = '0' + soldStr;
        if (cpw >= 6 && by1 - 2 > by0) screen.text(cpx0, by1 - 2, 'SOLD'.slice(0, cpw));
        if (by1 - 1 > by0) screen.text(cpx0, by1 - 1, soldStr.slice(0, cpw));
      }
    };
  }
});
