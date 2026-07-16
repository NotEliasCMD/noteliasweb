/*
 * notfound — the text "404" as a flat slab of glyph pixels, spun a full
 * 360 about the vertical axis in an endless loop. Same trick as the
 * donut: every lit pixel is a 3D point, rotated by an angle B, projected
 * through a pinhole camera (1/z), and z-buffered so the near face hides
 * the far one. Depth drives brightness on the donut ramp, so the slab
 * looks solid as it turns edge-on and flat again.
 *
 * The loop starts at B = 0, i.e. the "404" facing the viewer head-on.
 */
ASCII.register({
  id: 'notfound',
  title: '404 Spin',
  description: 'The text "404" as a pixel slab, spinning a full turn about the vertical axis; starts facing the viewer.',
  cols: 80, rows: 30, fps: 30,
  create: function (cols, rows) {
    var ramp = ASCII.util.LUMINANCE;

    // 5x7 bitmap font for the two glyphs we need.
    var FONT = {
      '4': [
        '...#.',
        '..##.',
        '.#.#.',
        '#..#.',
        '#####',
        '...#.',
        '...#.'
      ],
      '0': [
        '.###.',
        '#...#',
        '#..##',
        '#.#.#',
        '##..#',
        '#...#',
        '.###.'
      ]
    };

    var text = '404';
    var GW = 5, GH = 7, GAP = 1;
    var totalW = text.length * GW + (text.length - 1) * GAP;

    // Build model-space points, centred on the origin, in the XY plane.
    // Each lit cell is supersampled into a SUBxSUB grid of points so the
    // slab paints solid (one font cell covers several screen cells).
    var SCALE = 0.16;
    var SUB = 4;
    var pts = [];
    for (var g = 0; g < text.length; g++) {
      var rowsG = FONT[text[g]];
      var baseCol = g * (GW + GAP);
      for (var r = 0; r < GH; r++) {
        for (var c = 0; c < GW; c++) {
          if (rowsG[r][c] !== '#') continue;
          for (var su = 0; su < SUB; su++) {
            for (var sv = 0; sv < SUB; sv++) {
              var cc = baseCol + c + su / SUB;
              var rr = r + sv / SUB;
              var mx = (cc - (totalW - 1) / 2) * SCALE;
              var my = -((rr - (GH - 1) / 2)) * SCALE;
              pts.push([mx, my]);
            }
          }
        }
      }
    }

    // Camera / projection, cousins of the donut's K1/K2.
    var K2 = 5;
    var K1 = Math.min(cols, rows * 2) * K2 * 0.42;
    var cx = cols / 2, cy = rows / 2;
    var B = 0; // start facing the viewer

    return function frame(screen) {
      var cosB = Math.cos(B), sinB = Math.sin(B);

      for (var i = 0; i < pts.length; i++) {
        var x0 = pts[i][0], y = pts[i][1];
        // Rotate about the vertical (Y) axis: z starts at 0 for a flat slab.
        var x = x0 * cosB;
        var z = x0 * sinB;
        var ooz = 1 / (z + K2);
        var xp = (cx + K1 * ooz * x) | 0;
        var yp = (cy - K1 * ooz * y * 0.5) | 0;

        // Nearer points (bigger ooz) are brighter. Map depth onto the ramp.
        var b = (ooz - 1 / (K2 + 1)) / (1 / (K2 - 1) - 1 / (K2 + 1));
        var ch = screen.shade(0.25 + 0.75 * b, ramp);
        screen.plot(xp, yp, ooz, ch);
      }

      B += 0.045; // ~0.72 rad/s at 30fps; a full turn every ~2.3s
      if (B >= ASCII.util.TAU) B -= ASCII.util.TAU;
    };
  }
});
