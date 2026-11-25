// A sampled profile's self time in one function, by line (V8's position ticks): where inside a step its own time goes.
//   node tools/prof_lines.js <file.cpuprofile> <function> [calls] [top]
// The profile is one OUT= of tools/crowd_cost.js; calls (that run's count) gives ms a call.
const fs = require('fs');
const [,, file, name, calls = '1', top = '25'] = process.argv;
const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
const dt = new Map(); prof.samples.forEach((id, i) => dt.set(id, (dt.get(id) || 0) + prof.timeDeltas[i] / 1000));
const byLine = new Map(); let hits = 0, all = 0;
for (const n of prof.nodes) {
  if (n.callFrame.functionName !== name || !n.positionTicks) continue;
  const ms = dt.get(n.id) || 0, t = n.positionTicks.reduce((a, p) => a + p.ticks, 0) || 1; all += ms;
  for (const p of n.positionTicks) { byLine.set(p.line, (byLine.get(p.line) || 0) + ms * p.ticks / t); hits += p.ticks; }
}
console.log(`${name}: ${(all / +calls).toFixed(3)} ms a call of its own, ${hits} ticks`);
[...byLine].sort((a, b) => b[1] - a[1]).slice(0, +top).forEach(([l, ms]) => console.log(`${(ms / +calls).toFixed(3).padStart(8)}  line ${l}`));
