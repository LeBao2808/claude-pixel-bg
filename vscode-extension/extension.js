/*
 * Claude Pixel BG — VS Code extension
 * Adds animated pixel-art backgrounds to the Claude Code panel.
 */
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const patcher = require('./patcher');

const SECTION = 'claudePixelBg';
let reloadPending = false;
let statusItem = null;

function engineSrc(ctx) { return fs.readFileSync(path.join(ctx.extensionPath, 'media', 'pixel-engine.js'), 'utf8'); }
function engine(ctx) { return require(path.join(ctx.extensionPath, 'media', 'pixel-engine.js')); }

function readCfg() {
  const c = vscode.workspace.getConfiguration(SECTION);
  return {
    enabled: c.get('enabled', true),
    theme: c.get('theme', 'night-city'),
    mode: c.get('mode', 'behind'),
    intensity: c.get('intensity', 0.6),
    pixelSize: c.get('pixelSize', 4),
    animate: c.get('animate', true),
    fps: c.get('fps', 12),
    hotkey: c.get('hotkey', true)
  };
}

async function writeCfg(next) {
  const c = vscode.workspace.getConfiguration(SECTION);
  const cur = readCfg();
  for (const k of Object.keys(next)) {
    if (next[k] !== undefined && next[k] !== cur[k]) await c.update(k, next[k], vscode.ConfigurationTarget.Global);
  }
}

function claudeDirs(ctx) {
  const roots = patcher.defaultRoots([path.dirname(ctx.extensionPath)]);
  const dirs = patcher.findClaudeDirs(roots);
  const ext = vscode.extensions.getExtension('anthropic.claude-code');
  if (ext && fs.existsSync(patcher.targetFile(ext.extensionPath)) && !dirs.includes(ext.extensionPath)) dirs.push(ext.extensionPath);
  return dirs;
}

function promptReload(msg) {
  if (reloadPending) return;
  reloadPending = true;
  vscode.window.showInformationMessage(msg || 'Claude Pixel BG: đã cập nhật nền. Reload Window để thấy thay đổi trong panel Claude.', 'Reload Window', 'Để sau')
    .then((c) => {
      reloadPending = false;
      if (c === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow');
    });
}

/** Make the Claude Code webview match the current settings. */
function sync(ctx, opts) {
  opts = opts || {};
  const cfg = readCfg();
  const dirs = claudeDirs(ctx);
  updateStatus(ctx, cfg);
  if (!dirs.length) {
    if (!opts.silent) vscode.window.showWarningMessage('Claude Pixel BG: không tìm thấy extension Claude Code (anthropic.claude-code). Hãy cài Claude Code trước.');
    return 0;
  }
  let changed = 0;
  const errors = [];
  const src = cfg.enabled ? engineSrc(ctx) : '';
  for (const d of dirs) {
    try {
      const r = cfg.enabled ? patcher.apply(d, cfg, src) : patcher.remove(d);
      if (r.changed) changed++;
    } catch (e) {
      errors.push(`${path.basename(d)}: ${e.message}`);
    }
  }
  if (errors.length) vscode.window.showErrorMessage('Claude Pixel BG: lỗi khi ghi file — ' + errors.join('; '));
  if (changed) promptReload(cfg.enabled ? undefined : 'Claude Pixel BG: đã gỡ nền khỏi Claude Code. Reload Window để hoàn tất.');
  else if (!opts.silent) vscode.window.showInformationMessage('Claude Pixel BG: nền đã được áp dụng sẵn.');
  return changed;
}

function updateStatus(ctx, cfg) {
  if (!statusItem) return;
  const t = engine(ctx).getTheme(cfg.theme);
  statusItem.text = cfg.enabled ? `$(paintcan) ${t.name}` : '$(paintcan) Pixel BG: tắt';
  statusItem.tooltip = 'Claude Pixel BG — bấm để chọn nền';
  statusItem.show();
}

async function chooseTheme(ctx) {
  const P = engine(ctx);
  const cur = readCfg();
  const items = P.themes.map((t) => ({ label: (t.id === cur.theme ? '$(check) ' : '$(circle-large-outline) ') + t.name, description: t.dark ? 'tối' : 'sáng', detail: t.desc, id: t.id }));
  items.push({ label: '$(eye) Mở gallery có xem trước…', id: '__gallery' });
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Chọn background pixel cho Claude Code', matchOnDetail: true });
  if (!pick) return;
  if (pick.id === '__gallery') return openGallery(ctx);
  await writeCfg({ theme: pick.id, enabled: true });
}

let panel = null;
function openGallery(ctx) {
  if (panel) { panel.reveal(); return; }
  panel = vscode.window.createWebviewPanel('claudePixelBg.gallery', 'Claude Pixel BG', vscode.ViewColumn.Active, {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.file(path.join(ctx.extensionPath, 'media'))]
  });
  panel.iconPath = vscode.Uri.file(path.join(ctx.extensionPath, 'media', 'icon.png'));
  const w = panel.webview;
  const u = (f) => w.asWebviewUri(vscode.Uri.file(path.join(ctx.extensionPath, 'media', f)));
  const nonce = crypto.randomBytes(16).toString('hex');
  const footer = '<div class="pbg-actions"><button class="pbg-btn" id="reload" type="button">↻ Reload Window để áp dụng</button>' +
    '<span class="pbg-status" id="st">Thay đổi được lưu vào Settings ngay.</span></div>';
  w.html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${w.cspSource} data:; style-src ${w.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${u('settings-ui.css')}">
<style>.pbg{max-width:720px;margin:0 auto}.pbg-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}</style>
<title>Claude Pixel BG</title></head><body><div id="app"></div>
<script nonce="${nonce}" src="${u('pixel-engine.js')}"></script>
<script nonce="${nonce}" src="${u('settings-ui.js')}"></script>
<script nonce="${nonce}">
  const vs = acquireVsCodeApi();
  const ui = PixelBGUI.render(document.getElementById('app'), ${JSON.stringify(readCfg())}, (s) => {
    vs.postMessage({ type: 'change', settings: s });
    document.getElementById('st').textContent = 'Đã lưu. Reload Window để thấy trong panel Claude.';
  }, { footer: ${JSON.stringify(footer)} });
  document.getElementById('reload').addEventListener('click', () => vs.postMessage({ type: 'reload' }));
  addEventListener('message', (e) => { if (e.data && e.data.type === 'settings') ui.set(e.data.settings); });
</script></body></html>`;
  w.onDidReceiveMessage((m) => {
    if (m.type === 'change') {
      const s = m.settings || {};
      reloadPending = true; // the gallery has its own reload button
      writeCfg({ enabled: s.enabled, theme: s.theme, mode: s.mode, intensity: s.intensity, pixelSize: s.pixelSize, animate: s.animate, fps: s.fps })
        .finally(() => { setTimeout(() => { reloadPending = false; }, 500); });
    } else if (m.type === 'reload') {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }, null, ctx.subscriptions);
  panel.onDidDispose(() => { panel = null; }, null, ctx.subscriptions);
}

function activate(ctx) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusItem.command = 'claudePixelBg.gallery';
  ctx.subscriptions.push(statusItem);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('claudePixelBg.gallery', () => openGallery(ctx)),
    vscode.commands.registerCommand('claudePixelBg.chooseTheme', () => chooseTheme(ctx)),
    vscode.commands.registerCommand('claudePixelBg.nextTheme', async () => {
      const P = engine(ctx), cur = readCfg();
      const i = P.themes.findIndex((t) => t.id === cur.theme);
      await writeCfg({ theme: P.themes[(i + 1) % P.themes.length].id, enabled: true });
    }),
    vscode.commands.registerCommand('claudePixelBg.enable', () => writeCfg({ enabled: true })),
    vscode.commands.registerCommand('claudePixelBg.disable', () => writeCfg({ enabled: false })),
    vscode.commands.registerCommand('claudePixelBg.reapply', () => sync(ctx, { silent: false })),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(SECTION)) return;
      sync(ctx, { silent: true });
      if (panel) panel.webview.postMessage({ type: 'settings', settings: readCfg() });
    }),
    // Claude Code updated / installed → re-apply to the new version
    vscode.extensions.onDidChange(() => sync(ctx, { silent: true }))
  );

  const first = !ctx.globalState.get('welcomed');
  const changed = sync(ctx, { silent: true });
  if (first) {
    ctx.globalState.update('welcomed', true);
    vscode.window.showInformationMessage('Claude Pixel BG đã cài! Chọn một nền pixel cho Claude Code.', 'Mở gallery').then((c) => {
      if (c) openGallery(ctx);
    });
  } else if (!changed) {
    updateStatus(ctx, readCfg());
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
