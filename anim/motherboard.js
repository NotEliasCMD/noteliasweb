/*
 * motherboard — a PCB with a CPU socket, RAM slots and copper traces.
 * Bright data pulses race from the CPU out along the traces to the RAM
 * slots; a CPU-die heatmap flickers, a clock 'MHz' readout jitters and a
 * live bus-activity bar sweeps along the bottom.
 */
ASCII.register({
  id: 'motherboard',
  title: 'Motherboard',
  description: 'A PCB with a CPU socket and RAM slots; data pulses race along the traces while a clock MHz readout and bus-activity bar animate.',
  cols: 64, rows: 28, fps: 16,
  create: function (cols, rows) {
    var util = ASCII.util;
    var clamp = util.clamp;

    // Layout is rebuilt whenever the grid size changes so the piece stays
    // sane from 20x12 all the way up to 120x50.
    var LW = -1, LH = -1;
    var L = null;

    function buildTrace(pts) {
      // Filter out zero-length hops so a corner isn't duplicated.
      var p = [pts[0]];
      for (var j = 1; j < pts.length; j++) {
        var prev = p[p.length - 1];
        if (pts[j].x !== prev.x || pts[j].y !== prev.y) p.push(pts[j]);
      }
      var cells = [];
      if (p.length < 2) return cells;
      for (var i = 0; i < p.length - 1; i++) {
        var a = p[i], b = p[i + 1];
        var dx = b.x > a.x ? 1 : (b.x < a.x ? -1 : 0);
        var dy = b.y > a.y ? 1 : (b.y < a.y ? -1 : 0);
        var g = dx !== 0 ? '-' : '|';
        var x = a.x, y = a.y;
        if (i !== 0) { x += dx; y += dy; } // start already pushed as corner
        for (;;) {
          cells.push({ x: x, y: y, g: g });
          if (x === b.x && y === b.y) break;
          x += dx; y += dy;
        }
        if (i < p.length - 2) cells[cells.length - 1].g = '+'; // interior corner
      }
      return cells;
    }

    function build(cw, ch) {
      var lay = {};
      var top = 0;                     // clock readout row
      var bot = ch - 1;                // bus-activity row
      var rTop = 1;                    // board region
      var rBot = ch - 2;
      if (rBot < rTop) rBot = rTop;
      var rCy = Math.floor((rTop + rBot) / 2);

      // CPU socket, left-of-centre.
      var cx = Math.floor(cw * 0.30);
      var hx = clamp(Math.floor(cw / 12), 1, 6);
      var hy = clamp(Math.floor((rBot - rTop - 1) / 2), 1, 4);
      cx = clamp(cx, hx + 1, cw - hx - 2);
      var cpu = { x0: cx - hx, x1: cx + hx, y0: rCy - hy, y1: rCy + hy, cx: cx, cy: rCy };

      // RAM slots on the right, vertical DIMM rectangles.
      var slotW = cw >= 44 ? 2 : 1;
      var rightStart = cpu.x1 + Math.max(3, Math.floor(cw * 0.12));
      var avail = (cw - 2) - rightStart;
      var nSlots = clamp(Math.floor(avail / (slotW + 3)), 1, 4);
      var sTop = rTop, sBot = rBot;
      if (sBot - sTop < 2) sBot = sTop + 2;
      var slots = [];
      var span = nSlots > 1 ? Math.floor(avail / nSlots) : 0;
      var s;
      for (s = 0; s < nSlots; s++) {
        var sx = rightStart + s * (span > 0 ? span : (slotW + 3));
        sx = clamp(sx, cpu.x1 + 3, cw - slotW - 2);
        slots.push({ x0: sx, x1: sx + slotW, y0: sTop, y1: sBot,
                     cy: Math.floor((sTop + sBot) / 2) });
      }

      // Traces: one from a CPU right-edge port to each RAM slot (the path
      // the data pulses ride), plus a couple heading left/down to edge chips.
      var traces = [];
      for (s = 0; s < slots.length; s++) {
        var sl = slots[s];
        var py = clamp(cpu.y0 + 1 + s * 2, cpu.y0 + 1, cpu.y1 - 1);
        var midX = Math.floor((cpu.x1 + sl.x0) / 2) + (s % 2 === 0 ? 0 : 1);
        midX = clamp(midX, cpu.x1 + 1, sl.x0 - 1);
        var pts = [
          { x: cpu.x1, y: py },
          { x: midX, y: py },
          { x: midX, y: sl.cy },
          { x: sl.x0, y: sl.cy }
        ];
        traces.push({ cells: buildTrace(pts),
                      speed: 0.28 + util.hash(s + 1, 7) * 0.30,
                      phase: util.hash(s + 3, 11),
                      np: 1 + (sl.cells ? 0 : (s % 2)) });
      }
      // A couple of buses to the left / bottom edges (chips), for texture.
      var edgeChips = [];
      var lyA = clamp(cpu.cy - 1, rTop, rBot);
      var lyB = clamp(cpu.cy + 1, rTop, rBot);
      var lx = clamp(2, 1, cpu.x0 - 2);
      if (cpu.x0 - 2 >= 1) {
        traces.push({ cells: buildTrace([
          { x: cpu.x0, y: lyA }, { x: lx + 1, y: lyA }, { x: lx + 1, y: lyA }]),
          speed: 0.35, phase: 0.2, np: 1 });
        traces.push({ cells: buildTrace([
          { x: cpu.x0, y: lyB }, { x: lx + 1, y: lyB }]),
          speed: 0.24, phase: 0.6, np: 1 });
        edgeChips.push({ x0: lx - 0, y0: clamp(lyA - 1, rTop, rBot),
                         x1: lx + 1, y1: clamp(lyB + 1, rTop, rBot) });
      }
      var byd = clamp(cpu.y1 + 1, rTop, rBot);
      if (byd <= rBot && byd > cpu.y1) {
        traces.push({ cells: buildTrace([
          { x: cpu.cx, y: cpu.y1 }, { x: cpu.cx, y: byd }]),
          speed: 0.30, phase: 0.45, np: 1 });
      }

      lay.top = top; lay.bot = bot; lay.rTop = rTop; lay.rBot = rBot;
      lay.cpu = cpu; lay.slots = slots; lay.traces = traces;
      lay.edgeChips = edgeChips; lay.slotW = slotW;
      return lay;
    }

    function drawBox(screen, x0, y0, x1, y1) {
      var x, y;
      for (x = x0; x <= x1; x++) { screen.set(x, y0, '-'); screen.set(x, y1, '-'); }
      for (y = y0; y <= y1; y++) { screen.set(x0, y, '|'); screen.set(x1, y, '|'); }
      screen.set(x0, y0, '+'); screen.set(x1, y0, '+');
      screen.set(x0, y1, '+'); screen.set(x1, y1, '+');
    }

    var ramp = util.LUMINANCE;             // '.,-~:;=!*#$@'
    var pulseTail = ['@', '#', '*', '=', ':', '.'];

    return function frame(screen, t, frameCount) {
      var cw = screen.cols, ch = screen.rows;
      if (cw !== LW || ch !== LH) { L = build(cw, ch); LW = cw; LH = ch; }
      var i, j, x, y;
      var cpu = L.cpu;

      // --- traces (dim copper baseline) ---
      for (i = 0; i < L.traces.length; i++) {
        var cells = L.traces[i].cells;
        for (j = 0; j < cells.length; j++) screen.set(cells[j].x, cells[j].y, cells[j].g);
      }

      // --- edge chips ---
      for (i = 0; i < L.edgeChips.length; i++) {
        var ec = L.edgeChips[i];
        if (ec.x1 > ec.x0 && ec.y1 > ec.y0) drawBox(screen, ec.x0, ec.y0, ec.x1, ec.y1);
      }

      // --- RAM slots with scrolling memory fill ---
      for (i = 0; i < L.slots.length; i++) {
        var sl = L.slots[i];
        drawBox(screen, sl.x0, sl.y0, sl.x1, sl.y1);
        for (y = sl.y0 + 1; y <= sl.y1 - 1; y++) {
          for (x = sl.x0 + 1; x <= sl.x1 - 1; x++) {
            var b = util.noise2(x * 0.9 + i, y * 0.6 - t * 2.4);
            screen.set(x, y, b > 0.55 ? screen.shade(b, ramp) : '.');
          }
        }
      }

      // --- CPU socket + die-activity heatmap ---
      drawBox(screen, cpu.x0, cpu.y0, cpu.x1, cpu.y1);
      for (y = cpu.y0 + 1; y <= cpu.y1 - 1; y++) {
        for (x = cpu.x0 + 1; x <= cpu.x1 - 1; x++) {
          var load = util.noise2(x * 0.7 - t * 1.7, y * 0.7 + t * 1.1);
          screen.set(x, y, screen.shade(clamp(load * 1.15, 0, 1), ramp));
        }
      }
      // CPU label overlaid on the middle row if it fits.
      if (cpu.x1 - cpu.x0 >= 4) {
        var lbl = 'CPU';
        var lx = cpu.cx - Math.floor(lbl.length / 2);
        if (lx > cpu.x0 && lx + lbl.length <= cpu.x1) screen.text(lx, cpu.cy, lbl);
      }

      // --- data pulses racing CPU -> slots ---
      for (i = 0; i < L.traces.length; i++) {
        var tr = L.traces[i];
        var tc = tr.cells;
        if (tc.length === 0) continue;
        for (var p = 0; p < tr.np; p++) {
          var frac = ((t * tr.speed + tr.phase + p / tr.np) % 1 + 1) % 1;
          var head = frac * tc.length;
          for (var k = 0; k < pulseTail.length; k++) {
            var idx = Math.floor(head) - k;
            if (idx >= 0 && idx < tc.length) screen.set(tc[idx].x, tc[idx].y, pulseTail[k]);
          }
        }
      }

      // --- clock MHz readout (top row) ---
      var mhz = 3200 + Math.round(Math.sin(t * 3.1) * 45 +
                                  (util.noise2(t * 2.0, 5) - 0.5) * 120);
      var clk = 'CLK ' + mhz + 'MHz';
      screen.text(0, L.top, clk.length <= cw ? clk : clk.slice(0, cw));

      // --- bus-activity bar (bottom row) ---
      if (ch >= 2) {
        var label = 'BUS ';
        var pct = clamp(0.55 + 0.4 * Math.sin(t * 1.3) +
                        (util.noise2(t * 3.0, 9) - 0.5) * 0.35, 0.02, 0.99);
        var barW = clamp(cw - label.length - 7, 3, cw);
        var fill = Math.round(pct * barW);
        screen.text(0, L.bot, label);
        var bx = label.length;
        screen.set(bx, L.bot, '[');
        for (j = 0; j < barW; j++) {
          screen.set(bx + 1 + j, L.bot, j < fill ? '#' : '-');
        }
        screen.set(bx + 1 + barW, L.bot, ']');
        var ptxt = ' ' + Math.round(pct * 100) + '%';
        screen.text(bx + 2 + barW, L.bot, ptxt);
      }
    };
  }
});
