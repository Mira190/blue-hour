// The device-side ASTC encoder (web/astc.js, issue 443) against a real decoder: each picture is encoded in the
// page, handed to WebGL as COMPRESSED_RGBA_ASTC_4x4 (SwiftShader decodes ASTC; Mesa's llvmpipe does not offer it),
// drawn texel for texel into a framebuffer and read back, and compared with the picture it was made from. A block
// laid out wrongly decodes to magenta or to noise, far below the floor; the figures are the quality a phone gets.
//   python3 -m http.server 8800 --directory web &
//   node tools/astc_check.js [pictures under web/...]      # exits 1 under the floor (MIN_DB, default 30), on a GL error,
//                                                          # where the encoder's own count of its error is off, or where
//                                                          # a cut-out's mipmaps or edge stray from its colour
//                                                          # (MAX_DRIFT, MAX_RIM: the guide's guard hairs, a hair card)
const { chromium } = require('playwright');
const pics = process.argv.slice(2).length ? process.argv.slice(2) : ['data/shibuya/ground_2_1.jpg', 'data/shibuya/atlas.webp', 'data/shibuya/scramble.webp', 'data/shibuya/far.jpg', 'assets/trees/trees_far.glb#0', 'assets/people/R_Female_Adult_14.glb#1', 'assets/people/H_Kagami_M.glb#3', 'assets/animals/akita.glb#2', 'assets/people/R_Business_Female_01.glb#4'];
const MIN = +(process.env.MIN_DB || 30);
const MAX_DRIFT = +(process.env.MAX_DRIFT || 8), MAX_RIM = +(process.env.MAX_RIM || 30); // (8-bit sRGB steps: a cut-out's mipmaps and its edge)
(async () => {
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/data/cities.json`);
  await p.setContent('<!doctype html><canvas id=c></canvas>');
  await p.addScriptTag({ url: `http://localhost:${process.env.PORT || 8800}/astc.js` });
  let bad = 0;
  for (const pic of pics) {
    const r = await p.evaluate(async ([url, force]) => {
      // (a picture inside a model: assets/trees/trees_far.glb#0 is the first image of that GLB)
      let blob;
      if (/\.glb#\d+$/.test(url)) {
        const [u, k] = url.split('#'), buf = await (await fetch(u)).arrayBuffer(), dv = new DataView(buf), jl = dv.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))), im = json.images[+k], bv = json.bufferViews[im.bufferView];
        blob = new Blob([new Uint8Array(buf, 20 + jl + 8 + (bv.byteOffset || 0), bv.byteLength)], { type: im.mimeType });
      } else blob = await (await fetch(url)).blob();
      const img = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const w = Math.min(1024, img.width), h = Math.min(1024, img.height), cv = new OffscreenCanvas(w, h), g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, w, h);
      const src = g.getImageData(0, 0, w, h).data;
      const gl = document.getElementById('c').getContext('webgl2'), ext = gl.getExtension('WEBGL_compressed_texture_astc');
      if (!ext) return { error: 'no ASTC here' };
      const out = {};
      for (const mode of ['opaque', 'alpha']) {
        const px = src.slice();
        if (mode === 'opaque') for (let i = 3; i < px.length; i += 4) px[i] = 255;
        else if (OEAstc.opaque(px)) for (let i = 0; i < px.length; i += 4) px[i + 3] = Math.max(0, Math.min(255, ((px[i] + px[i + 1] + px[i + 2]) / 3 - 96) * 9)); // (a cut-out made of an opaque picture: its darks cut away, a soft edge between)
        if (mode === 'alpha' && OEAstc.bleed) OEAstc.bleed(px, w, h); // (as astc-worker.js does before it encodes: what is cut away given its neighbours' colour)
        OEAstc.stats.reset();
        OEAstc.encode(px, w, h, mode === 'alpha');
        const own = +OEAstc.stats.db().toFixed(1); // (the encoder's own account of the top level, which astc-worker.js goes by)
        const t0 = performance.now(), levels = OEAstc.mips(px, w, h, mode === 'alpha', true), ms = performance.now() - t0;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        levels.forEach((l, i) => gl.compressedTexImage2D(gl.TEXTURE_2D, i, ext.COMPRESSED_RGBA_ASTC_4x4_KHR, l.width, l.height, 0, l.data));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const fb = gl.createFramebuffer(), rt = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, rt); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt, 0);
        const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); return o; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){ vec2 p = vec2(float(gl_VertexID & 1) * 4.0 - 1.0, float(gl_VertexID >> 1) * 4.0 - 1.0); gl_Position = vec4(p, 0.0, 1.0); }'));
        gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; uniform sampler2D t; uniform int lod; out vec4 o; void main(){ o = texelFetch(t, ivec2(gl_FragCoord.xy), lod); }'));
        gl.linkProgram(pr); gl.useProgram(pr);
        gl.viewport(0, 0, w, h); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const back = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, back);
        // (colour by how much of it shows: what is cut away has none)
        let se = 0, sa = 0, magenta = 0, shown = 0;
        for (let i = 0; i < px.length; i += 4) {
          const f = px[i + 3] / 255;
          for (let k = 0; k < 3; k++) { const d = px[i + k] - back[i + k]; se += d * d * f; }
          shown += f;
          const da = px[i + 3] - back[i + 3]; sa += da * da;
        }
        // (a block a decoder rejects comes back magenta, all sixteen texels of it)
        for (let by = 0; by + 4 <= h; by += 4) for (let bx = 0; bx + 4 <= w; bx += 4) {
          let all = true, was = true;
          for (let y = 0; y < 4 && all; y++) for (let x = 0; x < 4; x++) { const i = 4 * ((by + y) * w + bx + x); if (!(back[i] === 255 && back[i + 1] === 0 && back[i + 2] === 255 && back[i + 3] === 255)) { all = false; break; } if (!(px[i] > 240 && px[i + 1] < 16 && px[i + 2] > 240)) was = false; }
          if (all && !was) magenta++;
        }
        // A cut-out's colour where it shows, level by level (the mipmaps a phone samples as it moves away), against the
        // top level's: each level's mean colour by how much of it shows, in linear light, as 8-bit sRGB. A level averaged
        // with what is cut away (black, from the canvas) darkens a step at a time: the guide's guard hairs went from 244
        // to 210 three levels down (November 2026). And the rim: each cut-away texel beside one that shows, decoded,
        // against that one's colour, which a filter mixes with it at the edge (a block where nothing showed came back
        // black). Both in 8-bit sRGB steps, the worst channel.
        let drift = 0, rim = 0;
        if (mode === 'alpha') {
          const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          const srgb = c => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
          const mean = (d, alphaOf) => { const s = [0, 0, 0]; let ws = 0; for (let i = 0; i < d.length; i += 4) { const a = alphaOf[i + 3] / 255; for (let k = 0; k < 3; k++) s[k] += lin(d[i + k]) * a; ws += a; } return s.map(v => srgb(v / Math.max(1e-9, ws))); };
          const top = mean(px, px);
          for (let l = 1; l < levels.length && Math.min(levels[l].width, levels[l].height) >= 4; l++) {
            const lw = levels[l].width, lh = levels[l].height;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels.length - 1);
            gl.viewport(0, 0, lw, lh); gl.uniform1i(gl.getUniformLocation(pr, 'lod'), l);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            const lv = new Uint8Array(lw * lh * 4);
            gl.readPixels(0, 0, lw, lh, gl.RGBA, gl.UNSIGNED_BYTE, lv);
            const m = mean(lv, lv);
            for (let k = 0; k < 3; k++) drift = Math.max(drift, Math.abs(m[k] - top[k]));
          }
          let rs = [0, 0, 0], rn = 0;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = 4 * (y * w + x);
            if (px[i + 3] >= 8) continue;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const X = x + dx, Y = y + dy;
              if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
              const j = 4 * (Y * w + X);
              if (px[j + 3] < 128) continue;
              for (let k = 0; k < 3; k++) rs[k] += Math.abs(back[i + k] - px[j + k]);
              rn++;
              break;
            }
          }
          rim = rn ? Math.max(...rs) / rn : 0;
        }
        const n = w * h;
        out[mode] = { own, drift: +drift.toFixed(1), rim: +rim.toFixed(1), db: +(10 * Math.log10(255 * 255 / Math.max(1e-9, se / (3 * Math.max(1, shown))))).toFixed(1), alphaDb: mode === 'alpha' ? +(10 * Math.log10(255 * 255 / Math.max(1e-9, sa / n))).toFixed(1) : undefined, magenta, ms: Math.round(ms), mpxs: +(n * 1.333 / 1e6 / (ms / 1000)).toFixed(1), bytes: levels.reduce((s, l) => s + l.data.length, 0), raw: Math.round(n * 4 * 1.333), err: gl.getError() };
        gl.deleteTexture(tex); gl.deleteTexture(rt); gl.deleteFramebuffer(fb);
      }
      return { w, h, out };
    }, [`http://localhost:${process.env.PORT || 8800}/${pic}`]).catch(e => ({ error: String(e).slice(0, 300) }));
    if (r.error) { console.log(`FAIL ${pic}: ${r.error}`); bad++; continue; }
    for (const [mode, o] of Object.entries(r.out)) {
      const ok = o.db >= MIN && !o.err && !o.magenta && Math.abs(o.own - o.db) < 1 && (o.alphaDb === undefined || o.alphaDb >= 20) && o.drift <= MAX_DRIFT && o.rim <= MAX_RIM;
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${pic} ${r.w}x${r.h} ${mode}: ${o.db} dB (the encoder's own count ${o.own})${o.alphaDb !== undefined ? `, alpha ${o.alphaDb} dB, the mipmaps' colour ${o.drift} from the top's, the rim ${o.rim} from the edge's` : ''}, ${(o.bytes / 1048576).toFixed(2)} MB for ${(o.raw / 1048576).toFixed(2)} of RGBA8 with mipmaps, encoded in ${o.ms} ms (${o.mpxs} million texels a second)${o.err ? `, GL error ${o.err}` : ''}${o.magenta ? `, ${o.magenta} blocks rejected (magenta)` : ''}`);
    }
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
