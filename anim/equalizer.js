/*
 * equalizer — a spectrum-analyzer bar equalizer bouncing to a synthesized beat,
 * with falling peak-hold caps, a live BPM readout, and a beat pulse.
 */
ASCII.register({
  id: 'equalizer',
  title: 'Equalizer',
  description: 'A 16-band spectrum analyzer bouncing to a synth beat with peak-hold caps and a live BPM readout.',
  cols: 60, rows: 24, fps: 24,
  create: function (cols, rows) {
    var ramp = ASCII.util.LUMINANCE;   // '.,-~:;=!*#$@'  dim -> bright
    var clamp = ASCII.util.clamp;
    var TAU = ASCII.util.TAU;

    var NBANDS = 16;
    var BPM = 128;
    var beatHz = BPM / 60;             // beats per second

    // Per-band oscillator params (deterministic, set once).
    var bands = [];
    for (var i = 0; i < NBANDS; i++) {
      var f = i / (NBANDS - 1);        // 0..1 across the spectrum
      bands.push({
        rate: 0.7 + ASCII.util.hash(i, 3) * 4.5,   // Hz-ish wobble
        rate2: 0.3 + ASCII.util.hash(i, 9) * 2.0,
        phase: ASCII.util.hash(i, 17) * TAU,
        // bass bands (low i) get more low-frequency energy
        bass: Math.pow(1 - f, 1.4),
        peak: 0,                        // peak-hold level 0..1
        peakVel: 0
      });
    }

    return function frame(screen, t, frameCount) {
      var cx = Math.floor(cols / 2);

      // Layout: top HUD line, then the bar field, then a baseline.
      var topPad = rows >= 8 ? 2 : 0;
      var botPad = rows >= 8 ? 1 : 0;
      var barTop = topPad;
      var baseY = rows - 1 - botPad;
      var barH = baseY - barTop;
      if (barH < 1) { barTop = 0; baseY = rows - 1; barH = Math.max(1, baseY); }

      // Beat envelope: a sharp attack on each beat, exponential decay.
      var beatPhase = (t * beatHz) % 1;
      var kick = Math.exp(-beatPhase * 6.0);          // 1 -> ~0 over a beat
      var beatIndex = Math.floor(t * beatHz);

      // Fit NBANDS bars across the width with a gap between each.
      var n = Math.min(NBANDS, Math.max(1, Math.floor((cols) / 2)));
      var slot = cols / n;                            // cells per band
      var barW = Math.max(1, Math.floor(slot) - (slot >= 3 ? 1 : 0));

      for (var b = 0; b < n; b++) {
        var bd = bands[b];
        // Synthesized magnitude: two sines + the shared beat kick,
        // weighted so bass bands pump harder on the kick.
        var s = 0.5 + 0.5 * Math.sin(t * bd.rate + bd.phase);
        var s2 = 0.5 + 0.5 * Math.sin(t * bd.rate2 * 1.7 + bd.phase * 0.5);
        var env = 0.35 * s + 0.25 * s2 + (0.15 + 0.55 * bd.bass) * kick;
        env = clamp(env, 0, 1);

        var level = env * barH;                       // height in rows
        var lvlRows = Math.round(level);

        // Peak-hold cap: jump up to the level, otherwise fall under gravity.
        var lvl01 = env;
        if (lvl01 >= bd.peak) {
          bd.peak = lvl01;
          bd.peakVel = 0;
        } else {
          bd.peakVel += 0.012;
          bd.peak = Math.max(lvl01, bd.peak - bd.peakVel);
        }

        var x0 = Math.floor(b * slot);
        var w = Math.min(barW, cols - x0);
        if (w < 1) continue;

        // Draw the bar body from baseline up. Brightness rises toward the top.
        for (var h = 0; h < lvlRows; h++) {
          var y = baseY - h;
          if (y < barTop) break;
          var frac = lvlRows > 1 ? h / (lvlRows - 1) : 1;
          // top of the bar is brightest
          var bright = 0.25 + 0.75 * frac;
          var ch = screen.shade(bright, ramp);
          for (var dx = 0; dx < w; dx++) screen.set(x0 + dx, y, ch);
        }

        // Peak-hold cap as a bright bar of dashes above the body.
        var peakRows = Math.round(bd.peak * barH);
        var py = baseY - peakRows;
        if (peakRows > lvlRows && py >= barTop && py <= baseY) {
          for (var px = 0; px < w; px++) screen.set(x0 + px, py, '-');
        }
      }

      // Baseline floor.
      if (baseY >= 0 && baseY < rows) {
        for (var fx = 0; fx < cols; fx++) screen.set(fx, baseY, '=');
      }

      // ---- HUD / data-science motif -----------------------------------
      if (rows >= 6 && cols >= 12) {
        var pulse = kick > 0.6 ? '@' : kick > 0.3 ? '*' : kick > 0.12 ? 'o' : '.';
        var bpmStr = 'BPM ' + BPM + ' ' + pulse;
        screen.text(0, 0, bpmStr.slice(0, cols));

        // A scrolling beat counter on the right of the top line.
        var beatStr = 'BEAT ' + (beatIndex % 10000);
        var bx = cols - beatStr.length;
        if (bx > bpmStr.length + 1) screen.text(bx, 0, beatStr);

        // A tiny moving level meter / trend readout on line 1.
        if (rows >= 8 && topPad >= 2) {
          // Average current energy across bands -> a ticking RMS metric.
          var sum = 0;
          for (var q = 0; q < n; q++) sum += bands[q].peak;
          var rms = sum / n;
          var meterW = Math.min(cols - 6, 24);
          if (meterW > 2) {
            var filled = Math.round(rms * meterW);
            var meter = '';
            for (var m = 0; m < meterW; m++) meter += (m < filled ? '#' : ':');
            // draw the "LVL[####::::]" meter as single chars
            screen.set(0, 1, 'L');
            screen.set(1, 1, 'V');
            screen.set(2, 1, 'L');
            screen.set(3, 1, '[');
            for (var mm = 0; mm < meterW; mm++) screen.set(4 + mm, 1, meter[mm]);
            screen.set(4 + meterW, 1, ']');
            // Hz label scrolls on the far right of line 1.
            var hz = (200 + ((beatIndex * 37) % 1800)) + 'Hz';
            var hx = cols - hz.length;
            if (hx > 4 + meterW + 2) screen.text(hx, 1, hz);
          }
        }
      }
    };
  }
});
