/*
 * barchart — a bar-chart race: labeled bars grow, shrink and re-sort over
 * time with ramp-filled bars, live value tips, a ticking year, and a
 * highlighted leader. Reads as both a bar chart and a live data feed.
 */
ASCII.register({
  id: 'barchart',
  title: 'Bar Chart Race',
  description: 'Six labeled bars grow, re-sort and race over a ticking timeline while the leader is highlighted.',
  cols: 58, rows: 26, fps: 12,
  create: function (cols, rows) {
    var ramp = ASCII.util.LUMINANCE;            // '.,-~:;=!*#$@'
    var clamp = ASCII.util.clamp;

    // ---- one-time data setup -------------------------------------------
    var names = ['PYTHON', 'RUST', 'GO', 'JAVA', 'SQL', 'C++'];
    var N = names.length;
    var base = [62, 55, 50, 46, 42, 38];
    var freq = [0.31, 0.24, 0.4, 0.19, 0.35, 0.27];
    var phase = [0.0, 1.3, 2.6, 3.9, 5.2, 0.7];

    // Persistent smoothed rank position for each category (bar-race slide).
    var pos = new Array(N);
    for (var i = 0; i < N; i++) pos[i] = i;

    var vals = new Array(N);
    var order = new Array(N);

    function pad(str, w) {
      str = String(str);
      while (str.length < w) str += ' ';
      return str.slice(0, w);
    }

    return function frame(screen, t, frameCount) {
      // ---- current values ----------------------------------------------
      var maxVal = 1;
      for (var i = 0; i < N; i++) {
        var raw = base[i]
          + 34 * Math.sin(t * freq[i] + phase[i])
          + 14 * Math.sin(t * 0.9 + i * 1.1)
          + 6 * ASCII.util.noise2(i * 3.7, t * 0.5);
        var v = raw < 5 ? 5 : raw;
        vals[i] = v;
        order[i] = i;
        if (v > maxVal) maxVal = v;
      }

      // Sort indices by value, descending -> target ranks.
      order.sort(function (a, b) { return vals[b] - vals[a]; });
      var rank = new Array(N);
      for (i = 0; i < N; i++) rank[order[i]] = i;
      var leader = order[0];

      // Ease each bar toward its target rank so re-sorts slide smoothly.
      for (i = 0; i < N; i++) pos[i] += (rank[i] - pos[i]) * 0.18;

      // ---- layout (all derived from passed cols/rows) ------------------
      var headerH = rows >= 8 ? 2 : (rows >= 4 ? 1 : 0);
      var baseRow = rows - 2 >= headerH + 1 ? rows - 2 : rows - 1;
      var regionTop = headerH;
      var avail = baseRow - regionTop;
      if (avail < 1) avail = 1;
      var step = avail / N;

      var labelW = clamp(Math.floor(cols * 0.18), 3, 8);
      var barStart = labelW + 2;
      var valSpace = 5;
      var barMax = cols - barStart - valSpace;
      if (barMax < 1) barMax = 1;

      // ---- axis --------------------------------------------------------
      var axisX = barStart - 1;
      for (var ay = regionTop; ay < baseRow; ay++) screen.set(axisX, ay, '|');
      for (var ax = axisX; ax < cols; ax++) screen.set(ax, baseRow, '-');
      screen.set(axisX, baseRow, '+');

      // ---- bars --------------------------------------------------------
      for (i = 0; i < N; i++) {
        var by = Math.round(regionTop + pos[i] * step + step * 0.5 - 0.5);
        by = clamp(by, regionTop, baseRow - 1);

        var frac = vals[i] / maxVal;
        var len = Math.round(barMax * frac);
        if (len < 1) len = 1;
        var isLeader = (i === leader);

        // Ramp-filled bar: dim at base -> bright at the tip.
        for (var x = 0; x < len; x++) {
          var g = len > 1 ? x / (len - 1) : 1;
          var b = (isLeader ? 0.45 : 0.2) + 0.55 * g;
          screen.set(barStart + x, by, screen.shade(b, ramp));
        }
        // Bright cap at the tip.
        screen.set(barStart + len - 1, by, isLeader ? '@' : '#');

        // Label (left of the axis), leader marked.
        var lbl = pad(names[i], labelW);
        screen.text(0, by, lbl);
        screen.set(axisX, by, isLeader ? '#' : '|');
        if (isLeader && barStart >= 2) screen.set(barStart - 2, by, '>');

        // Value readout at the tip.
        var vstr = String(Math.round(vals[i]));
        screen.text(barStart + len + 1, by, vstr);
      }

      // ---- header: title, ticking year, live leader --------------------
      if (headerH >= 1) {
        screen.text(0, 0, 'BAR CHART RACE');
        var year = 2001 + Math.floor(t * 2.5);
        var ystr = 'YR ' + year;
        screen.text(cols - ystr.length, 0, ystr);
      }
      if (headerH >= 2) {
        var pulse = (Math.floor(frameCount / 3) % 2 === 0) ? '* ' : '  ';
        screen.text(0, 1, pulse + 'LEAD ' + names[leader]);
        var total = 0;
        for (i = 0; i < N; i++) total += vals[i];
        var sstr = 'SUM ' + Math.round(total);
        screen.text(cols - sstr.length, 1, sstr);
      }
    };
  }
});
