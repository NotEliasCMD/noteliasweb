/*
 * buyfunnel — a marketing conversion funnel. Leads pour in at the top and
 * fall through four narrowing stages (AWARENESS, INTEREST, DESIRE, ACTION);
 * many leak out through the walls along the way, a few make it to the bottom
 * and convert. Purely visual; per-lead motion is deterministic.
 */
ASCII.register({
  id: 'buyfunnel',
  title: 'Conversion Funnel',
  description: 'Leads fall through a narrowing four-stage funnel; most leak out, a few convert at the bottom.',
  cols: 46, rows: 28, fps: 18,
  create: function (cols, rows) {
    var util = ASCII.util;
    var clamp = util.clamp;
    var lerp = util.lerp;

    var stages = ['AWARENESS', 'INTEREST', 'DESIRE', 'ACTION'];

    var nLeads = 40;
    var leads = [];
    for (var i = 0; i < nLeads; i++) {
      leads.push({
        speed: 0.18 + util.hash(i, 2) * 0.22,
        phase: util.hash(i, 5),
        lane: util.hash(i, 8) * 2 - 1,          // -1..1 across the funnel
        keep: util.hash(i, 12)                   // survives to depth `keep`
      });
    }

    return function frame(screen, t, frameCount) {
      var cx = Math.floor(cols / 2);
      var topY = 1;
      var botY = rows - 2;
      var funH = Math.max(4, botY - topY);
      var topHalf = Math.max(4, Math.round(cols * 0.36));
      var botHalf = Math.max(1, Math.round(cols * 0.06));

      function halfAt(fr) { return Math.round(lerp(topHalf, botHalf, fr)); }

      // ---- funnel walls + stage bands --------------------------------
      for (var y = topY; y <= botY; y++) {
        var fr = (y - topY) / funH;
        var half = halfAt(fr);
        screen.set(cx - half, y, '\\');
        screen.set(cx + half, y, '/');
      }
      // stage divider lines + labels
      for (var s = 0; s < stages.length; s++) {
        var fr2 = s / stages.length;
        var yy = clamp(Math.round(topY + fr2 * funH), topY, botY);
        var half2 = halfAt(fr2);
        for (var dx = -half2 + 1; dx < half2; dx++) {
          if ((dx + 100) % 2 === 0) screen.set(cx + dx, yy, '-');
        }
        var label = stages[s];
        if (cols >= label.length + 2) {
          screen.text(clamp(cx - Math.floor(label.length / 2), 0, cols - label.length), yy, label);
        }
      }

      // ---- leads falling / leaking -----------------------------------
      for (var i = 0; i < leads.length; i++) {
        var L = leads[i];
        var life = (t * L.speed + L.phase) % 1;      // 0 top .. 1 bottom
        var fr3 = life;
        var half3 = halfAt(fr3);
        var y3 = clamp(Math.round(topY + fr3 * funH), topY, botY);
        if (life <= L.keep) {
          // inside the funnel, drifting with its lane
          var x3 = Math.round(cx + L.lane * (half3 - 1));
          if (screen.get(x3, y3) === ' ') screen.set(x3, y3, life < 0.9 ? '*' : '$');
        } else {
          // leaked out: spill through the wall and drift down-out, fading
          var out = (life - L.keep) * funH * 0.8;
          var side = L.lane >= 0 ? 1 : -1;
          var xo = Math.round(cx + side * (half3 + 1 + out));
          var yo = clamp(y3 + Math.round(out * 0.4), topY, rows - 1);
          if (xo > 0 && xo < cols && screen.get(xo, yo) === ' ') screen.set(xo, yo, out < 2 ? '.' : ',');
        }
      }

      // ---- converted output at the spout -----------------------------
      var spoutY = clamp(botY + 1, 0, rows - 1);
      var pulse = (frameCount % 8) < 4;
      screen.set(cx, spoutY, pulse ? '$' : 'v');
    };
  }
});
