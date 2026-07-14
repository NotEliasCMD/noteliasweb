/*
 * swanflight — a swan beats across the sky over distant water, long neck
 * outstretched, wings sweeping through a full up/down flap cycle as the body
 * bobs with each stroke. Purely visual; motion driven by sin(t).
 */
ASCII.register({
  id: 'swanflight',
  title: 'Swan in Flight',
  description: 'A swan flaps across the sky over the water, wings sweeping up and down, neck outstretched.',
  cols: 54, rows: 24, fps: 18,
  create: function (cols, rows) {
    var util = ASCII.util;
    var clamp = util.clamp;
    var lerp = util.lerp;

    return function frame(screen, t, frameCount) {
      var waterY = rows - 2;

      // ---- distant water -------------------------------------------
      for (var wx = 0; wx < cols; wx++) {
        var wv = util.noise2(wx * 0.4 + t * 0.4, 7.1);
        screen.set(wx, waterY, wv > 0.6 ? '~' : '-');
        if (wv > 0.8) screen.set(wx, clamp(waterY - 1, 0, rows - 1), '.');
      }

      // ---- flight path + flap ----------------------------------------
      var travel = (t / 9) % 1;
      var bodyX = Math.round(lerp(6, cols - 8, travel));
      var flap = Math.sin(t * 4.5);                 // -1 (down) .. 1 (up)
      var bodyY = clamp(Math.round(rows * 0.42 - flap * 1.5), 2, waterY - 3);

      // ---- body ------------------------------------------------------
      var bodyHalf = Math.max(2, Math.round(cols * 0.06));
      for (var bx = -bodyHalf; bx <= bodyHalf; bx++) {
        var ch = (bx === -bodyHalf) ? '<' : (bx === bodyHalf) ? '=' : '#';
        screen.set(bodyX + bx, bodyY, ch);
      }
      // tail (trailing, left)
      screen.set(bodyX - bodyHalf - 1, bodyY, '<');

      // ---- outstretched neck + head + beak (forward, right) ----------
      var neckLen = Math.max(2, Math.round(cols * 0.09));
      var ny = bodyY - (flap > 0 ? 1 : 0);
      for (var n = 1; n <= neckLen; n++) {
        screen.set(clamp(bodyX + bodyHalf + n, 0, cols - 1), ny, '~');
      }
      var headX = clamp(bodyX + bodyHalf + neckLen + 1, 0, cols - 1);
      screen.set(headX, ny, 'o');
      screen.set(clamp(headX + 1, 0, cols - 1), ny, '>');

      // ---- wings sweeping through the flap ---------------------------
      var wingSpan = Math.max(3, Math.round(cols * 0.12));
      var lift = flap;                              // +up, -down
      for (var w = 1; w <= wingSpan; w++) {
        var fr = w / wingSpan;
        var dy = Math.round(-lift * fr * wingSpan * 0.6);
        var lch = lift >= 0 ? '/' : '\\';
        var rch = lift >= 0 ? '\\' : '/';
        screen.set(clamp(bodyX - w, 0, cols - 1), clamp(bodyY + dy, 0, rows - 1), lch);
        screen.set(clamp(bodyX + w, 0, cols - 1), clamp(bodyY + dy, 0, rows - 1), rch);
      }
      // wing tips
      var tipDy = Math.round(-lift * wingSpan * 0.6);
      screen.set(clamp(bodyX - wingSpan, 0, cols - 1), clamp(bodyY + tipDy, 0, rows - 1), lift >= 0 ? '\'' : '.');
      screen.set(clamp(bodyX + wingSpan, 0, cols - 1), clamp(bodyY + tipDy, 0, rows - 1), lift >= 0 ? '\'' : '.');
    };
  }
});
