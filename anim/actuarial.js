/*
 * actuarial — an actuarial survival curve. A cohort ages across the x-axis
 * as a marker slides down the mortality curve, with live age / survivors%
 * readouts ticking against a faint plotting grid.
 */
ASCII.register({
  id: 'actuarial',
  title: 'Actuarial Curve',
  description: 'A mortality survival curve where a cohort ages: a marker rides down the curve while age and survivors% tick.',
  cols: 60, rows: 26, fps: 12,
  create: function (cols, rows) {
    var ramp = ASCII.util.LUMINANCE;   // '.,-~:;=!*#$@'
    var clamp = ASCII.util.clamp;
    var MAX_AGE = 110;

    // Survival function S(age) in [0,1]: near-flat early, steep collapse ~75-95.
    // A logistic decline gives the classic rectangular-ish life-table curve.
    function survival(age) {
      var k = 0.13, mid = 82;
      var s = 1 / (1 + Math.exp(k * (age - mid)));
      // gentle infant/early attrition so it is not perfectly flat
      s *= 1 - 0.04 * (age / MAX_AGE);
      return clamp(s, 0, 1);
    }

    return function frame(screen, t, frameCount) {
      var cx = Math.floor(cols / 2);

      // ---- plot area geometry (derive everything from cols/rows) ----
      var left = Math.min(6, Math.max(3, Math.floor(cols * 0.1)));
      var right = cols - 2;
      var top = 2;
      var bottom = rows - 3;
      if (right <= left) right = left + 1;
      if (bottom <= top) bottom = top + 1;
      var pw = right - left;
      var ph = bottom - top;

      // maps age[0..MAX_AGE] -> column, survival[0..1] -> row
      function ax(age) { return left + Math.round((age / MAX_AGE) * pw); }
      function ay(s) { return top + Math.round((1 - s) * ph); }

      // ---- faint grid ----
      var gy;
      for (gy = 0; gy <= 4; gy++) {
        var ry = top + Math.round((gy / 4) * ph);
        for (var gx = left; gx <= right; gx++) {
          if (screen.get(gx, ry) === ' ') screen.set(gx, ry, gx % 3 === 0 ? '.' : ' ');
        }
      }
      var decades = Math.floor(MAX_AGE / 20);
      for (var d = 0; d <= decades; d++) {
        var vx = left + Math.round((d * 20 / MAX_AGE) * pw);
        for (var vy = top; vy <= bottom; vy++) {
          if (screen.get(vx, vy) === ' ') screen.set(vx, vy, vy % 2 === 0 ? ':' : ' ');
        }
      }

      // ---- axes ----
      for (var axx = left; axx <= right; axx++) screen.set(axx, bottom, '-');
      for (var axy = top; axy <= bottom; axy++) screen.set(left, axy, '|');
      screen.set(left, bottom, '+');

      // ---- the survival curve ----
      var px = -1, py = -1;
      for (var age = 0; age <= MAX_AGE; age++) {
        var s = survival(age);
        var x = ax(age), y = ay(s);
        if (px >= 0) screen.line(px, py, x, y, '#');
        px = x; py = y;
      }

      // ---- animated cohort marker riding the curve ----
      var period = 14; // seconds per full lifetime sweep
      var phase = (t % period) / period;
      var curAge = phase * MAX_AGE;
      var curS = survival(curAge);
      var mx = ax(curAge), my = ay(curS);

      // vertical drop line + shaded area sweep behind the marker
      for (var fy = my; fy <= bottom - 1; fy++) {
        if (screen.get(mx, fy) === ' ' || screen.get(mx, fy) === '.') screen.set(mx, fy, ':');
      }
      // faint filled region up to current age using the luminance ramp
      for (var ffx = left + 1; ffx < mx; ffx++) {
        var a2 = ((ffx - left) / pw) * MAX_AGE;
        var sy = ay(survival(a2));
        var col = ffx % 2 === 0 ? ',' : '.';
        for (var yy = sy + 1; yy <= bottom - 1; yy++) {
          if (screen.get(ffx, yy) === ' ') screen.set(ffx, yy, col);
        }
      }

      // pulsing marker glyph
      var pulse = (frameCount % 4) < 2 ? 'O' : '@';
      screen.set(mx, my, pulse);

      // ---- readouts ----
      var survPct = (curS * 100);
      var ageStr = 'AGE ' + Math.round(curAge);
      var survStr = 'SURVIVORS ' + survPct.toFixed(1) + '%';
      var alive = Math.round(curS * 100000);
      var liveStr = 'l(x) ' + alive;

      // top header (guard against narrow grids)
      var header = 'LIFE TABLE  cohort=100000';
      if (cols >= header.length + 2) screen.text(left, 0, header);
      else if (cols >= 6) screen.text(0, 0, 'LIFE');

      // right/inline readout box near the marker but kept on-grid
      var boxX = clamp(mx + 2, left + 1, cols - 1 - Math.max(ageStr.length, survStr.length));
      var boxY = clamp(my - 1, top, bottom - 3);
      if (boxX + ageStr.length <= cols) screen.text(boxX, boxY, ageStr);
      if (boxX + survStr.length <= cols) screen.text(boxX, boxY + 1, survStr);
      if (boxX + liveStr.length <= cols) screen.text(boxX, boxY + 2, liveStr);

      // ---- x-axis tick labels (age decades) ----
      var labelRow = bottom + 1;
      if (labelRow < rows) {
        for (var dd = 0; dd <= decades; dd += 1) {
          var ageLbl = dd * 20;
          var lx = ax(ageLbl) - (ageLbl >= 100 ? 1 : (ageLbl >= 10 ? 1 : 0));
          var lbl = '' + ageLbl;
          if (lx >= 0 && lx + lbl.length <= cols) screen.text(lx, labelRow, lbl);
        }
      }

      // ---- y-axis label + a ticking scan cursor for "data science" feel ----
      var scanRow = bottom + 2;
      if (scanRow < rows) {
        var mortRate = ((survival(Math.max(0, curAge - 1)) - curS) * 1000);
        var footer = 'qx/1000 ' + Math.max(0, mortRate).toFixed(2) +
                     '   t=' + (t).toFixed(1) + 's';
        if (footer.length <= cols) screen.text(0, scanRow, footer);
        else if (cols >= 8) screen.text(0, scanRow, 'qx ' + Math.max(0, mortRate).toFixed(1));
      }
    };
  }
});
