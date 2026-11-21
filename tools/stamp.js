#!/usr/bin/env node
// A deploy's stamp: one page load is of one commit (issue 116; docs/CHECKS.md "A load is of one commit").
//
//   node tools/stamp.js --commit <sha> --version <v> [--release <r>] [--root web] [--layer <dir>]... [--out <dir>]
//
// Nothing is compiled: web/ is served as it is. So a returning browser's cache (Vercel: an hour and a day of
// stale-while-revalidate for data, assets and vendor; GitHub Pages: ten minutes for everything) answered the new
// scripts with the packs and models it kept. The stamp gives every file's address the hash of its content:
//   - web/index.html's guard (the script at its top) gets the commit and { path: hash } for every file under web/;
//     the page's own fetches, workers, pictures and three.js's loaders ask through it (OEV);
//   - index.html's own src= and href= of the page's files, and url() in it, get ?v=<hash>;
//   - its import map gets an entry for every module (and each module under a prefix it maps, by the bare name too,
//     so that a module is never loaded twice under two addresses);
//   - url() in the stylesheets gets it, before the stylesheets are hashed;
//   - version.json says the commit (the guard reloads a page that is older than the site).
// A file that did not change keeps its address from deploy to deploy, and is not downloaded again.
// --layer: a folder whose files stand in for web/'s (tools/cache_check.js makes "the commit before" with one);
// --out: where to write what the stamp changes (index.html, the stylesheets, version.json) instead of in place.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function stamp({ root = 'web', layers = [], out = null, commit, version = '0', release = null, built = new Date().toISOString().replace(/\.\d+Z$/, 'Z') }) {
  if (!commit) throw new Error('stamp: no commit');
  const roots = [...layers].reverse().concat(root); // (the first that has the file)
  const files = new Map(); // path under web/ -> file on disk
  const walk = (base, dir) => {
    for (const e of fs.readdirSync(path.join(base, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(base, rel);
      else if (e.isFile() && !files.has(rel) && !e.name.startsWith('.')) files.set(rel, path.join(base, rel));
    }
  };
  for (const r of roots) walk(r, '');
  for (const skip of ['version.json']) files.delete(skip);
  const hashOf = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
  const H = {}, changed = new Map(); // (changed: what the stamp rewrote, by path)
  const pages = [...files.keys()].filter(f => f.endsWith('.html')), sheets = [...files.keys()].filter(f => f.endsWith('.css'));
  for (const [rel, file] of files) if (!rel.endsWith('.html') && !rel.endsWith('.css')) H[rel] = hashOf(fs.readFileSync(file));
  // an address in a file at `from`, with its hash where it names one of the page's files
  const ver = (ref, from, known = H) => {
    const m = /^([^?#]+)(\?[^#]*)?(#.*)?$/.exec(ref);
    if (!m || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(ref)) return ref;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(from), decodeURIComponent(m[1])));
    if (!known[rel] || /[?&]v=/.test(m[2] || '')) return ref;
    return `${m[1]}${m[2] ? `${m[2]}&` : '?'}v=${known[rel]}${m[3] || ''}`;
  };
  const urls = (text, from) => text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (all, q, ref) => `url(${q}${ver(ref, from)}${q})`);
  for (const rel of sheets) {
    const was = fs.readFileSync(files.get(rel), 'utf8'), now = urls(was, rel);
    if (now !== was) changed.set(rel, now);
    H[rel] = hashOf(Buffer.from(now));
  }
  const index = 'index.html';
  if (!files.has(index)) throw new Error('stamp: no index.html');
  let html = fs.readFileSync(files.get(index), 'utf8');
  const MARK = "var BUILD = '', FILES = {}; /*@stamp*/";
  if (!html.includes(MARK)) throw new Error(`stamp: index.html has no guard to stamp (${MARK})`);
  // the import map: every module by its address, and by its bare name under each prefix the map gives
  const im = /(<script type="importmap">)([\s\S]*?)(<\/script>)/.exec(html);
  if (!im) throw new Error('stamp: index.html has no import map');
  const map = JSON.parse(im[2]), imports = {};
  const mods = Object.keys(H).filter(f => /\.m?js$/.test(f)).sort();
  for (const [k, v] of Object.entries(map.imports)) {
    if (!k.endsWith('/')) { imports[k] = ver(v, index); continue; }
    imports[k] = v;
    const dir = path.posix.normalize(v).replace(/^\.\//, '');
    for (const f of mods) if (f.startsWith(dir)) imports[k + f.slice(dir.length)] = `./${f}?v=${H[f]}`;
  }
  for (const f of mods) imports[`./${f}`] = `./${f}?v=${H[f]}`;
  html = html.replace(im[0], `${im[1]}${JSON.stringify({ imports })}${im[3]}`);
  // the page's own references: src= and href= of its files, and url() in its styles
  // (not inside the scripts: what they ask for goes through OEV, with the hashes the guard carries)
  html = html.split(/(<script\b[^>]*>[\s\S]*?<\/script>)/).map((part, i) => {
    if (i % 2) return part.replace(/^<script\b[^>]*>/, tag => tag.replace(/\bsrc="([^"]+)"/, (all, ref) => `src="${ver(ref, index)}"`));
    return urls(part.replace(/\b(src|href)="([^"]+)"/g, (all, a, ref) => `${a}="${ver(ref, index)}"`), index);
  }).join('');
  html = html.replace(MARK, `var BUILD = ${JSON.stringify(commit)}, FILES = ${JSON.stringify(H)}; /*@stamp*/`);
  changed.set(index, html);
  for (const rel of pages) if (rel !== index) { /* another page (a tool's line-up) is served as it is */ }
  const v = { version, commit, built };
  if (release) v.release = release;
  changed.set('version.json', JSON.stringify(v));
  const to = out || root;
  for (const [rel, text] of changed) { const f = path.join(to, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
  return { commit, files: H, wrote: [...changed.keys()], modules: mods.length };
}
module.exports = { stamp };

if (require.main === module) {
  const a = process.argv.slice(2), o = { layers: [] };
  for (let i = 0; i < a.length; i += 2) {
    const k = a[i].replace(/^--/, ''), v = a[i + 1];
    if (v == null || !/^--/.test(a[i])) { console.error(`stamp: ${a[i]}?`); process.exit(2); }
    if (k === 'layer') o.layers.push(v); else o[k] = v;
  }
  try {
    const r = stamp(o);
    console.log(`stamped ${r.commit.slice(0, 7)}: ${Object.keys(r.files).length} files, ${r.modules} modules in the import map; wrote ${r.wrote.join(', ')}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
