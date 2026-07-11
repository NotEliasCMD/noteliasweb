/*
 * dna — a rotating double helix. Two phase-shifted sine strands with
 * "base pair" rungs between them, depth-shaded so the front of the
 * helix is bright and the back fades out.
 */
ASCII.register({
  id: 'dna',
  title: 'DNA Helix',
  description: 'A rotating double helix with base-pair rungs, depth-shaded front to back.',
  cols: 40, rows: 34, fps: 30,
  create: function (cols, rows) {
    var ramp = '.:-=+*o#@';
    var A = 0;

    return function frame(screen, t) {
      A += 0.06;
      var cx = cols / 2;
      var amp = cols * 0.32;
      for (var y = 0; y < rows; y++) {
        var phase = y * 0.5 + A;
        var z1 = Math.cos(phase);          // -1..1 depth of strand 1
        var z2 = Math.cos(phase + Math.PI); // strand 2 is half a turn away
        var x1 = cx + Math.sin(phase) * amp;
        var x2 = cx + Math.sin(phase + Math.PI) * amp;

        // rung between the two strands, dotted
        var lo = Math.min(x1, x2) | 0, hi = Math.max(x1, x2) | 0;
        for (var x = lo + 1; x < hi; x++) {
          if ((x + y) % 2 === 0) screen.set(x, y, '-');
        }

        var s1 = ramp[((z1 * 0.5 + 0.5) * (ramp.length - 1)) | 0];
        var s2 = ramp[((z2 * 0.5 + 0.5) * (ramp.length - 1)) | 0];
        // draw the nearer strand last so it wins the pixel
        if (z1 >= z2) { screen.set(x2, y, s2); screen.set(x1, y, s1); }
        else { screen.set(x1, y, s1); screen.set(x2, y, s2); }
      }
    };
  }
});
