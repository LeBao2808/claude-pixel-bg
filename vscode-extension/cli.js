#!/usr/bin/env node
/*
 * Claude Pixel BG — CLI (patch Claude Code without installing the VS Code extension)
 *
 *   node cli.js list                         list themes
 *   node cli.js status                       show patch status of each Claude Code install
 *   node cli.js apply --theme synthwave      inject / update the background
 *        [--mode behind|overlay] [--intensity 0.6] [--pixel 4] [--fps 12] [--no-anim]
 *   node cli.js remove                       restore the original Claude Code webview
 *   [--dir <extensions folder>]              extra folder to search (or --claude-dir <one Claude Code dir>)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const patcher = require('./patcher');

const ENGINE = fs.existsSync(path.join(__dirname, 'media', 'pixel-engine.js'))
  ? path.join(__dirname, 'media', 'pixel-engine.js')
  : path.join(__dirname, '..', 'shared', 'pixel-engine.js');
const P = require(ENGINE);

const args = process.argv.slice(2);
const cmd = args[0] || 'help';
function opt(name, def) { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; }
function has(name) { return args.includes('--' + name); }

function dirs() {
  if (opt('claude-dir')) return [path.resolve(opt('claude-dir'))];
  const extra = opt('dir') ? [opt('dir')] : [];
  return patcher.findClaudeDirs(patcher.defaultRoots(extra));
}

function main() {
  if (cmd === 'list') {
    P.themes.forEach((t) => console.log(`${t.id.padEnd(16)} ${t.name.padEnd(16)} ${t.desc}`));
    return;
  }
  if (cmd === 'help' || !['status', 'apply', 'remove'].includes(cmd)) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 12).map((l) => l.replace(/^ \*\s?/, '')).join('\n'));
    return;
  }
  const ds = dirs();
  if (!ds.length) { console.error('Không tìm thấy extension Claude Code (anthropic.claude-code-*).'); process.exitCode = 1; return; }
  for (const d of ds) {
    if (cmd === 'status') {
      const s = patcher.status(d);
      console.log(`${path.basename(d)}: ${s.patched ? 'ĐÃ PATCH ' + JSON.stringify(s.cfg) : 'chưa patch'}`);
    } else if (cmd === 'apply') {
      const theme = opt('theme', P.DEFAULTS.theme);
      if (!P.themes.some((t) => t.id === theme)) { console.error(`Theme không tồn tại: ${theme}. Xem: node cli.js list`); process.exitCode = 1; return; }
      const cfg = Object.assign({}, P.DEFAULTS, {
        theme,
        mode: opt('mode', P.DEFAULTS.mode),
        intensity: +opt('intensity', P.DEFAULTS.intensity),
        pixelSize: +opt('pixel', P.DEFAULTS.pixelSize),
        fps: +opt('fps', P.DEFAULTS.fps),
        animate: !has('no-anim')
      });
      const r = patcher.apply(d, cfg, fs.readFileSync(ENGINE, 'utf8'));
      console.log(`${path.basename(d)}: ${r.changed ? 'đã áp dụng ' + theme : 'không đổi'} → reload VS Code (Developer: Reload Window)`);
    } else if (cmd === 'remove') {
      const r = patcher.remove(d);
      console.log(`${path.basename(d)}: ${r.changed ? 'đã gỡ' : 'không có gì để gỡ'}`);
    }
  }
}
main();
