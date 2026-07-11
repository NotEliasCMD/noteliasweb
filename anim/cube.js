/*
 * cube — a rotating wireframe cube drawn with line characters, plus
 * depth-shaded vertices. Rotates on all three axes.
 */
ASCII.register({
  id: 'cube',
  title: 'Wireframe Cube',
  description: 'A rotating cube: 12 edges drawn with Bresenham lines, corners brightened by depth.',
  cols: 70, rows: 30, fps: 30,
  create: function (cols, rows) {
    var V = [
      [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
      [-1,-1, 1],[1,-1, 1],[1,1, 1],[-1,1, 1]
    ];
    var E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    var ax = 0, ay = 0, az = 0;
    var K1 = Math.min(cols, rows * 2) * 0.9;

    function rot(p, ax, ay, az) {
      var x = p[0], y = p[1], z = p[2], c, s, t;
      c = Math.cos(ax); s = Math.sin(ax); t = y * c - z * s; z = y * s + z * c; y = t;
      c = Math.cos(ay); s = Math.sin(ay); t = x * c + z * s; z = -x * s + z * c; x = t;
      c = Math.cos(az); s = Math.sin(az); t = x * c - y * s; y = x * s + y * c; x = t;
      return [x, y, z];
    }

    return function frame(screen) {
      ax += 0.017; ay += 0.023; az += 0.011;
      var pts = [];
      for (var i = 0; i < V.length; i++) {
        var p = rot(V[i], ax, ay, az);
        var z = p[2] + 4;
        var ooz = 1 / z;
        pts.push([
          (cols / 2 + K1 * ooz * p[0]) | 0,
          (rows / 2 - K1 * ooz * p[1] * 0.5) | 0,
          ooz
        ]);
      }
      for (var e = 0; e < E.length; e++) {
        var a = pts[E[e][0]], b = pts[E[e][1]];
        screen.line(a[0], a[1], b[0], b[1], '#');
      }
      for (i = 0; i < pts.length; i++) screen.set(pts[i][0], pts[i][1], '@');
    };
  }
});
