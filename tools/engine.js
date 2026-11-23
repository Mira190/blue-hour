// The browser a harness opens: Chromium on the software renderer as the checks run it (under xvfb-run with llvmpipe,
// SwiftShader without a display), on a Mac's own GPU (GPU=metal), or Playwright's WebKit (ENGINE=webkit, HEADED=1 for
// its window). WebKit takes none of Chromium's switches and has no DevTools session: `cdp` is null there.
//   const { launch, ENGINE } = require('./engine'); const b = await launch(['--a-chromium-switch']);
const pw = require('playwright');
const ENGINE = process.env.ENGINE || 'chromium';
function launch(extra = []) {
  if (ENGINE !== 'chromium') return pw[ENGINE].launch({ headless: !process.env.HEADED });
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  return pw.chromium.launch({ headless: !process.env.DISPLAY, args: args.concat(extra) });
}
const cdp = p => (ENGINE === 'chromium' ? p.context().newCDPSession(p) : null);
// A page opened with hasTouch as a phone: Playwright's WebKit on a Mac sends its touches but says it has no touch
// screen (navigator.maxTouchPoints 0), and the page then takes the sound a mouse's device gets (audio.js TOUCH: the
// tape's worklet, the whole reverb). Call it before the page loads.
const phone = p => (ENGINE === 'chromium' ? Promise.resolve() : p.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5, configurable: true })));
module.exports = { launch, cdp, phone, ENGINE };
