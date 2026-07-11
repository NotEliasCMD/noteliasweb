/*
 * plasma — the classic demoscene plasma field. Several sine waves in
 * x, y, radius and time are summed and the result is mapped through
 * the luminance ramp. Pure per-cell function of position and time.
 */
ASCII.register({
  id: 'plasma',
  title: 'Plasma Field',
  description: 'Summed sine waves in space and time, mapped to the brightness ramp.',
  cols: 90, rows: 34, fps: 30,
  create: function (cols, rows) {
    var ramp = ' .,-~:;=!*#$@';
    return function frame(screen, t) {
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var nx = x / cols * 2 - 1;
          var ny = (y / rows * 2 - 1) * (rows / cols) * 2; // aspect fix
          var v = Math.sin(nx * 4 + t);
          v += Math.sin((ny * 4 + t) * 1.3);
          v += Math.sin((nx * 3 + ny * 3 + t) * 0.8);
          var cx = Math.sin(t * 0.5), cy = Math.cos(t * 0.4);
          v += Math.sin(Math.hypot(nx - cx, ny - cy) * 6 - t * 2);
          var b = (v + 4) / 8; // normalize ~0..1
          screen.set(x, y, ramp[(b * (ramp.length - 1)) | 0]);
        }
      }
    };
  }
});
