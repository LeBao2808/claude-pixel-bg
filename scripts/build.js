#!/usr/bin/env node
/*
 * Build: node scripts/build.js
 *  1. copy shared/* into browser-extension/ and vscode-extension/media/
 *  2. generate pixel-art PNG icons
 *  3. sync the theme enum into vscode-extension/package.json
 *  4. package dist/claude-pixel-bg-<ver>.vsix and dist/claude-pixel-bg-browser-<ver>.zip
 * No npm dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SHARED = path.join(ROOT, 'shared');
const BX = path.join(ROOT, 'browser-extension');
const VX = path.join(ROOT, 'vscode-extension');
const DIST = path.join(ROOT, 'dist');

// ── 1. copy shared files ──
const sharedFiles = ['pixel-engine.js', 'settings-ui.js', 'settings-ui.css'];
fs.mkdirSync(path.join(VX, 'media'), { recursive: true });
for (const f of sharedFiles) {
  fs.copyFileSync(path.join(SHARED, f), path.join(BX, f));
  fs.copyFileSync(path.join(SHARED, f), path.join(VX, 'media', f));
}
console.log('✓ copied shared files');

// ── 2. icons ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; }

/** 16×16 pixel-art icon: a framed synthwave sunset. */
function icon16(x, y) {
  const T = [0, 0, 0, 0];
  const corner = (x === 0 || x === 15) && (y === 0 || y === 15);
  if (corner) return T;
  if (x === 0 || y === 0 || x === 15 || y === 15) return hex('#1a0d08');
  if (x === 1 || y === 1 || x === 14 || y === 14) return hex('#d97757');
  const hz = 9;
  if (y < hz) {
    const dx = x - 7.5, dy = y - 8;
    if (dx * dx + dy * dy <= 12.5 && !(y === 7)) return hex(y < 6 ? '#fff27a' : '#ffa63d');
    return hex(['#1a0840', '#1a0840', '#3a0f6b', '#3a0f6b', '#781c8a', '#b02a8e', '#d1348e', '#ff6680', '#ff6680'][y]);
  }
  if (y === hz || y === 11 || y === 13) return hex('#ff2fb9');
  const f = (y - hz) / 5;
  for (const i of [-2, -1, 0, 1, 2]) if (Math.round(7.5 + i * 3 * f * 1.6) === x) return hex('#ff2fb9');
  return hex('#14042a');
}
function scaled(n) { const s = n / 16; return (x, y) => icon16(Math.floor(x / s), Math.floor(y / s)); }
fs.mkdirSync(path.join(BX, 'icons'), { recursive: true });
for (const n of [16, 48, 128]) fs.writeFileSync(path.join(BX, 'icons', `icon${n}.png`), png(n, n, scaled(n)));
fs.writeFileSync(path.join(VX, 'media', 'icon.png'), png(128, 128, scaled(128)));
console.log('✓ icons');

// ── 3. theme enum ──
delete require.cache[require.resolve(path.join(SHARED, 'pixel-engine.js'))];
delete globalThis.PixelBG;
const P = require(path.join(SHARED, 'pixel-engine.js'));
const pkgPath = path.join(VX, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const themeProp = pkg.contributes.configuration.properties['claudePixelBg.theme'];
themeProp.enum = P.themes.map((t) => t.id);
themeProp.enumDescriptions = P.themes.map((t) => `${t.name} — ${t.desc}`);
themeProp.default = P.DEFAULTS.theme;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✓ ${P.themes.length} themes → package.json`);

// ── 4. packaging ──
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = e.data;
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
function walk(dir, base = dir) {
  const out = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

fs.mkdirSync(DIST, { recursive: true });

const vxFiles = walk(VX).filter((f) => !f.startsWith('node_modules/') && !f.endsWith('.vsix'));
const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}" />
    <DisplayName>${xmlEsc(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${xmlEsc(pkg.description)}</Description>
    <Tags>${xmlEsc(pkg.keywords.join(','))}</Tags>
    <Categories>${xmlEsc(pkg.categories.join(','))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xmlEsc(pkg.engines.vscode)}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui" />
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value="" />
    </Properties>
    <License>extension/LICENSE.txt</License>
    <Icon>extension/media/icon.png</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE.txt" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/media/icon.png" Addressable="true" />
  </Assets>
</PackageManifest>
`;
const contentTypes = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  ['.json:application/json', '.vsixmanifest:text/xml', '.js:application/javascript', '.png:image/png', '.css:text/css', '.md:text/markdown', '.txt:text/plain']
    .map((p) => { const [e, t] = p.split(':'); return `<Default Extension="${e}" ContentType="${t}"/>`; }).join('') + '</Types>';
const vsix = zip([
  { name: 'extension.vsixmanifest', data: Buffer.from(manifest) },
  { name: '[Content_Types].xml', data: Buffer.from(contentTypes) },
  ...vxFiles.map((f) => ({ name: 'extension/' + f, data: fs.readFileSync(path.join(VX, f)) }))
]);
const vsixPath = path.join(DIST, `${pkg.name}-${pkg.version}.vsix`);
fs.writeFileSync(vsixPath, vsix);
console.log(`✓ ${path.relative(ROOT, vsixPath)} (${vxFiles.length} files, ${(vsix.length / 1024).toFixed(1)} KB)`);

const bxManifest = JSON.parse(fs.readFileSync(path.join(BX, 'manifest.json'), 'utf8'));
const bxFiles = walk(BX);
const bzip = zip(bxFiles.map((f) => ({ name: f, data: fs.readFileSync(path.join(BX, f)) })));
const bzipPath = path.join(DIST, `claude-pixel-bg-browser-${bxManifest.version}.zip`);
fs.writeFileSync(bzipPath, bzip);
console.log(`✓ ${path.relative(ROOT, bzipPath)} (${bxFiles.length} files)`);
