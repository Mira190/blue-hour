// The loading screen's picture, drawn and not loaded: Shibuya's skyline at the blue hour, in one fragment shader.
//
// The sky is a gradient (night blue overhead, the last warm light along the horizon); the city is six silhouettes one
// behind another, each a line of rooftops, the far ones pale with haze and the near ones dark; their windows are lit
// by a hash of where they are, more of them as the load goes on; a few screens change, and the tall roofs carry their
// red lamps. The rooftop lines are the map's own (data/<map>/skyline.json, a few kilobytes that pipeline/skyline.py
// bakes from the buildings: each band of distance from an eye in the air south-west of the Scramble). So what is on
// screen in the first second is the place itself, from numbers, before any of the map has arrived.
//
// It is cheap on purpose: six lookups and a few hashes a pixel, at most 1.5 device pixels to a CSS pixel, thirty
// frames a second, nothing drawn while the tab is hidden, and its context is given back when the loader goes.
//   OESkyline.start(figure, map, progress)   figure: the loader's picture, which gets a canvas; progress(): 0..1
'use strict';
window.OESkyline = (function () {
  const FRAG = `precision mediump float;
uniform vec2 uRes; uniform float uT, uP, uIn, uBins; uniform vec4 uY; uniform sampler2D uTex;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes; float asp = uRes.x / uRes.y;
  float V = 1.06, H = 0.5;                                  // the picture's height as a tangent; where the horizon lies
  float ty = (uv.y - H) * V, tx = (uv.x - 0.5) * V * asp;
  // the sky: night blue overhead, a band of the day's last light on the horizon, a few stars high up
  vec3 col = mix(vec3(0.20, 0.30, 0.52), vec3(0.015, 0.03, 0.10), smoothstep(-0.02, 0.5, ty));
  col += vec3(0.95, 0.48, 0.20) * 0.42 * exp(-max(ty, 0.0) * 13.0) + vec3(0.60, 0.30, 0.42) * 0.16 * exp(-max(ty, 0.0) * 4.5);
  vec2 sc = floor(gl_FragCoord.xy / 2.0); float st = hash(sc);
  col += vec3(0.8, 0.86, 1.0) * step(0.9985, st) * smoothstep(0.12, 0.4, ty) * (0.5 + 0.5 * sin(uT * (0.6 + st * 3.0) + st * 40.0));
  float lit = 0.22 + 0.78 * uP;                              // how much of the city has its lights on: the load so far
  for (int k = 5; k >= 0; k--) {                             // the far band first, the near ones over it
    float i = float(k), far = i / 5.0;
    float x = tx + sin(uT * 0.07) * 0.012 * (6.0 - i);       // the view drifts, and the near bands move more
    float u = x / (2.0 * uY.z) + 0.5;
    if (u <= 0.0 || u >= 1.0) continue;
    float v = texture2D(uTex, vec2(u, (i + 0.5) / 6.0)).r;
    if (v <= 0.0) continue;
    float top = uY.x + v * (uY.y - uY.x);
    if (ty >= top) continue;
    float bin = floor(u * uBins), below = top - ty;
    vec3 c = mix(vec3(0.012, 0.018, 0.045), vec3(0.13, 0.19, 0.33), far * far * 0.9 + far * 0.25);
    c += vec3(0.9, 0.5, 0.25) * 0.05 * (1.0 - far) * exp(-below * 30.0);   // the roofs catch a little of the horizon
    // windows: a grid on each band, finer far off; one in so many lit, warm or cool
    float nx = mix(2.0, 1.0, far), ny = mix(150.0, 420.0, far);
    vec2 cell = vec2(floor(u * uBins * nx), floor(below * ny)), f = vec2(fract(u * uBins * nx), fract(below * ny));
    float hsh = hash(cell + i * 17.0), on = step(hsh, lit * mix(0.30, 0.15, far)) * step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.8) * step(0.004, below);
    vec3 w = mix(vec3(1.0, 0.78, 0.46), vec3(0.72, 0.86, 1.0), step(0.72, hash(cell.yx + 3.1)));
    c += w * on * mix(0.85, 0.32, far) * (0.75 + 0.25 * sin(uT * 0.4 + hsh * 60.0));
    // a few screens on the near bands: blocks of light that change
    if (k < 3) { vec2 sb = vec2(floor(bin / 5.0), floor(below * 26.0)); float sh = hash(sb + 9.7 + i);
      if (sh > 0.955 && below > 0.03 && below < 0.3) { float ph = floor(uT * 0.45 + sh * 20.0); c = mix(c, 0.5 + 0.5 * cos(6.2831 * (hash(sb + ph) + vec3(0.0, 0.33, 0.67))), 0.8 * lit) * (0.8 + 0.2 * sin(uT * 3.0 + sh * 9.0)); } }
    // the red lamp on a tall roof
    if (k < 4 && v > 0.86 && below < 0.006 && hash(vec2(bin, i)) > 0.6) c += vec3(1.0, 0.12, 0.08) * (0.5 + 0.5 * sin(uT * 2.2 + bin));
    col = mix(col, c, uIn);
  }
  col *= 1.0 - 0.35 * smoothstep(0.45, 0.0, uv.y);          // the foot of the picture falls away under the loader's words
  col += (hash(gl_FragCoord.xy + uT) - 0.5) * 0.018;         // a little grain, so the gradient does not band
  gl_FragColor = vec4(col, 1.0);
}`;
  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  function start(figure, map, progress) {
    const cv = document.createElement('canvas');
    cv.className = 'roll-sky';
    const gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl || !figure) return null; // (no picture of its own: the loader keeps the stills behind it)
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn('skyline:', gl.getProgramInfoLog(pr)); return null; }
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.bindAttribLocation(pr, 0, 'p'); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n), uRes = U('uRes'), uT = U('uT'), uP = U('uP'), uIn = U('uIn'), uBins = U('uBins'), uY = U('uY');
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    gl.uniform1f(uBins, 1); gl.uniform4f(uY, -1, 0.1, 1.2, 0);
    figure.insertBefore(cv, figure.querySelector('.roll-grade') || null);
    let got = 0, raf = 0, dead = false, n = 0;
    const t0 = performance.now();
    // the map's rooftops: the sky is up before they come, and they rise into it
    fetch(`data/${map}/skyline.json`).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d || dead) return;
      const rows = d.layers.map(l => Uint8Array.from(atob(l), c => c.charCodeAt(0))), px = new Uint8Array(d.bins * rows.length);
      rows.forEach((r, i) => px.set(r, i * d.bins));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, d.bins, rows.length, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, px);
      gl.uniform1f(uBins, d.bins); gl.uniform4f(uY, d.y0, d.y1, d.half, 0);
      got = performance.now();
    }).catch(() => {});
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function draw(now) {
      if (dead) return;
      raf = requestAnimationFrame(draw);
      if (document.hidden || (n++ & 1)) return; // (thirty frames a second, and none for a tab nobody is looking at)
      const dpr = Math.min(1.5, window.devicePixelRatio || 1), w = Math.max(2, Math.round(cv.clientWidth * dpr)), h = Math.max(2, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(uRes, w, h); gl.uniform1f(uT, still ? 0 : (now - t0) / 1000);
      gl.uniform1f(uP, Math.max(0, Math.min(1, progress ? progress() : 0)));
      gl.uniform1f(uIn, got ? Math.min(1, (now - got) / 1400) : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      cv.classList.add('on');
    }
    raf = requestAnimationFrame(draw);
    const stop = () => { if (dead) return; dead = true; cancelAnimationFrame(raf); const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); cv.remove(); };
    return { stop, canvas: cv };
  }
  return { start };
})();
