#!/usr/bin/env node
/*
 * Tests: node scripts/test.js [path/to/real/anthropic.claude-code-x/webview/index.js]
 * Exercises the patcher on a temp copy (never touches the real install).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const patcher = require(path.join(ROOT, 'vscode-extension', 'patcher.js'));
const engineSrc = fs.readFileSync(path.join(ROOT, 'shared', 'pixel-engine.js'), 'utf8');
const P = require(path.join(ROOT, 'shared', 'pixel-engine.js'));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e)); process.exitCode = 1; }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelbg-test-'));
const extRoot = path.join(tmp, 'extensions');
const dir = path.join(extRoot, 'anthropic.claude-code-9.9.9');
fs.mkdirSync(path.join(dir, 'webview'), { recursive: true });
const realArg = process.argv[2];
const original = realArg ? fs.readFileSync(realArg, 'utf8') : '"use strict";\nconsole.log("claude webview");\n';
fs.writeFileSync(patcher.targetFile(dir), original);
fs.mkdirSync(path.join(extRoot, 'someone.other-ext-1.0.0', 'webview'), { recursive: true });

console.log(`Patcher tests (${realArg ? 'real bundle ' + (original.length / 1e6).toFixed(1) + ' MB' : 'fixture'})`);
const cfg = Object.assign({}, P.DEFAULTS, { theme: 'synthwave' });

test('finds only Claude Code dirs', () => {
  assert.deepStrictEqual(patcher.findClaudeDirs([extRoot]), [dir]);
});
test('status: not patched initially', () => {
  assert.strictEqual(patcher.status(dir).patched, false);
});
test('apply patches and writes a backup', () => {
  const r = patcher.apply(dir, cfg, engineSrc);
  assert.strictEqual(r.changed, true);
  const src = fs.readFileSync(r.file, 'utf8');
  assert.ok(src.startsWith(original));
  assert.strictEqual(src.split(patcher.START).length, 2);
  assert.strictEqual(fs.readFileSync(r.file + '.pixelbg.bak', 'utf8'), original);
});
test('status reports config', () => {
  const s = patcher.status(dir);
  assert.strictEqual(s.patched, true);
  assert.strictEqual(s.cfg.theme, 'synthwave');
});
test('apply is idempotent', () => {
  assert.strictEqual(patcher.apply(dir, cfg, engineSrc).changed, false);
});
test('apply with new config replaces the block (no duplicates)', () => {
  const r = patcher.apply(dir, Object.assign({}, cfg, { theme: 'deep-sea' }), engineSrc);
  assert.strictEqual(r.changed, true);
  const src = fs.readFileSync(r.file, 'utf8');
  assert.strictEqual(src.split(patcher.START).length, 2);
  assert.strictEqual(patcher.status(dir).cfg.theme, 'deep-sea');
});
test('patched bundle is valid JavaScript', () => {
  const src = fs.readFileSync(patcher.targetFile(dir), 'utf8');
  const isModule = /^\s*(import|export)\s/m.test(src);
  const f = path.join(tmp, isModule ? 'check.mjs' : 'check.js');
  fs.writeFileSync(f, src);
  const r = require('child_process').spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
});
test('injected payload runs in a fake DOM and mounts', () => {
  const payload = patcher.buildPayload(cfg, engineSrc);
  const appended = [];
  const el = () => ({ style: {}, setAttribute() {}, remove() {}, getContext: () => ctx2d, isConnected: true, parentNode: null });
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ data: new Uint8ClampedArray(4096 * 4096 * 0 + 1e6) })), set: (t, k, v) => { t[k] = v; return true; } });
  const document = {
    readyState: 'complete', hidden: false,
    documentElement: { appendChild: (n) => { appended.push(n); n.parentNode = document.documentElement; } },
    head: { appendChild: (n) => { appended.push(n); n.parentNode = document.head; } },
    createElement: el, getElementById: () => null, addEventListener() {}
  };
  const sandbox = {
    document, innerWidth: 400, innerHeight: 300, console,
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {}, removeEventListener() {}, setInterval: () => 0, setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, performance: { now: () => 0 },
    getComputedStyle: () => ({ getPropertyValue: () => '' })
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(payload, sandbox);
  assert.ok(sandbox.PixelBG, 'PixelBG defined');
  assert.ok(sandbox.__pixelbgMounted, 'mounted');
  assert.strictEqual(appended.length, 2, 'canvas + style appended');
});
test('remove restores the original byte-for-byte', () => {
  assert.strictEqual(patcher.remove(dir).changed, true);
  assert.strictEqual(fs.readFileSync(patcher.targetFile(dir), 'utf8'), original);
  assert.strictEqual(patcher.remove(dir).changed, false);
});
test('every theme renders in all sizes without throwing (node canvas stub)', () => {
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; }
  });
  for (const t of P.themes) for (const [W, H] of [[16, 9], [96, 54], [480, 270], [60, 300]]) {
    const s = t.setup ? t.setup(W, H, Math.random) : {};
    s.rand = Math.random; s.dt = 0.08;
    t.paint(ctx, W, H, s, Math.random);
    for (const time of [0, 1.3, 77.7]) t.frame && t.frame(ctx, W, H, time, s);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
