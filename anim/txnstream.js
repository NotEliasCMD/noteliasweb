/*
 * txnstream — a live transaction stream under fraud scoring. Rows scroll
 * upward: each is a masked card, a pseudo amount and a verdict. Most read OK;
 * a deterministic subset (high fraud score) flash and get stamped FRAUD with
 * a leading >. A fraud-score meter bar runs along the bottom, tracking the
 * current top row's score. Every row is a pure function of its absolute index,
 * so the scroll is reproducible with no stored state.
 */
ASCII.register({
  id: 'txnstream',
  title: 'Transaction Stream',
  description: 'A scrolling ledger of scored card transactions; suspicious rows flash and get stamped FRAUD, with a live score meter.',
  cols: 60, rows: 24, fps: 8,
  create: function (cols, rows) {
    var util = ASCII.util;
    var clamp = util.clamp;
    var ramp = util.LUMINANCE;

    // deterministic per-row fields from the absolute row index
    function rowData(idx) {
      var h1 = util.hash(idx * 1.7 + 0.3, 11.1);
      var h2 = util.hash(idx * 2.9 + 5.5, 3.7);
      var h3 = util.hash(idx * 0.7 + 9.1, 8.2);
      var last4 = 1000 + Math.floor(h1 * 9000);          // 4-digit tail
      var amount = (5 + h2 * 4995);                       // $5 .. $5000
      var score = h3;                                     // 0..1 fraud score
      return { last4: last4, amount: amount, score: score };
    }

    function money(v) {
      var s = v.toFixed(2);
      // thousands separator
      var parts = s.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return '$' + parts[0] + '.' + parts[1];
    }

    return function frame(screen, t, frameCount) {
      var headY = 0;
      screen.text(1, headY, 'TRANSACTION STREAM');
      var scoreHdr = 'SCORE';
      screen.text(clamp(cols - scoreHdr.length - 1, 0, cols - 1), headY, scoreHdr);
      for (var u = 0; u < cols; u++) screen.set(u, headY + 1, '-');

      var top = headY + 2;
      var bot = rows - 3;               // leave 2 rows for the meter
      var visible = bot - top + 1;

      // absolute scroll position advances with time; newest row at the top.
      var scroll = Math.floor(t * 3);   // rows per second
      var THRESH = 0.80;                // fraud decision threshold

      var topScore = 0;
      for (var r = 0; r < visible; r++) {
        var idx = scroll + r;           // absolute row index
        var y = top + r;
        var d = rowData(idx);
        if (r === 0) topScore = d.score;
        var fraud = d.score >= THRESH;

        // brightness of the row fades slightly with depth in the list
        var fade = 1 - r / (visible + 2);

        var card = '**** **** **** ' + d.last4;
        var amt = money(d.amount);
        var pct = Math.round(d.score * 100) + '%';

        var lead = fraud ? '>' : ' ';
        var verdict = fraud ? 'FRAUD' : 'OK';
        // suspicious rows blink their stamp
        if (fraud && (frameCount % 4) >= 2) verdict = '     ';

        // left block: lead + card + amount
        var left = lead + ' ' + card + '  ' + amt;
        screen.text(1, y, left.slice(0, cols - 12));

        // right block: score % and verdict, right-aligned
        var right = pct;
        screen.text(clamp(cols - 12, 0, cols - 1), y, right);
        screen.text(clamp(cols - verdict.length - 1, 0, cols - 1), y, verdict);

        // dim the non-fraud rows a touch by overwriting the card mask ramp
        if (!fraud && fade < 0.5) {
          // fainter separator dot for old rows
          screen.set(0, y, '.');
        }
      }

      // ---- fraud-score meter (tracks top row) ------------------------
      var meterY = rows - 1;
      var labY = rows - 2;
      screen.text(1, labY, 'TOP SCORE ' + Math.round(topScore * 100) + '%');
      var barW = cols - 2;
      var fill = Math.round(topScore * barW);
      for (var m = 0; m < barW; m++) {
        var frac = m / barW;
        var ch;
        if (m < fill) {
          ch = screen.shade(clamp(0.3 + frac, 0, 1), ramp);
        } else {
          ch = '.';
        }
        screen.set(1 + m, meterY, ch);
      }
    };
  }
});
