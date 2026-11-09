/*
 * Claude Pixel BG — patcher.js
 * Injects / removes the pixel background into the Claude Code VS Code extension's webview bundle.
 * Pure Node (no vscode API) so it can be used by extension.js, cli.js and uninstall.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const START = '/*<PIXELBG-START>*/';
const END = '/*<PIXELBG-END>*/';
const BLOCK_RE = /\n?\/\*<PIXELBG-START>\*\/[\s\S]*?\/\*<PIXELBG-END>\*\/\n?/g;
const CFG_KEYS = ['enabled', 'theme', 'mode', 'intensity', 'pixelSize', 'animate', 'fps', 'hotkey'];

/** Common extension folders: VS Code, Insiders, Cursor, Windsurf, VSCodium. */
function defaultRoots(extra) {
  const h = os.homedir();
  const roots = [
    path.join(h, '.vscode', 'extensions'),
    path.join(h, '.vscode-insiders', 'extensions'),
    path.join(h, '.cursor', 'extensions'),
    path.join(h, '.windsurf', 'extensions'),
    path.join(h, '.vscode-oss', 'extensions')
  ];
  return [...new Set([...(extra || []), ...roots].filter(Boolean).map((p) => path.resolve(p)))];
}

/** Find every installed Claude Code extension dir that has a webview bundle. */
function findClaudeDirs(roots) {
  const out = [];
  for (const r of roots) {
    let names = [];
    try { names = fs.readdirSync(r); } catch { continue; }
    for (const n of names) {
      if (!/^anthropic\.claude-code-/i.test(n)) continue;
      const dir = path.join(r, n);
      if (fs.existsSync(targetFile(dir))) out.push(dir);
    }
  }
  return [...new Set(out)];
}

function targetFile(dir) { return path.join(dir, 'webview', 'index.js'); }

function pickCfg(cfg) {
  const o = {};
  for (const k of CFG_KEYS) if (cfg[k] !== undefined) o[k] = cfg[k];
  return o;
}

function buildPayload(cfg, engineSrc) {
  const c = pickCfg(cfg);
  const json = JSON.stringify(c);
  const stamp = crypto.createHash('sha1').update(json + engineSrc).digest('hex').slice(0, 12);
  if (engineSrc.includes(START) || engineSrc.includes(END)) throw new Error('engine source contains patch markers');
  return `\n${START}\n;(function(){try{\n${engineSrc}\n` +
    `var P=globalThis.PixelBG;var cfg=${json};cfg.stamp=${JSON.stringify(stamp)};var KEY='pixelbg-override';\n` +
    `function start(){if(window.__pixelbgMounted)return;window.__pixelbgMounted=true;var ov=null;try{ov=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}\n` +
    `if(ov&&ov.stamp===cfg.stamp&&ov.theme)cfg.theme=ov.theme;\n` +
    `P.mount(Object.assign({},cfg,{css:P.adapters.vscode,onThemeChange:function(id){try{localStorage.setItem(KEY,JSON.stringify({stamp:cfg.stamp,theme:id}))}catch(e){}}}));}\n` +
    `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();\n` +
    `}catch(e){console.warn('[PixelBG]',e)}})();\n${END}\n`;
}

function strip(src) { return src.replace(BLOCK_RE, ''); }

function writeAtomic(file, data) {
  const tmp = file + '.pixelbg.tmp';
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}

/** Apply (or re-apply) the patch. Returns { changed, file }. */
function apply(dir, cfg, engineSrc) {
  const file = targetFile(dir);
  const src = fs.readFileSync(file, 'utf8');
  const base = strip(src);
  const bak = file + '.pixelbg.bak';
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, base, 'utf8');
  const next = base + buildPayload(cfg, engineSrc);
  if (next === src) return { changed: false, file };
  writeAtomic(file, next);
  return { changed: true, file };
}

/** Remove the patch, leaving the original bundle. Returns { changed, file }. */
function remove(dir) {
  const file = targetFile(dir);
  const src = fs.readFileSync(file, 'utf8');
  const base = strip(src);
  if (base === src) return { changed: false, file };
  writeAtomic(file, base);
  return { changed: true, file };
}

function status(dir) {
  const file = targetFile(dir);
  const src = fs.readFileSync(file, 'utf8');
  const i = src.indexOf(START);
  if (i < 0) return { patched: false, file };
  const m = /var cfg=(\{[^\n]*?\});cfg\.stamp/.exec(src.slice(i));
  let cfg = null;
  try { cfg = m ? JSON.parse(m[1]) : null; } catch { cfg = null; }
  return { patched: true, file, cfg };
}

module.exports = { START, END, defaultRoots, findClaudeDirs, targetFile, buildPayload, strip, apply, remove, status };
