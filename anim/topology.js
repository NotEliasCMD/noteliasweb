/*
 * topology — a network topology graph of server/host nodes wired together
 * by links, with bright packets hopping along every link. A live throughput
 * readout (Mbps) and an in-flight packet counter tick along the bottom.
 */
ASCII.register({
  id: 'topology',
  title: 'Network Topology',
  description: 'A network graph of linked hosts with packets hopping the links and a live throughput / packets-in-flight readout.',
  cols: 60, rows: 26, fps: 16,
  create: function (cols, rows) {
    var util = ASCII.util;

    // Fractional node layout (0..1) so it scales to any grid. Each node is a
    // host/server; the labels read like machine names.
    var nodes = [
      { fx: 0.12, fy: 0.28, label: 'GW' },
      { fx: 0.50, fy: 0.16, label: 'S1' },
      { fx: 0.86, fy: 0.30, label: 'S2' },
      { fx: 0.18, fy: 0.74, label: 'DB' },
      { fx: 0.54, fy: 0.82, label: 'S3' },
      { fx: 0.85, fy: 0.72, label: 'S4' }
    ];

    // Links between nodes (indices). This forms a connected mesh.
    var edges = [
      [0, 1], [1, 2], [0, 3], [3, 4],
      [4, 5], [2, 5], [1, 4], [1, 3], [2, 4]
    ];

    // Per-edge packet setup, deterministic from the edge index.
    var packets = [];
    var e, k;
    for (e = 0; e < edges.length; e++) {
      var nPk = 1 + (util.hash(e + 1, 7) * 3 | 0);   // 1..3 packets per link
      var speed = 0.12 + util.hash(e + 3, 11) * 0.30; // cycles/sec
      var dir = util.hash(e + 5, 2) < 0.5 ? 1 : -1;
      for (k = 0; k < nPk; k++) {
        packets.push({
          edge: e,
          offset: (k + util.hash(e * 7 + k, 13)) / nPk,
          speed: speed,
          dir: dir,
          gPhase: util.hash(e * 3 + k, 17) * util.TAU,
          gRate: 0.6 + util.hash(e + k, 19) * 1.4
        });
      }
    }

    var big;            // draw boxed nodes when there is room
    var margin = 2;

    function nodePos(n, c, r) {
      var x = margin + n.fx * (c - 1 - margin * 2);
      var y = 1 + n.fy * (r - 3);            // leave row for header + readout
      return { x: Math.round(x), y: Math.round(y) };
    }

    function drawNode(screen, px, py, label) {
      if (big) {
        var l = px - 2, rt = px + 2, tp = py - 1, bt = py + 1, x;
        for (x = l; x <= rt; x++) {
          screen.set(x, tp, '-');
          screen.set(x, bt, '-');
        }
        screen.set(l, tp, '+'); screen.set(rt, tp, '+');
        screen.set(l, bt, '+'); screen.set(rt, bt, '+');
        screen.set(l, py, '|'); screen.set(rt, py, '|');
        screen.set(l + 1, py, ' '); screen.set(rt - 1, py, ' ');
        var s = px - (label.length >> 1);
        for (x = 0; x < label.length; x++) screen.set(s + x, py, label[x]);
      } else {
        screen.set(px, py, '#');
      }
    }

    return function frame(screen, t, frameCount) {
      big = (cols >= 30 && rows >= 14);
      var showHeader = rows >= 8;

      // Resolve node pixel positions this frame (cheap, keeps it size-safe).
      var pos = [];
      var i;
      for (i = 0; i < nodes.length; i++) pos.push(nodePos(nodes[i], cols, rows));

      // 1) Links as faint dotted lines.
      for (e = 0; e < edges.length; e++) {
        var a = pos[edges[e][0]], b = pos[edges[e][1]];
        screen.line(a.x, a.y, b.x, b.y, '.');
      }

      // 2) Packets hopping along the links (bright, with a short trail).
      var inFlight = 0;
      var thrAcc = 0;
      for (i = 0; i < packets.length; i++) {
        var p = packets[i];
        // Live gate so the in-flight count breathes over time.
        var gate = Math.sin(t * p.gRate + p.gPhase);
        if (gate < -0.35) continue;
        inFlight++;

        var ed = edges[p.edge];
        var na = pos[ed[0]], nb = pos[ed[1]];
        var f = (t * p.speed + p.offset) % 1;
        if (p.dir < 0) f = 1 - f;

        // Keep packets off the node bodies a touch.
        var fc = 0.10 + f * 0.80;
        var hx = Math.round(util.lerp(na.x, nb.x, fc));
        var hy = Math.round(util.lerp(na.y, nb.y, fc));

        // trail one step behind
        var ft = fc - p.dir * 0.06;
        var tx = Math.round(util.lerp(na.x, nb.x, ft));
        var ty = Math.round(util.lerp(na.y, nb.y, ft));
        if ((tx !== hx || ty !== hy) && screen.get(tx, ty) === '.') screen.set(tx, ty, ':');
        screen.set(hx, hy, '@');

        thrAcc += p.speed * (0.6 + 0.4 * gate);
      }

      // 3) Nodes on top so boxes stay clean.
      for (i = 0; i < nodes.length; i++) drawNode(screen, pos[i].x, pos[i].y, nodes[i].label);

      // 4) Header + live data readouts.
      if (showHeader) {
        var title = 'NET TOPOLOGY';
        screen.text(0, 0, title.slice(0, cols));
        // pulsing link-activity dot after the title
        var pulse = (frameCount % 8) < 4 ? '*' : '+';
        if (title.length + 1 < cols) screen.set(title.length + 1, 0, pulse);
      }

      // Throughput in Mbps: driven by packet activity + smooth noise wobble.
      var wobble = util.noise2(t * 0.7, 3.5);
      var mbps = Math.round(120 + thrAcc * 210 + wobble * 180);
      var line = 'THRPT ' + mbps + ' Mbps  PKTS ' + inFlight;
      var ry = rows - 1;
      // clear the readout row region then write (row is already blank, but be safe)
      screen.text(0, ry, line.slice(0, cols));
    };
  }
});
