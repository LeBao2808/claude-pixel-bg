/*!
 * Claude Pixel BG — pixel-engine.js (shared by the browser extension and the VS Code extension)
 * Procedural, animated pixel-art backgrounds. No external assets.
 */
(function (root) {
  'use strict';
  if (root.PixelBG && root.PixelBG.version) {
    if (typeof module === 'object' && module.exports) module.exports = root.PixelBG;
    return;
  }

  // ───────────────────────── helpers ─────────────────────────
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function h2(a, b) { var v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) {
    c = c.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(function (r) {
    return r.map(function (v) { return (v + 0.5) / 16; });
  });

  function px(g, x, y, c) { if (c) g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  function rect(g, x, y, w, h, c) { if (c) g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function disc(g, cx, cy, r, c) {
    r = Math.round(r); cx = Math.round(cx); cy = Math.round(cy);
    if (r < 0) return;
    g.fillStyle = c;
    for (var dy = -r; dy <= r; dy++) {
      var hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.3);
      g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }
  /** Vertical gradient with ordered (Bayer) dithering — the classic pixel-art sky. */
  function gradient(g, W, y0, y1, colors) {
    y0 = Math.max(0, Math.round(y0)); y1 = Math.round(y1);
    var h = y1 - y0;
    if (h <= 0 || W <= 0) return;
    var cs = colors.map(hex), n = cs.length - 1;
    var img = g.createImageData(W, h), d = img.data;
    for (var y = 0; y < h; y++) {
      var p = n === 0 ? 0 : (h === 1 ? 0 : y / (h - 1)) * n;
      var i = Math.min(Math.max(n - 1, 0), Math.floor(p)), f = p - i;
      var row = BAYER[(y + y0) & 3];
      for (var x = 0; x < W; x++) {
        var c = n > 0 && f > row[x & 3] ? cs[i + 1] : cs[i];
        var o = (y * W + x) << 2;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, y0);
  }
  /** 1D midpoint-displacement terrain, normalised to 0..1 */
  function terrain(rnd, W, rough) {
    var size = 1; while (size < W) size <<= 1;
    var a = new Float32Array(size + 1);
    a[0] = rnd(); a[size] = rnd();
    var step = size, disp = 1;
    while (step > 1) {
      var half = step >> 1;
      for (var i = half; i < size; i += step) a[i] = (a[i - half] + a[i + half]) / 2 + (rnd() - 0.5) * disp;
      step = half; disp *= rough;
    }
    var mn = Infinity, mx = -Infinity;
    for (var j = 0; j <= size; j++) { if (a[j] < mn) mn = a[j]; if (a[j] > mx) mx = a[j]; }
    var out = new Float32Array(W);
    for (var x = 0; x < W; x++) out[x] = (a[x] - mn) / ((mx - mn) || 1);
    return out;
  }
  function ridge(g, W, H, base, amp, hs, color, cap) {
    g.fillStyle = color;
    for (var x = 0; x < W; x++) { var top = Math.round(base - amp * hs[x]); g.fillRect(x, top, 1, H - top); }
    if (cap) {
      g.fillStyle = cap.color;
      for (var x2 = 0; x2 < W; x2++) {
        var v = hs[x2];
        if (v > cap.above) {
          var top2 = Math.round(base - amp * v);
          var depth = Math.max(1, Math.round((v - cap.above) * amp * 0.6) + (h2(x2, 3) < 0.3 ? 1 : 0));
          g.fillRect(x2, top2, 1, depth);
        }
      }
    }
  }
  function pine(g, x, base, h, c, snow) {
    var tr = Math.max(1, Math.round(h * 0.12));
    g.fillStyle = c;
    g.fillRect(x, base - tr, 1, tr + 1);
    var ch = h - tr, tier = Math.max(3, Math.round(ch / 4));
    for (var i = 0; i < ch; i++) {
      var hw = Math.floor((i % tier) * 0.55 + i * 0.18);
      g.fillStyle = snow && i % tier === 0 ? snow : c;
      g.fillRect(x - hw, base - h + i, hw * 2 + 1, 1);
    }
  }
  function cloud(g, x, y, w, c, shade) {
    var r = Math.max(2, Math.round(w / 6));
    disc(g, x + r, y, r, c);
    disc(g, x + w / 2, y - r * 0.6, r * 1.4, c);
    disc(g, x + w - r, y, r, c);
    rect(g, x + r, y, w - 2 * r, r + 1, c);
    if (shade) rect(g, x + r * 0.6, y + r, w - r * 1.2, 1, shade);
  }

  // ───────────────────────── themes ─────────────────────────
  var THEMES = [];
  function def(t) { THEMES.push(t); }

  // 1. Night City
  def({
    id: 'night-city', name: 'Night City', desc: 'Thành phố đêm, đèn cửa sổ lung linh, xe bay',
    palette: ['#11133a', '#6a3277', '#ffd66b'], dark: true,
    setup: function (W, H, rnd) {
      var s = { stars: [], far: [], near: [], flick: [], beacons: [] }, i, x;
      var n = Math.round(W * H * 0.003);
      for (i = 0; i < n; i++) s.stars.push([Math.floor(rnd() * W), Math.floor(rnd() * H * 0.6), rnd()]);
      x = -2; while (x < W) { var w = 4 + Math.floor(rnd() * 8); s.far.push([x, w, Math.round(H * (0.2 + rnd() * 0.28))]); x += w; }
      x = -3; while (x < W) { var w2 = 6 + Math.floor(rnd() * 12); s.near.push([x, w2, Math.round(H * (0.1 + rnd() * 0.3)), rnd()]); x += w2 + (rnd() < 0.35 ? 1 : 0); }
      s.cars = [
        { y: Math.round(H * 0.32), sp: W * 0.07, c: '#9fb4ff', off: 0 },
        { y: Math.round(H * 0.4), sp: -W * 0.05, c: '#ff8fd0', off: W * 0.5 }
      ];
      return s;
    },
    paint: function (g, W, H, s) {
      gradient(g, W, 0, H, ['#07081f', '#11133a', '#231a52', '#3d2468', '#6a3277']);
      s.stars.forEach(function (st) { px(g, st[0], st[1], st[2] > 0.6 ? '#c9ccff' : '#5a5e9e'); });
      var mr = Math.max(3, Math.round(Math.min(W, H) * 0.07)), mx = Math.round(W * 0.8), my = Math.round(H * 0.2);
      g.globalAlpha = 0.25; disc(g, mx, my, mr + 3, '#8f7fd0'); g.globalAlpha = 1;
      disc(g, mx, my, mr, '#f4f0c8');
      disc(g, mx + mr * 0.3, my + mr * 0.35, Math.max(0, mr * 0.2), '#d6d09c');
      px(g, mx - mr * 0.4, my - mr * 0.3, '#d6d09c');
      s.far.forEach(function (b) {
        rect(g, b[0], H - b[2], b[1], b[2], '#221c4e');
        if (b[1] > 7) rect(g, b[0] + (b[1] >> 1), H - b[2] - 3, 1, 3, '#221c4e');
      });
      g.fillStyle = '#3a3378';
      s.far.forEach(function (b) {
        for (var yy = H - b[2] + 2; yy < H; yy += 3)
          for (var xx = b[0] + 1; xx < b[0] + b[1] - 1; xx += 2) if (h2(xx, yy) < 0.2) g.fillRect(xx, yy, 1, 1);
      });
      s.flick = []; s.beacons = [];
      s.near.forEach(function (b) {
        var x = b[0], w = b[1], h = b[2], r = b[3];
        rect(g, x, H - h, w, h, '#0c0a21');
        rect(g, x, H - h, 1, h, '#1a1640');
        if (r > 0.75) rect(g, x + 2, H - h - 2, Math.max(1, w - 4), 2, '#0c0a21');
        if (r < 0.18) { rect(g, x + (w >> 1), H - h - 5, 1, 5, '#0c0a21'); s.beacons.push([x + (w >> 1), H - h - 6]); }
        for (var yy = H - h + 2; yy < H - 1; yy += 3)
          for (var xx = x + 2; xx < x + w - 1; xx += 2) {
            var m = h2(xx * 1.3, yy * 0.7);
            if (m < 0.3) {
              px(g, xx, yy, m < 0.03 ? '#7ee7ff' : m < 0.06 ? '#ff9ad5' : '#ffd66b');
              if (m > 0.25) s.flick.push([xx, yy]);
            }
          }
      });
    },
    frame: function (ctx, W, H, t, s) {
      s.stars.forEach(function (st) { if (st[2] > 0.9 && Math.sin(t * 1.7 + st[2] * 400) > 0.2) px(ctx, st[0], st[1], '#ffffff'); });
      ctx.fillStyle = '#0c0a21';
      var k = Math.floor(t / 1.5);
      for (var i = 0; i < s.flick.length; i++) if (h2(i, k) < 0.45) ctx.fillRect(s.flick[i][0], s.flick[i][1], 1, 1);
      if (Math.floor(t * 1.2) % 2 === 0) s.beacons.forEach(function (b) { px(ctx, b[0], b[1], '#ff4f6d'); });
      s.cars.forEach(function (c) {
        var span = W + 16;
        var x = Math.round((((c.off + t * c.sp) % span) + span) % span - 8);
        var y = c.y + Math.round(Math.sin(t * 1.3 + c.off));
        rect(ctx, x, y, 5, 2, c.c);
        rect(ctx, x + 1, y - 1, 3, 1, '#c9d1ff');
        px(ctx, c.sp > 0 ? x + 5 : x - 1, y + 1, '#fff6a8');
        if (Math.floor(t * 3) % 2) px(ctx, c.sp > 0 ? x - 1 : x + 5, y, '#ff3b5c');
      });
    }
  });

  // 2. Deep Space
  def({
    id: 'deep-space', name: 'Deep Space', desc: 'Tinh vân, hành tinh có vành đai, sao băng',
    palette: ['#080619', '#4a1f7a', '#f0b16a'], dark: true,
    setup: function (W, H, rnd) {
      var s = { stars: [], bright: [] };
      var n = Math.round(W * H * 0.006);
      for (var i = 0; i < n; i++) {
        var st = [Math.floor(rnd() * W), Math.floor(rnd() * H), rnd()];
        s.stars.push(st); if (st[2] > 0.93) s.bright.push(st);
      }
      s.pr = Math.max(5, Math.round(Math.min(W, H) * 0.17));
      s.pc = [Math.round(W * 0.27), Math.round(H * 0.62)];
      return s;
    },
    paint: function (g, W, H, s, rnd) {
      gradient(g, W, 0, H, ['#03020a', '#080619', '#120b2a', '#0b0820', '#04030c']);
      [['#5a2690', W * 0.68, H * 0.32], ['#1f4a9a', W * 0.78, H * 0.6], ['#8a2a72', W * 0.45, H * 0.2]].forEach(function (nb) {
        var R = Math.min(W, H) * 0.42, N = Math.round(R * R * 1.6);
        g.fillStyle = nb[0];
        for (var i = 0; i < N; i++) {
          var a = rnd() * Math.PI * 2, d = R * rnd() * rnd() * 1.4;
          g.globalAlpha = 0.16 * (1 - d / (R * 1.4));
          g.fillRect(Math.round(nb[1] + Math.cos(a) * d * 1.5), Math.round(nb[2] + Math.sin(a) * d * 0.8), 1, 1);
        }
      });
      g.globalAlpha = 1;
      s.stars.forEach(function (st) { px(g, st[0], st[1], st[2] < 0.5 ? '#3d3a66' : st[2] < 0.85 ? '#8a88c0' : '#e8e6ff'); });
      var cx = s.pc[0], cy = s.pc[1], r = s.pr;
      function ring(back) {
        [[r * 2, '#e9d3a6'], [r * 1.85, '#c9a87a'], [r * 1.7, '#a8865e']].forEach(function (rr) {
          var rx = rr[0], ry = rx * 0.22, steps = Math.ceil(rx * 8);
          g.fillStyle = rr[1];
          for (var k = 0; k < steps; k++) {
            var a = (k / steps) * Math.PI * 2, isBack = Math.sin(a) < 0;
            if (isBack !== back) continue;
            var x = Math.cos(a) * rx, y = Math.sin(a) * ry - x * 0.15;
            g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
          }
        });
      }
      ring(true);
      var bands = ['#f0b16a', '#d9894c', '#ecc58e', '#c2703f', '#f2a866', '#e0b07c'];
      for (var dy = -r; dy <= r; dy++) {
        var hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.3);
        var bi = clamp(Math.floor(((dy + r) / (2 * r + 1)) * bands.length + Math.sin(dy * 0.9) * 0.4), 0, bands.length - 1);
        for (var dx = -hw; dx <= hw; dx++) {
          var sh = (dx * 0.8 + dy * 0.5) / r, th = BAYER[(cy + dy) & 3][(cx + dx) & 3], c = bands[bi];
          if (sh > 0.25 + th * 0.5) c = '#7a3a4a';
          if (sh > 0.65 + th * 0.4) c = '#3a1c33';
          if (sh < -0.7 + th * 0.3) c = '#ffe2b0';
          px(g, cx + dx, cy + dy, c);
        }
      }
      ring(false);
      var mx = Math.round(W * 0.8), my = Math.round(H * 0.25), mr = Math.max(2, Math.round(r * 0.3));
      disc(g, mx, my, mr, '#a3a8cc');
      disc(g, mx + Math.ceil(mr * 0.35), my + Math.ceil(mr * 0.2), Math.max(0, mr - 1), '#7d82ad');
      px(g, mx - mr * 0.3, my - mr * 0.3, '#c9cdea');
    },
    frame: function (ctx, W, H, t, s) {
      s.bright.forEach(function (st) {
        var v = Math.sin(t * 2.3 + st[2] * 900);
        if (v > 0) {
          px(ctx, st[0], st[1], '#ffffff');
          if (v > 0.85) { ctx.globalAlpha = 0.55; ctx.fillRect(st[0] - 1, st[1], 3, 1); ctx.fillRect(st[0], st[1] - 1, 1, 3); ctx.globalAlpha = 1; }
        }
      });
      var P = 3.5, k = Math.floor(t / P), p = (t % P) / 1.1;
      if (p < 1) {
        var sx = h2(k, 1) * W * 0.8 + W * 0.2, sy = h2(k, 2) * H * 0.4;
        var len = Math.max(6, Math.round(W * 0.03)), dist = p * W * 0.35;
        for (var i = 0; i < len; i++) {
          ctx.globalAlpha = (1 - i / len) * (1 - p * 0.6);
          px(ctx, sx - dist + i, sy + dist * 0.5 - i * 0.5, i === 0 ? '#ffffff' : '#bcd2ff');
        }
        ctx.globalAlpha = 1;
      }
    }
  });

  // 3. Sunset Ocean
  def({
    id: 'sunset-ocean', name: 'Sunset Ocean', desc: 'Hoàng hôn trên biển, mặt trời sọc, sóng lấp lánh',
    palette: ['#3a1560', '#ee6f60', '#ffd884'], dark: true,
    setup: function (W, H, rnd) {
      var s = { hz: Math.round(H * 0.62) };
      s.sr = Math.max(4, Math.round(Math.min(W, H) * 0.17));
      s.cx = Math.round(W / 2); s.cy = s.hz - Math.round(s.sr * 0.45);
      s.clouds = [];
      var nc = Math.max(3, Math.round(W / 60));
      for (var i = 0; i < nc; i++) s.clouds.push({ x: rnd() * W, y: Math.round(H * (0.08 + rnd() * 0.32)), w: Math.max(8, Math.round(W * (0.05 + rnd() * 0.08))), sp: 1 + rnd() * 2.5, c: rnd() < 0.5 ? '#f6a5a0' : '#e98aa0' });
      s.sparks = [];
      var ns = Math.round(W * (H - s.hz) * 0.006);
      for (var j = 0; j < ns; j++) s.sparks.push([Math.floor(rnd() * W), s.hz + 2 + Math.floor(rnd() * (H - s.hz - 2)), rnd() * 6.28]);
      s.birds = [];
      for (var b = 0; b < 3; b++) s.birds.push({ x: rnd() * W, y: Math.round(H * (0.2 + rnd() * 0.2)), sp: 3 + rnd() * 3, ph: rnd() * 6 });
      return s;
    },
    paint: function (g, W, H, s) {
      var cx = s.cx, cy = s.cy, sr = s.sr, hz = s.hz;
      gradient(g, W, 0, hz, ['#1c0d3d', '#3a1560', '#712a6e', '#b9437a', '#ee6f60', '#ffa860', '#ffd884']);
      g.globalAlpha = 0.25; disc(g, cx, cy, sr + 3, '#ffd884'); g.globalAlpha = 1;
      for (var dy = -sr; dy <= sr; dy++) {
        var y = cy + dy; if (y >= hz) break;
        if (dy > 0) { var per = 4, gap = Math.min(per - 1, 1 + Math.floor((dy / sr) * 3)); if (dy % per < gap) continue; }
        var rel = (dy + sr) / (2 * sr), hw = Math.floor(Math.sqrt(sr * sr - dy * dy) + 0.3);
        g.fillStyle = rel < 0.4 ? '#fff4c2' : rel < 0.7 ? '#ffe08a' : '#ffc06a';
        g.fillRect(cx - hw, y, hw * 2 + 1, 1);
      }
      gradient(g, W, hz, H, ['#6b2d6e', '#4a2162', '#2c1650', '#170c33']);
      g.globalAlpha = 0.6; rect(g, 0, hz, W, 1, '#ffb37a'); g.globalAlpha = 1;
      var x0 = W * 0.04, x1 = W * 0.28, ih = H * 0.06;
      for (var x = Math.floor(x0); x <= x1; x++) {
        var d = (x - x0) / (x1 - x0), hh = Math.round(Math.pow(Math.sin(Math.PI * d), 0.7) * ih);
        rect(g, x, hz - hh, 1, hh + 1, '#2a1340');
      }
      var tx = Math.round(x0 + (x1 - x0) * 0.6), th = Math.max(4, Math.round(H * 0.11)), tb = hz - Math.round(ih * 0.8);
      g.fillStyle = '#2a1340';
      for (var i = 0; i < th; i++) g.fillRect(tx + Math.round(Math.sin((i / th) * 1.2) * 2), tb - i, 1, 1);
      var topx = tx + Math.round(Math.sin(1.2) * 2), topy = tb - th, L = Math.max(3, Math.round(H * 0.045));
      [-1, -0.6, 0.6, 1, -0.2].forEach(function (dir) {
        for (var j = 0; j < L; j++) g.fillRect(Math.round(topx + dir * j * 1.3), Math.round(topy + (j * j) / L * 0.7 - (Math.abs(dir) < 0.5 ? j * 0.5 : 0)), 1, 1);
      });
    },
    frame: function (ctx, W, H, t, s) {
      var cx = s.cx, sr = s.sr, hz = s.hz, shift = Math.floor(t * 4);
      for (var y = hz + 1; y < H; y++) {
        var f = (y - hz) / (H - hz); if (f > 0.85) break;
        if ((y + shift) % 3 === 0) continue;
        var w = sr * (1.7 - f * 0.9);
        ctx.fillStyle = f < 0.3 ? '#ffe08a' : f < 0.6 ? '#ffb36b' : '#ee6f60';
        for (var j = 0; j < 3; j++) {
          var off = Math.sin(t * 1.6 + y * 0.9 + j * 2.1) * sr * 0.25;
          var len = Math.max(1, w * (0.15 + 0.12 * Math.sin(t * 2 + y + j)));
          ctx.fillRect(Math.round(cx + (j - 1) * w * 0.35 + off - len / 2), y, Math.round(len), 1);
        }
      }
      ctx.fillStyle = '#d79bd6';
      s.sparks.forEach(function (sp) { if (Math.sin(t * 2.5 + sp[2]) > 0.85) ctx.fillRect(sp[0], sp[1], 2, 1); });
      s.clouds.forEach(function (c) {
        var span = W + c.w * 2;
        cloud(ctx, Math.round(((c.x + t * c.sp) % span) - c.w), c.y, c.w, c.c, '#c96a8a');
      });
      ctx.fillStyle = '#2a1340';
      s.birds.forEach(function (b) {
        var x = Math.round(W + 10 - ((b.x + t * b.sp) % (W + 20))), y = b.y + Math.round(Math.sin(t + b.ph));
        var up = Math.floor(t * 4 + b.ph) % 2;
        ctx.fillRect(x, y, 1, 1);
        if (up) { ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); ctx.fillRect(x - 2, y - 2, 1, 1); ctx.fillRect(x + 2, y - 2, 1, 1); }
        else { ctx.fillRect(x - 2, y, 2, 1); ctx.fillRect(x + 1, y, 2, 1); }
      });
    }
  });

  // 4. Firefly Forest
  def({
    id: 'firefly-forest', name: 'Firefly Forest', desc: 'Rừng thông lúc chạng vạng với đom đóm',
    palette: ['#11304a', '#33786f', '#c8ff5a'], dark: true,
    setup: function (W, H, rnd) {
      var s = { ff: [], layers: [], stars: [] }, i;
      var n = clamp(Math.round((W * H) / 900), 15, 80);
      for (i = 0; i < n; i++) s.ff.push([rnd() * W, H * (0.45 + rnd() * 0.5), rnd() * 6.28, 0.6 + rnd() * 0.8]);
      s.mt = terrain(rnd, W, 0.55);
      [[0.7, 0.1, 0.2, '#1a3c44', 4, 8], [0.84, 0.14, 0.28, '#10292f', 6, 11], [1.0, 0.2, 0.4, '#07161a', 9, 18]].forEach(function (sp) {
        var trees = [], x = -4;
        while (x < W + 4) { trees.push([x, Math.round(H * (sp[1] + rnd() * (sp[2] - sp[1])))]); x += sp[4] + Math.floor(rnd() * (sp[5] - sp[4])); }
        s.layers.push({ base: Math.round(H * sp[0]), c: sp[3], trees: trees });
      });
      for (i = 0; i < W * H * 0.0015; i++) s.stars.push([Math.floor(rnd() * W), Math.floor(rnd() * H * 0.35)]);
      return s;
    },
    paint: function (g, W, H, s) {
      gradient(g, W, 0, H, ['#0a1a2a', '#11304a', '#1b4f63', '#33786f', '#6ea684']);
      s.stars.forEach(function (st) { px(g, st[0], st[1], '#9fd0d8'); });
      disc(g, W * 0.18, H * 0.16, Math.max(2, Math.min(W, H) * 0.05), '#e8f5d8');
      ridge(g, W, H, Math.round(H * 0.62), H * 0.22, s.mt, '#2a5a62');
      s.layers.forEach(function (L, i) {
        if (i > 0) { g.globalAlpha = 0.12; rect(g, 0, L.base - H * 0.14, W, H * 0.14, '#bfe8d8'); g.globalAlpha = 1; }
        L.trees.forEach(function (tr) { pine(g, tr[0], L.base, tr[1], L.c); });
        rect(g, 0, L.base, W, H - L.base + 1, L.c);
      });
    },
    frame: function (ctx, W, H, t, s) {
      s.ff.forEach(function (f) {
        var x = Math.round(f[0] + Math.sin(t * 0.4 * f[3] + f[2]) * W * 0.03);
        var y = Math.round(f[1] + Math.cos(t * 0.5 * f[3] + f[2] * 1.7) * H * 0.03);
        var b = (Math.sin(t * 2.2 * f[3] + f[2] * 3) + 1) / 2;
        if (b < 0.25) return;
        ctx.globalAlpha = b * 0.3; rect(ctx, x - 1, y - 1, 3, 3, '#c8ff5a');
        ctx.globalAlpha = b; px(ctx, x, y, '#f4ffb0');
      });
      ctx.globalAlpha = 1;
    }
  });

  // 5. Sakura
  def({
    id: 'sakura', name: 'Sakura Hill', desc: 'Núi tuyết, cổng torii, cánh hoa anh đào bay',
    palette: ['#a9b6ea', '#f3c6dc', '#e57fa8'], dark: false,
    setup: function (W, H, rnd) {
      var s = { p: [] }, cols = ['#ffc4dc', '#ff9fc4', '#ffe0ec'];
      var n = clamp(Math.round((W * H) / 1300), 25, 160);
      for (var i = 0; i < n; i++) s.p.push({ x: rnd() * W, y: rnd() * H, vx: 4 + rnd() * 8, vy: 5 + rnd() * 9, ph: rnd() * 6.28, c: cols[Math.floor(rnd() * 3)] });
      s.hill = terrain(rnd, W, 0.45);
      var R = Math.min(W, H) * 0.22;
      s.trees = [[W * 0.1, W * 0.14, H * 0.4, R], [W * 0.9, W * 0.87, H * 0.47, R * 0.8]].map(function (tr) {
        var blobs = [];
        for (var k = 0; k < 16; k++) { var a = rnd() * Math.PI * 2, d = rnd() * tr[3] * 0.7; blobs.push([tr[1] + Math.cos(a) * d * 1.3, tr[2] + Math.sin(a) * d * 0.7, tr[3] * (0.25 + rnd() * 0.2)]); }
        return { tx: tr[0], cy: tr[2], blobs: blobs };
      });
      return s;
    },
    paint: function (g, W, H, s) {
      gradient(g, W, 0, H, ['#86a9e0', '#a9b6ea', '#cdbde9', '#f3c6dc', '#ffdcd2']);
      var sx = W * 0.7, sy = H * 0.22, srr = Math.min(W, H) * 0.08;
      g.globalAlpha = 0.35; disc(g, sx, sy, srr * 1.4, '#fff2e6'); g.globalAlpha = 1; disc(g, sx, sy, srr, '#fff8f0');
      var cx = Math.round(W * 0.5), peak = Math.round(H * 0.3), base = Math.round(H * 0.8), hw = Math.min(W * 0.42, H * 0.9);
      for (var x = Math.floor(cx - hw); x <= cx + hw; x++) {
        var d = Math.max(0, Math.abs(x - cx) / hw - 0.03); if (d > 1) continue;
        var top = Math.round(peak + (base - peak) * Math.sqrt(d));
        g.fillStyle = x > cx ? '#5d6aa8' : '#6f7cbc'; g.fillRect(x, top, 1, base - top + 1);
        var snow = Math.round(peak + (base - peak) * 0.3 + (h2(x, 9) < 0.3 ? 2 : 0) + Math.sin(x * 0.6) * 1.5);
        if (snow > top) { g.fillStyle = x > cx ? '#dfe4f7' : '#f6f7ff'; g.fillRect(x, top, 1, snow - top); }
      }
      var hb = Math.round(H * 0.86), ha = H * 0.08;
      ridge(g, W, H, hb, ha, s.hill, '#c77aa2');
      rect(g, 0, H * 0.93, W, H, '#b0648c');
      g.fillStyle = '#d98bb0';
      for (var yy = Math.round(H * 0.93); yy < H; yy++) for (var xx = 0; xx < W; xx++) if (h2(xx, yy) < 0.06) g.fillRect(xx, yy, 1, 1);
      // torii
      var gx = Math.round(W * 0.62), gy = Math.round(hb - ha * s.hill[clamp(gx, 0, W - 1)]) + 1, sz = Math.max(4, Math.round(H * 0.06));
      rect(g, gx - sz, gy - sz, 1, sz, '#c8323f'); rect(g, gx + sz, gy - sz, 1, sz, '#c8323f');
      rect(g, gx - sz - 2, gy - sz - 1, sz * 2 + 5, 1, '#3a1a22');
      rect(g, gx - sz - 1, gy - sz, sz * 2 + 3, 1, '#d8434b');
      rect(g, gx - sz, gy - sz + 2, sz * 2 + 1, 1, '#c8323f');
      // trees
      s.trees.forEach(function (tr) {
        rect(g, tr.tx - 1, tr.cy, 3, H - tr.cy, '#4a2e3a');
        g.fillStyle = '#4a2e3a';
        tr.blobs.slice(0, 5).forEach(function (b) {
          var n = Math.ceil(Math.abs(b[0] - tr.tx) + Math.abs(b[1] - tr.cy));
          for (var i = 0; i <= n; i++) g.fillRect(Math.round(tr.tx + ((b[0] - tr.tx) * i) / n), Math.round(tr.cy + H * 0.08 + ((b[1] - tr.cy - H * 0.08) * i) / n), 1, 1);
        });
        tr.blobs.forEach(function (b) { disc(g, b[0], b[1], b[2], '#e57fa8'); });
        tr.blobs.forEach(function (b) { disc(g, b[0] - 1, b[1] - 1, b[2] * 0.75, '#f7a8c8'); });
        tr.blobs.forEach(function (b) { disc(g, b[0] - b[2] * 0.3, b[1] - b[2] * 0.3, b[2] * 0.35, '#ffd1e3'); });
      });
    },
    frame: function (ctx, W, H, t, s) {
      var dt = s.dt;
      s.p.forEach(function (p) {
        p.y += p.vy * dt; p.x += (p.vx * 0.4 + Math.sin(t * 1.4 + p.ph) * 8) * dt;
        if (p.y > H + 2) { p.y = -2; p.x = s.rand() * W; }
        if (p.x > W + 2) p.x = -2; if (p.x < -2) p.x = W + 2;
        ctx.fillStyle = p.c;
        if (Math.floor(t * 3 + p.ph) % 2) ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 1);
        else ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 2);
      });
    }
  });

  // 6. Synthwave
  def({
    id: 'synthwave', name: 'Synthwave', desc: 'Mặt trời neon, lưới retro chạy vô tận',
    palette: ['#1a0840', '#ff2fb9', '#ffd056'], dark: true,
    setup: function (W, H, rnd) {
      var s = { hz: Math.round(H * 0.58), stars: [] };
      s.sr = Math.max(5, Math.round(Math.min(W, H) * 0.24));
      s.mt = terrain(rnd, W, 0.6);
      for (var i = 0; i < W * H * 0.002; i++) s.stars.push([Math.floor(rnd() * W), Math.floor(rnd() * s.hz * 0.6), rnd()]);
      return s;
    },
    paint: function (g, W, H, s) {
      var hz = s.hz, sr = s.sr, cx = Math.round(W / 2), cy = hz - Math.round(sr * 0.4);
      gradient(g, W, 0, hz, ['#0b0220', '#1a0840', '#3a0f6b', '#781c8a', '#d1348e', '#ff6680']);
      s.stars.forEach(function (st) { px(g, st[0], st[1], '#ffd6f5'); });
      g.globalAlpha = 0.2; disc(g, cx, cy, sr + 4, '#ff4fa0'); g.globalAlpha = 1;
      var sc = ['#fff27a', '#ffd056', '#ffa63d', '#ff7a4f', '#ff4f7b', '#ff2d95'];
      var per = Math.max(3, Math.round(sr / 5));
      for (var dy = -sr; dy <= sr; dy++) {
        var y = cy + dy; if (y >= hz) break;
        if (dy > -sr * 0.1) { var rel = (dy + sr * 0.1) / (sr * 1.1), gap = 1 + Math.floor(rel * (per - 2)); if ((dy + 1000 * per) % per < gap) continue; }
        var hw = Math.floor(Math.sqrt(sr * sr - dy * dy) + 0.3);
        g.fillStyle = sc[clamp(Math.floor(((dy + sr) / (2 * sr + 1)) * sc.length), 0, sc.length - 1)];
        g.fillRect(cx - hw, y, hw * 2 + 1, 1);
      }
      for (var x = 0; x < W; x++) {
        var m = Math.pow(Math.min(1, Math.abs(x - cx) / (W * 0.5)), 0.7);
        var top = hz - Math.round(H * 0.16 * s.mt[x] * m + H * 0.01);
        rect(g, x, top, 1, hz - top, '#1c0a40'); px(g, x, top, '#8a2bb0');
      }
      gradient(g, W, hz, H, ['#2a0845', '#14042a', '#0a0118']);
      var S = Math.max(5, Math.round(W / 16)), n = Math.ceil(W / (S * 2)) + 2;
      g.fillStyle = '#ff2fb9';
      for (var i = -n; i <= n; i++) {
        var prev = cx;
        for (var yy = hz + 1; yy < H; yy++) {
          var f = (yy - hz) / (H - hz), xx = Math.round(cx + i * S * 2 * f * 1.6);
          g.globalAlpha = 0.35 + 0.65 * f;
          g.fillRect(Math.min(prev, xx), yy, Math.abs(xx - prev) + 1, 1);
          prev = xx;
        }
      }
      g.globalAlpha = 1;
      rect(g, 0, hz, W, 1, '#ff7ad9');
    },
    frame: function (ctx, W, H, t, s) {
      var hz = s.hz, N = 12;
      s.stars.forEach(function (st) { if (st[2] > 0.8 && Math.sin(t * 2 + st[2] * 300) > 0.5) px(ctx, st[0], st[1], '#ffffff'); });
      ctx.fillStyle = '#ff3fc8';
      for (var k = 0; k < N; k++) {
        var z = ((k + t * 0.5) % N) / N;
        ctx.globalAlpha = 0.3 + 0.7 * z;
        ctx.fillRect(0, Math.round(hz + 1 + z * z * (H - hz)), W, 1);
      }
      ctx.globalAlpha = 1;
    }
  });

  // 7. Aurora Peaks
  def({
    id: 'aurora-peaks', name: 'Aurora Peaks', desc: 'Núi tuyết, cực quang uốn lượn, tuyết rơi',
    palette: ['#0d1836', '#3dffa8', '#d6e2fb'], dark: true,
    setup: function (W, H, rnd) {
      var s = { stars: [], flakes: [], pines: [] }, i;
      s.far = terrain(rnd, W, 0.55); s.near = terrain(rnd, W, 0.6);
      s.farBase = Math.round(H * 0.72); s.nearBase = Math.round(H * 0.86);
      s.sky = new Int16Array(W);
      for (i = 0; i < W; i++) s.sky[i] = Math.round(s.farBase - H * 0.3 * s.far[i]);
      var n = clamp(Math.round((W * H) / 350), 40, 400);
      for (i = 0; i < n; i++) s.flakes.push({ x: rnd() * W, y: rnd() * H, v: 6 + rnd() * 14, ph: rnd() * 6.28, sz: rnd() < 0.15 ? 2 : 1 });
      var x = Math.floor(rnd() * 8);
      while (x < W) { s.pines.push([x, Math.round(H * (0.06 + rnd() * 0.09))]); x += 5 + Math.floor(rnd() * W * 0.08); }
      for (i = 0; i < W * H * 0.002; i++) s.stars.push([Math.floor(rnd() * W), Math.floor(rnd() * H * 0.5)]);
      return s;
    },
    paint: function (g, W, H, s) {
      gradient(g, W, 0, H, ['#060b1e', '#0d1836', '#1b2f5a', '#35507f', '#7d98c0']);
      s.stars.forEach(function (st) { px(g, st[0], st[1], '#cfe0ff'); });
      ridge(g, W, H, s.farBase, H * 0.3, s.far, '#33497a', { above: 0.55, color: '#d6e2fb' });
      ridge(g, W, H, s.nearBase, H * 0.22, s.near, '#1f2e55', { above: 0.5, color: '#b9c9ec' });
      var gy = Math.round(H * 0.92);
      for (var x = 0; x < W; x++) {
        var top = gy - Math.round(Math.sin(x * 0.05) * 2 + Math.sin(x * 0.13));
        rect(g, x, top, 1, H - top, '#e3ecfa');
        for (var y = top + 1; y < H; y++) if (h2(x, y) < 0.08) px(g, x, y, '#c4d3ec');
      }
      s.pines.forEach(function (p) { pine(g, p[0], gy + 1, p[1], '#0e1a33', '#e8f0ff'); });
    },
    frame: function (ctx, W, H, t, s) {
      for (var x = 0; x < W; x++) {
        var y = Math.round(H * 0.16 + Math.sin(x * 0.035 + t * 0.35) * H * 0.05 + Math.sin(x * 0.011 - t * 0.22) * H * 0.06);
        var L = Math.max(3, Math.round(H * 0.1 + Math.sin(x * 0.08 + t * 0.9) * H * 0.04));
        var glow = (Math.sin(x * 0.02 + t * 0.6) + 1) / 2, lim = s.sky[x] - 1, b = Math.ceil(L / 3);
        var bands = [['#b7ffd9', 0.55], ['#3dffa8', 0.4], ['#2fb8ff', 0.2]];
        for (var j = 0; j < 3; j++) {
          var y0 = y + j * b, y1 = Math.min(y0 + b, lim);
          if (y1 <= y0) break;
          ctx.globalAlpha = bands[j][1] * (0.35 + 0.65 * glow);
          ctx.fillStyle = bands[j][0];
          ctx.fillRect(x, y0, 1, y1 - y0);
        }
      }
      var dt = s.dt;
      ctx.fillStyle = '#ffffff';
      s.flakes.forEach(function (f) {
        f.y += f.v * dt; f.x += Math.sin(t * 0.8 + f.ph) * 4 * dt;
        if (f.y > H) { f.y = -2; f.x = s.rand() * W; }
        ctx.globalAlpha = f.sz > 1 ? 0.95 : 0.75;
        ctx.fillRect(Math.round(f.x), Math.round(f.y), f.sz, f.sz);
      });
      ctx.globalAlpha = 1;
    }
  });

  // 8. Ember Rain (code rain in warm orange)
  def({
    id: 'ember-rain', name: 'Ember Rain', desc: 'Mưa ký tự màu cam ấm, màn hình CRT',
    palette: ['#120906', '#d97757', '#ffe6d2'], dark: true,
    setup: function (W, H, rnd) {
      var s = { cols: [] };
      for (var x = 0; x < W; x += 2) s.cols.push({ x: x, y: rnd() * H * 1.5 - H * 0.5, v: H * (0.15 + rnd() * 0.35), len: Math.round(H * (0.08 + rnd() * 0.22)), seed: rnd() * 1000 });
      return s;
    },
    paint: function (g, W, H) {
      gradient(g, W, 0, H, ['#0b0604', '#120906', '#1a0d08', '#120906']);
      var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.2;
      g.globalAlpha = 0.1; g.fillStyle = '#d97757';
      for (var a = 0; a < 8; a++) {
        var ang = (a * Math.PI) / 4 + Math.PI / 8;
        for (var d = 0; d < R; d++) {
          var w = Math.max(1, Math.round((1 - d / R) * R * 0.14));
          g.fillRect(Math.round(cx + Math.cos(ang) * d - w / 2), Math.round(cy + Math.sin(ang) * d - w / 2), w, w);
        }
      }
      g.globalAlpha = 1;
    },
    frame: function (ctx, W, H, t, s) {
      var k = Math.floor(t * 6), dt = s.dt;
      s.cols.forEach(function (c) {
        c.y += c.v * dt;
        if (c.y - c.len > H) { c.y = -s.rand() * H * 0.3; c.v = H * (0.15 + s.rand() * 0.35); c.len = Math.round(H * (0.08 + s.rand() * 0.22)); }
        var hy = Math.round(c.y);
        for (var j = 0; j < c.len; j += 2) {
          var yy = hy - j; if (yy < 0) break; if (yy >= H) continue;
          if (j > 0 && h2(c.x + c.seed, Math.floor(yy / 2) * 3 + (j < 6 ? k : 0)) < 0.3) continue;
          ctx.globalAlpha = j === 0 ? 1 : Math.max(0.08, (1 - j / c.len) * 0.85);
          ctx.fillStyle = j === 0 ? '#ffe6d2' : j < 4 ? '#ffb08a' : '#d97757';
          ctx.fillRect(c.x, yy, 1, 1);
        }
      });
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#000000';
      for (var y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      ctx.globalAlpha = 1;
    }
  });

  // 9. Deep Sea Aquarium
  var FISH = ['...###..', '#.#####.', '########', '#.#####.', '...###..'];
  def({
    id: 'deep-sea', name: 'Deep Sea', desc: 'Thủy cung: cá bơi, rong biển, bong bóng',
    palette: ['#0a4466', '#2f9e6a', '#ffb347'], dark: true,
    setup: function (W, H, rnd) {
      var s = { weeds: [], fish: [], bub: [], rays: [] }, i;
      s.sand = terrain(rnd, W, 0.45); s.sb = Math.round(H * 0.9);
      var x = 2 + Math.floor(rnd() * 6);
      while (x < W) {
        s.weeds.push({ x: x, base: s.sb - Math.round(H * 0.06 * s.sand[x]), h: Math.round(H * (0.08 + rnd() * 0.2)), ph: rnd() * 6.28, c: rnd() < 0.5 ? '#2f9e6a' : '#1f7a52' });
        x += 4 + Math.floor(rnd() * W * 0.06);
      }
      var fc = ['#ffb347', '#ff6f91', '#7ee7ff', '#ffe66b', '#b38bff'];
      var nf = clamp(Math.round((W * H) / 9000), 4, 14);
      for (i = 0; i < nf; i++) s.fish.push({ y: H * (0.15 + rnd() * 0.6), sp: 8 + rnd() * 18, dir: rnd() < 0.5 ? 1 : -1, off: rnd() * W, c: fc[Math.floor(rnd() * fc.length)], sz: rnd() < 0.25 ? 2 : 1, ph: rnd() * 6.28 });
      var nb = clamp(Math.round((W * H) / 2500), 10, 80);
      for (i = 0; i < nb; i++) s.bub.push({ x: rnd() * W, o: rnd() * H, v: 8 + rnd() * 14, ph: rnd() * 6.28 });
      for (i = 0; i < 5; i++) s.rays.push([rnd() * W - W * 0.2, 2 + Math.floor(rnd() * W * 0.04)]);
      s.rocks = []; for (i = 0; i < 3; i++) s.rocks.push([rnd() * W, Math.max(2, Math.round(H * (0.02 + rnd() * 0.03)))]);
      s.corals = []; for (i = 0; i < 4; i++) s.corals.push([Math.floor(rnd() * W), Math.round(H * (0.05 + rnd() * 0.06)), rnd() < 0.5 ? '#ff6f91' : '#ffb347']);
      return s;
    },
    paint: function (g, W, H, s) {
      gradient(g, W, 0, H, ['#127099', '#0e5a80', '#0a4466', '#07304d', '#041c30']);
      s.rays.forEach(function (r) {
        for (var y = 0; y < H * 0.75; y++) { g.globalAlpha = 0.07 * (1 - y / (H * 0.75)); rect(g, r[0] + y * 0.35, y, r[1], 1, '#c8f3ff'); }
      });
      g.globalAlpha = 1;
      for (var x = 0; x < W; x++) {
        var top = s.sb - Math.round(H * 0.06 * s.sand[x]);
        rect(g, x, top, 1, H - top, '#c9a86a');
        for (var y = top; y < H; y++) { var v = h2(x, y); if (v < 0.12) px(g, x, y, '#a88a52'); else if (v < 0.16) px(g, x, y, '#e3c88e'); }
      }
      function sandTop(x) { x = clamp(Math.round(x), 0, W - 1); return s.sb - Math.round(H * 0.06 * s.sand[x]); }
      s.rocks.forEach(function (r) { var y = sandTop(r[0]); disc(g, r[0], y, r[1], '#3a4658'); px(g, r[0] - r[1] * 0.4, y - r[1] * 0.5, '#5a6a80'); });
      s.corals.forEach(function (c) {
        var x = c[0], y = sandTop(x), h = c[1];
        rect(g, x, y - h, 1, h, c[2]);
        for (var k = 0; k < 3; k++) {
          var by = y - h * (0.3 + 0.2 * k), len = Math.round(h * 0.4), dir = k % 2 ? 1 : -1;
          for (var j = 0; j < len; j++) px(g, x + dir * Math.ceil(j * 0.7), by - j, c[2]);
        }
      });
    },
    frame: function (ctx, W, H, t, s) {
      s.weeds.forEach(function (w) {
        ctx.fillStyle = w.c;
        for (var i = 0; i < w.h; i++) {
          var sway = Math.sin(t * 1.5 + w.ph + i * 0.15) * (i / w.h) * 3;
          ctx.fillRect(Math.round(w.x + sway), w.base - i, 2, 1);
        }
      });
      s.fish.forEach(function (f) {
        var span = W + 24, p = ((t * f.sp + f.off) % span), x = f.dir > 0 ? p - 12 : W + 12 - p;
        var y = Math.round(f.y + Math.sin(t * 2 + f.ph) * 1.5), S = f.sz;
        x = Math.round(x);
        for (var r = 0; r < FISH.length; r++) for (var c = 0; c < 8; c++) {
          if (FISH[r][c] !== '#') continue;
          var cc = f.dir > 0 ? c : 7 - c;
          ctx.fillStyle = (r === 1 && c === 6) ? '#10202c' : f.c;
          ctx.fillRect(x + cc * S, y + r * S, S, S);
        }
      });
      ctx.fillStyle = '#d6f6ff';
      s.bub.forEach(function (b) {
        var y = H - ((t * b.v + b.o) % (H + 4));
        ctx.globalAlpha = 0.6;
        ctx.fillRect(Math.round(b.x + Math.sin(t * 1.5 + b.ph) * 1.5), Math.round(y), 1, 1);
      });
      ctx.globalAlpha = 1;
    }
  });

  var BY_ID = {};
  THEMES.forEach(function (t) { BY_ID[t.id] = t; });
  function getTheme(id) { return BY_ID[id] || THEMES[0]; }
  function themeIndex(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return i; return 0; }

  // ───────────────────────── renderer ─────────────────────────
  function createRenderer(canvas, o) {
    var ctx = canvas.getContext('2d', { alpha: false });
    var theme = getTheme(o.theme), fps = o.fps || 12, animate = o.animate !== false, sizeFn = o.size, seed = o.seed || 20261109;
    var W = 0, H = 0, stat = null, state = null, raf = 0, last = 0, running = false, frames = 0;
    var t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }
    function build() {
      var sz = sizeFn();
      W = Math.max(8, sz[0] | 0); H = Math.max(8, sz[1] | 0);
      canvas.width = W; canvas.height = H; ctx.imageSmoothingEnabled = false;
      stat = document.createElement('canvas'); stat.width = W; stat.height = H;
      var g = stat.getContext('2d');
      var base = (seed ^ hashStr(theme.id)) >>> 0;
      state = theme.setup ? theme.setup(W, H, rng(base)) : {};
      state.rand = rng(base + 99); state.lastT = null; state.dt = 0;
      theme.paint(g, W, H, state, rng(base + 7));
      g.globalAlpha = 1;
    }
    function draw(ms) {
      if (!stat) build();
      var t = animate ? (ms - t0) / 1000 : 4;
      if (state.lastT == null) state.lastT = t;
      state.dt = Math.min(0.25, Math.max(0, t - state.lastT)); state.lastT = t;
      ctx.globalAlpha = 1;
      ctx.drawImage(stat, 0, 0);
      if (theme.frame) { try { theme.frame(ctx, W, H, t, state); } finally { ctx.globalAlpha = 1; } }
    }
    function loop(ms) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (typeof document !== 'undefined' && document.hidden) return;
      if (ms - last < 1000 / fps - 2) return;
      last = ms;
      if (++frames % 30 === 0) { var sz = sizeFn(); if ((sz[0] | 0) !== W || (sz[1] | 0) !== H) stat = null; }
      draw(ms);
    }
    function start() {
      if (running) return; running = true;
      draw(now()); if (animate) raf = requestAnimationFrame(loop);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }
    return {
      setTheme: function (id) { var th = getTheme(id); if (th !== theme) { theme = th; stat = null; if (!animate || !running) draw(now()); } },
      setOptions: function (p) {
        if (p.fps) fps = clamp(+p.fps, 1, 60);
        if (p.animate != null && !!p.animate !== animate) { animate = !!p.animate; if (running) { stop(); start(); } }
      },
      resize: function () { stat = null; if (!animate || !running) draw(now()); },
      renderOnce: function (t) { if (!stat) build(); var a = animate; animate = true; draw(t0 + (t || 4) * 1000); animate = a; },
      start: start, stop: stop,
      destroy: function () { stop(); stat = null; state = null; },
      get theme() { return theme.id; }
    };
  }

  // ───────────────────────── page mount ─────────────────────────
  var DEFAULTS = { enabled: true, theme: 'night-city', mode: 'behind', intensity: 0.6, pixelSize: 4, animate: true, fps: 12, hotkey: true };

  function toast(text) {
    var el = document.getElementById('pixelbg-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pixelbg-toast';
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:8px 12px;background:#1a1426;color:#ffe6d2;' +
        'font:bold 12px/1.2 ui-monospace,Consolas,monospace;border:2px solid #d97757;box-shadow:4px 4px 0 #000;pointer-events:none;transition:opacity .3s;opacity:0';
      document.documentElement.appendChild(el);
    }
    el.textContent = '▣ ' + text;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 1400);
  }

  function mount(o) {
    var opts = Object.assign({}, DEFAULTS, o || {});
    var canvas = document.createElement('canvas');
    canvas.id = 'pixelbg-canvas'; canvas.setAttribute('aria-hidden', 'true');
    var style = document.createElement('style'); style.id = 'pixelbg-style';
    function ps() { return clamp(opts.pixelSize | 0 || 4, 1, 16); }
    var r = createRenderer(canvas, {
      theme: opts.theme, fps: opts.fps, animate: opts.animate,
      size: function () { return [Math.ceil(innerWidth / ps()), Math.ceil(innerHeight / ps())]; }
    });
    var lastPs = ps(), resizeT = 0;
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(function () { r.resize(); }, 150); }
    function onKey(e) {
      if (!opts.hotkey || !opts.enabled) return;
      if (e.altKey && e.shiftKey && e.code === 'KeyB') {
        e.preventDefault(); e.stopPropagation();
        var next = THEMES[(themeIndex(opts.theme) + 1) % THEMES.length];
        opts.theme = next.id; r.setTheme(next.id); toast(next.name);
        if (opts.onThemeChange) try { opts.onThemeChange(next.id); } catch (err) { /* ignore */ }
      }
    }
    addEventListener('resize', onResize);
    addEventListener('keydown', onKey, true);
    function apply() {
      if (!opts.enabled) { r.stop(); canvas.remove(); style.remove(); return; }
      var behind = opts.mode !== 'overlay', k = clamp(+opts.intensity || 0, 0, 1);
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;image-rendering:pixelated;' +
        'z-index:' + (behind ? -1 : 2147483646) + ';opacity:' + (behind ? 1 : (0.06 + k * 0.34).toFixed(3)) + ';';
      var css = '';
      if (behind && opts.css) { try { css = opts.css(1 - k * 0.75); } catch (err) { css = ''; } }
      style.textContent = css;
      var host = document.documentElement;
      if (canvas.parentNode !== host) host.appendChild(canvas);
      var head = document.head || host;
      if (style.parentNode !== head) head.appendChild(style);
      r.setTheme(opts.theme);
      r.setOptions({ fps: opts.fps, animate: opts.animate });
      if (ps() !== lastPs) { lastPs = ps(); r.resize(); }
      r.start();
    }
    apply();
    var guard = setInterval(function () { if (opts.enabled && !canvas.isConnected) apply(); }, 3000);
    return {
      update: function (n) { Object.assign(opts, n || {}); apply(); },
      destroy: function () { clearInterval(guard); r.destroy(); canvas.remove(); style.remove(); removeEventListener('resize', onResize); removeEventListener('keydown', onKey, true); },
      get options() { return Object.assign({}, opts); }
    };
  }

  // ───────────────────────── site adapters (CSS for "behind" mode) ─────────────────────────
  var adapters = {
    /** claude.ai — Tailwind classes `bg-bg-000..500` backed by CSS vars. Detect var format at runtime. */
    claudeWeb: function (a) {
      var p = Math.round(a * 100), cs = getComputedStyle(document.documentElement);
      var out = 'html,body{background:transparent!important}html{background-color:#0b0b14!important}';
      ['000', '100', '200', '300', '400', '500'].forEach(function (n) {
        var v = cs.getPropertyValue('--bg-' + n).trim();
        if (!v) return;
        var col = /^\d[\d.]*(deg)?\s+[\d.]+%\s+[\d.]+%$/.test(v)
          ? 'hsl(var(--bg-' + n + ') / ' + a.toFixed(2) + ')'
          : 'color-mix(in srgb, var(--bg-' + n + ') ' + p + '%, transparent)';
        out += '[class~="bg-bg-' + n + '"]{background-color:' + col + '!important}';
      });
      return out;
    },
    /** Claude Code VS Code webview — everything is driven by --app-* variables. */
    vscode: function (a) {
      var p = Math.round(a * 100), q = Math.min(100, p + 20);
      function mix(v, pct) { return 'color-mix(in srgb,var(' + v + ') ' + pct + '%,transparent)!important'; }
      return 'html,body,#root{background:transparent!important}' +
        'html{--app-primary-background:' + mix('--vscode-sideBar-background', p) +
        ';--app-secondary-background:' + mix('--vscode-editor-background', p) +
        ';--app-header-background:' + mix('--vscode-sideBar-background', p) +
        ';--app-tool-background:' + mix('--vscode-editor-background', q) +
        ';--app-input-background:' + mix('--vscode-input-background', q) + '}';
    }
  };

  var PixelBG = {
    version: '1.0.0',
    themes: THEMES,
    getTheme: getTheme,
    DEFAULTS: DEFAULTS,
    createRenderer: createRenderer,
    mount: mount,
    toast: toast,
    adapters: adapters
  };
  root.PixelBG = PixelBG;
  if (typeof module === 'object' && module.exports) module.exports = PixelBG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
