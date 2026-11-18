// Which WebGL renderer the browser checks get, launched as tools/story_play.js launches Chromium: Mesa's llvmpipe
// under Xvfb (`--use-gl=angle --use-angle=gl`), or SwiftShader without a display. When the GL backend cannot start
// (no GLX on the display, a missing Mesa driver) Chromium falls back to SwiftShader without a word, and every check
// in a browser runs about three times slower (AGENTS.md, "Software WebGL"). Prints the renderer and exits 1 when
// a display was given and the renderer is not llvmpipe.
//   xvfb-run -a node tools/gl_renderer.js
const { chromium } = require('playwright');
(async () => {
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage();
  const r = await p.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { renderer: 'no WebGL2' };
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : '', units: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) };
  });
  await b.close();
  const soft = /llvmpipe/i.test(r.renderer);
  console.log(`${process.env.DISPLAY ? `display ${process.env.DISPLAY}` : 'no display'}: ${r.renderer}${r.vendor ? ` (${r.vendor})` : ''}${r.units ? `, ${r.units} texture units` : ''}`);
  if (process.env.DISPLAY && !soft) { console.log('FAIL not llvmpipe: the browser checks will run on SwiftShader, about three times slower'); process.exit(1); }
})();
