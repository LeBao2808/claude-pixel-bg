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

  // ───────────────────────── bright daytime scenes ─────────────────────────
  function makeClouds(rnd, W, H, n, y0, y1) {
    var out = [];
    for (var i = 0; i < n; i++) out.push({ x: rnd() * W, y: Math.round(H * (y0 + rnd() * (y1 - y0))), w: Math.max(8, Math.round(W * (0.06 + rnd() * 0.1))), sp: 1.5 + rnd() * 3 });
    return out;
  }
  function drawClouds(ctx, W, t, list, c, shade) {
    list.forEach(function (cl) {
      var span = W + cl.w * 2;
      cloud(ctx, Math.round(((cl.x + t * cl.sp) % span) - cl.w), cl.y, cl.w, c, shade);
    });
  }
  function sun(g, x, y, r, core, glow) {
    g.globalAlpha = 0.2; disc(g, x, y, r * 1.8, glow);
    g.globalAlpha = 0.4; disc(g, x, y, r * 1.35, glow);
    g.globalAlpha = 1; disc(g, x, y, r, core);
  }
  function butterfly(ctx, x, y, c, t, ph) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = c;
    if (Math.floor(t * 6 + ph) % 2) { ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2); }
    else { ctx.fillRect(x - 1, y - 1, 1, 2); ctx.fillRect(x + 1, y - 1, 1, 2); }
    ctx.fillStyle = '#3a2a2a'; ctx.fillRect(x, y - 1, 1, 2);
  }
  /** Round deciduous tree. leaves = [shadow, mid, highlight]. */
  function roundTree(g, x, base, h, trunk, leaves) {
    var r = Math.max(2, h * 0.38), cy = base - h + r;
    rect(g, x - Math.floor(Math.max(1, h * 0.1) / 2), cy, Math.max(1, Math.round(h * 0.1)), base - cy + 1, trunk);
    disc(g, x, cy, r, leaves[0]);
    disc(g, x - r * 0.15, cy - r * 0.15, r * 0.8, leaves[1]);
    disc(g, x - r * 0.35, cy - r * 0.35, r * 0.35, leaves[2]);
  }
  function palm(g, bx, by, h, lean) {
    var tx = bx, ty = by;
    for (var i = 0; i <= h; i++) {
      tx = Math.round(bx + lean * Math.pow(i / h, 2) * h * 0.3); ty = by - i;
      rect(g, tx, ty, 2, 1, i % 3 === 0 ? '#a8743e' : '#8a5a2b');
    }
    var L = Math.max(3, Math.round(h * 0.4));
    [-2.9, -2.4, -1.9, -1.2, -0.7, -0.25].forEach(function (a, k) {
      for (var j = 0; j < L; j++) {
        var x = tx + 1 + Math.cos(a) * j, y = ty + Math.sin(a) * j + (j * j) / L * 0.6;
        rect(g, x, y, 1, 2, k % 2 ? '#2fae4f' : '#239142');
        if (j % 2 === 0) px(g, x, y - 1, '#62d673');
      }
    });
    disc(g, tx + 1, ty + 1, Math.max(1, h * 0.03), '#6b4423');
  }

  // 10. Sunny Meadow
  def({
    id: 'sunny-meadow', name: 'Sunny Meadow', desc: 'Đồng cỏ ngày nắng, mây trắng trôi, hoa và bướm',
    palette: ['#4aa8ff', '#7ed957', '#ffd94a'], dark: false,
    setup: function (W, H, rnd) {
      var s = { far: terrain(rnd, W, 0.5), near: terrain(rnd, W, 0.45), flowers: [], trees: [], bf: [] }, i;
      s.farBase = Math.round(H * 0.7); s.nearBase = Math.round(H * 0.84);
      s.clouds = makeClouds(rnd, W, H, Math.max(3, Math.round(W / 70)), 0.06, 0.4);
      var fc = ['#ff5a6e', '#ffd94a', '#ffffff', '#ff8fd0', '#9d7bff'];
      for (i = 0; i < W * H * 0.01; i++) s.flowers.push([Math.floor(rnd() * W), rnd(), fc[Math.floor(rnd() * fc.length)]]);
      var x = Math.floor(rnd() * W * 0.2);
      while (x < W) { s.trees.push([x, Math.round(H * (0.08 + rnd() * 0.08))]); x += Math.round(W * (0.15 + rnd() * 0.3)); }
      var bc = ['#ffffff', '#ffd94a', '#ff8fd0', '#7ee7ff'];
      for (i = 0; i < clamp(Math.round((W * H) / 6000), 3, 10); i++) s.bf.push({ x: rnd() * W, y: H * (0.55 + rnd() * 0.35), sp: 3 + rnd() * 6, ph: rnd() * 6.28, c: bc[i % bc.length] });
      return s;
    },
    paint: function (g, W, H, s) {
      gradient(g, W, 0, H, ['#3f9cff', '#5eb0ff', '#86c6ff', '#b3dcff', '#e3f4ff']);
      sun(g, W * 0.15, H * 0.16, Math.max(3, Math.min(W, H) * 0.07), '#fffbe0', '#fff2a0');
      ridge(g, W, H, s.farBase, H * 0.18, s.far, '#9edc6c');
      s.trees.forEach(function (tr) {
        var top = Math.round(s.farBase - H * 0.18 * s.far[clamp(tr[0], 0, W - 1)]);
        roundTree(g, tr[0], top + 1, tr[1], '#7a5230', ['#3f9a3a', '#57b847', '#9ae870']);
      });
      ridge(g, W, H, s.nearBase, H * 0.12, s.near, '#5cc24a');
      for (var x = 0; x < W; x++) {
        var top = Math.round(s.nearBase - H * 0.12 * s.near[x]);
        for (var y = top; y < H; y++) { var v = h2(x, y); if (v < 0.08) px(g, x, y, '#45a63a'); else if (v < 0.11) px(g, x, y, '#8ee26e'); }
      }
      s.flowers.forEach(function (f) {
        var top = Math.round(s.nearBase - H * 0.12 * s.near[f[0]]), y = top + 2 + Math.floor(f[1] * Math.max(1, H - top - 3));
        px(g, f[0], y + 1, '#2f8a2c'); px(g, f[0], y, f[2]);
      });
    },
    frame: function (ctx, W, H, t, s) {
      drawClouds(ctx, W, t, s.clouds, '#ffffff', '#d6e9ff');
      s.bf.forEach(function (b) {
        var span = W + 10;
        butterfly(ctx, ((b.x + t * b.sp) % span) - 5 + Math.sin(t * 1.3 + b.ph) * 6, b.y + Math.sin(t * 2.1 + b.ph * 2) * H * 0.03, b.c, t, b.ph);
      });
    }
  });

  // 11. Tropical Beach
  def({
    id: 'tropical-beach', name: 'Tropical Beach', desc: 'Biển xanh ngọc, cát vàng, cây dừa, thuyền buồm',
    palette: ['#2e9bff', '#22c3d8', '#ffe2a0'], dark: false,
    setup: function (W, H, rnd) {
      var s = { hz: Math.round(H * 0.5), shore: Math.round(H * 0.78), sparks: [], gulls: [] }, i;
      s.clouds = makeClouds(rnd, W, H, Math.max(3, Math.round(W / 80)), 0.05, 0.3);
      for (i = 0; i < W * (s.shore - s.hz) * 0.006; i++) s.sparks.push([Math.floor(rnd() * W), s.hz + 1 + Math.floor(rnd() * (s.shore - s.hz - 2)), rnd() * 6.28]);
      for (i = 0; i < 3; i++) s.gulls.push({ x: rnd() * W, y: Math.round(H * (0.15 + rnd() * 0.2)), sp: 4 + rnd() * 4, ph: rnd() * 6 });
      s.boat = { off: rnd() * W, sp: 2 + rnd() * 2 };
      return s;
    },
    paint: function (g, W, H, s) {
      var hz = s.hz, sh = s.shore;
      gradient(g, W, 0, hz, ['#1f8fff', '#45a8ff', '#7cc4ff', '#b6e0ff', '#e6f6ff']);
      sun(g, W * 0.82, H * 0.14, Math.max(3, Math.min(W, H) * 0.06), '#fffbe0', '#fff6b8');
      var ix = Math.round(W * 0.62), iw = Math.round(W * 0.14);
      for (var x = ix; x < ix + iw; x++) { var hh = Math.round(Math.sin(Math.PI * (x - ix) / iw) * H * 0.03); rect(g, x, hz - hh, 1, hh, '#4fae7a'); }
      gradient(g, W, hz, sh + 2, ['#1aa9cf', '#22c3d8', '#3fd6d6', '#7ae6d4']);
      g.globalAlpha = 0.6; rect(g, 0, hz, W, 1, '#e6fbff'); g.globalAlpha = 1;
      for (var x2 = 0; x2 < W; x2++) {
        var top = sh + Math.round(Math.sin(x2 * 0.07) * 1.5);
        rect(g, x2, top, 1, H - top, '#ffe2a0');
        for (var y = top + 2; y < H; y++) { var v = h2(x2, y); if (v < 0.07) px(g, x2, y, '#f0c878'); else if (v < 0.1) px(g, x2, y, '#fff3d0'); }
      }
      palm(g, Math.round(W * 0.08), Math.round(H * 0.97), Math.max(6, Math.round(H * 0.45)), 1);
      palm(g, Math.round(W * 0.93), Math.round(H * 0.97), Math.max(5, Math.round(H * 0.3)), -1);
    },
    frame: function (ctx, W, H, t, s) {
      ctx.fillStyle = '#ffffff';
      s.sparks.forEach(function (sp) { if (Math.sin(t * 2.5 + sp[2]) > 0.8) ctx.fillRect(sp[0], sp[1], 2, 1); });
      var span = W + 12, bx = Math.round(((s.boat.off + t * s.boat.sp) % span) - 6), by = s.hz + 2;
      rect(ctx, bx, by, 6, 1, '#8a4b2a');
      for (var i = 0; i < 4; i++) rect(ctx, bx + 2, by - 1 - i, Math.max(1, 3 - Math.floor(i * 0.7)), 1, i % 2 ? '#ffffff' : '#ff6b6b');
      drawClouds(ctx, W, t, s.clouds, '#ffffff', '#d6ecff');
      ctx.fillStyle = '#34506e';
      s.gulls.forEach(function (b) {
        var x = Math.round(W + 10 - ((b.x + t * b.sp) % (W + 20))), y = b.y + Math.round(Math.sin(t + b.ph));
        ctx.fillRect(x, y, 1, 1);
        if (Math.floor(t * 4 + b.ph) % 2) { ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); ctx.fillRect(x - 2, y - 2, 1, 1); ctx.fillRect(x + 2, y - 2, 1, 1); }
        else { ctx.fillRect(x - 2, y, 2, 1); ctx.fillRect(x + 1, y, 2, 1); }
      });
      ctx.globalAlpha = 0.9;
      for (var x = 0; x < W; x++) {
        var y = s.shore + Math.round(Math.sin(x * 0.07) * 1.5 + Math.sin(x * 0.11 + t * 1.4) + Math.sin(t * 0.8) * 1.5) - 1;
        rect(ctx, x, y, 1, 2, '#ffffff');
      }
      ctx.globalAlpha = 1;
    }
  });

  // 12. Rainbow Sky
  function balloon(ctx, x, y, r, c1, c2) {
    x = Math.round(x); y = Math.round(y);
    var bw = Math.max(1, Math.round(r / 2));
    for (var dy = -r; dy <= r + Math.ceil(r * 0.6); dy++) {
      var hw = dy <= 0 ? Math.floor(Math.sqrt(r * r - dy * dy) + 0.3) : Math.round(r * (1 - dy / (r * 1.7)));
      if (hw < 0) continue;
      for (var dx = -hw; dx <= hw; dx++) { ctx.fillStyle = Math.floor((dx + r + 100 * bw) / bw) % 2 ? c1 : c2; ctx.fillRect(x + dx, y + dy, 1, 1); }
    }
    var by = y + r + Math.ceil(r * 0.6) + 2;
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(x - 1, by, 3, 2);
    ctx.fillStyle = '#5a4a40';
    ctx.fillRect(x - 1, by - 1, 1, 1); ctx.fillRect(x + 1, by - 1, 1, 1);
  }
  def({
    id: 'rainbow-sky', name: 'Rainbow Sky', desc: 'Bầu trời pastel, cầu vồng, khinh khí cầu bay',
    palette: ['#7cc8ff', '#ffd0e6', '#ffe066'], dark: false,
    setup: function (W, H, rnd) {
      var s = { balloons: [], stars: [] }, i;
      s.clouds = makeClouds(rnd, W, H, Math.max(3, Math.round(W / 70)), 0.08, 0.5);
      var pairs = [['#ff6b6b', '#ffe066'], ['#4dabf7', '#ffffff'], ['#9775fa', '#ffc9e6'], ['#51cf66', '#ffe066']];
      for (i = 0; i < clamp(Math.round(W / 70), 2, 5); i++) s.balloons.push({ x: rnd() * W, y: H * (0.12 + rnd() * 0.45), r: Math.max(2, Math.round(Math.min(W, H) * (0.025 + rnd() * 0.025))), sp: 1 + rnd() * 2, ph: rnd() * 6.28, c: pairs[i % pairs.length] });
      for (i = 0; i < W * H * 0.0015; i++) s.stars.push([Math.floor(rnd() * W), Math.floor(rnd() * H * 0.8), rnd() * 6.28]);
      return s;
    },
    paint: function (g, W, H, s, rnd) {
      gradient(g, W, 0, H, ['#7cc8ff', '#a6dbff', '#d3ecff', '#ffe3f1', '#ffd0e6']);
      var cx = W / 2, cy = H * 0.95, R = Math.min(W * 0.55, H * 0.85), bw = Math.max(1, R * 0.06);
      var cols = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'];
      g.globalAlpha = 0.7;
      for (var y = Math.max(0, Math.floor(cy - R)); y < Math.min(H, cy); y++)
        for (var x = Math.max(0, Math.floor(cx - R)); x < Math.min(W, cx + R); x++) {
          var k = Math.floor((R - Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy))) / bw);
          if (k >= 0 && k < cols.length) px(g, x, y, cols[k]);
        }
      g.globalAlpha = 1;
      var n = Math.max(4, Math.round(W / 18)), cr = Math.max(3, W / n);
      for (var i = 0; i <= n; i++) disc(g, (i * W) / n, H * 0.95 + rnd() * cr * 0.4, cr * (0.8 + rnd() * 0.5), '#f3e6ff');
      for (var j = 0; j <= n; j++) disc(g, (j * W) / n + cr * 0.3, H * 0.99, cr * (0.7 + rnd() * 0.4), '#ffffff');
    },
    frame: function (ctx, W, H, t, s) {
      s.stars.forEach(function (st) {
        var v = Math.sin(t * 2 + st[2]);
        if (v > 0.85) { ctx.globalAlpha = 0.9; rect(ctx, st[0] - 1, st[1], 3, 1, '#ffffff'); rect(ctx, st[0], st[1] - 1, 1, 3, '#ffffff'); ctx.globalAlpha = 1; }
      });
      drawClouds(ctx, W, t, s.clouds, '#ffffff', '#ffe6f3');
      s.balloons.forEach(function (b) {
        var span = W + b.r * 4;
        balloon(ctx, ((b.x + t * b.sp) % span) - b.r * 2, b.y + Math.sin(t * 0.6 + b.ph) * H * 0.03, b.r, b.c[0], b.c[1]);
      });
    }
  });

  // 13. Tulip Field
  def({
    id: 'tulip-field', name: 'Tulip Field', desc: 'Cánh đồng tulip nhiều màu, cối xay gió quay',
    palette: ['#4fb0ff', '#ff4d6d', '#ffd43b'], dark: false,
    setup: function (W, H, rnd) {
      var s = { hills: terrain(rnd, W, 0.5), bees: [] };
      s.fy = Math.round(H * 0.62);
      s.clouds = makeClouds(rnd, W, H, Math.max(3, Math.round(W / 70)), 0.05, 0.35);
      s.mill = { x: Math.round(W * 0.78), base: s.fy, h: Math.max(6, Math.round(H * 0.24)) };
      for (var i = 0; i < clamp(Math.round((W * H) / 7000), 3, 8); i++) s.bees.push({ x: rnd() * W, y: H * (0.6 + rnd() * 0.3), ph: rnd() * 6.28, sp: 0.5 + rnd() });
      return s;
    },
    paint: function (g, W, H, s) {
      var fy = s.fy, m = s.mill;
      gradient(g, W, 0, fy, ['#4fb0ff', '#78c4ff', '#a8dbff', '#d6efff']);
      sun(g, W * 0.2, H * 0.15, Math.max(3, Math.min(W, H) * 0.06), '#fffbe0', '#fff2a0');
      ridge(g, W, H, fy, H * 0.06, s.hills, '#7fcf6a');
      var bot = m.h * 0.15, topw = m.h * 0.08;
      for (var i = 0; i < m.h; i++) {
        var hw = Math.round(bot + (topw - bot) * (i / m.h));
        rect(g, m.x - hw, m.base - i, hw, 1, '#f6efe2'); rect(g, m.x, m.base - i, hw + 1, 1, '#dccfb8');
      }
      for (var r = 0; r < Math.ceil(topw * 1.6); r++) rect(g, m.x - Math.round(topw) - 1 + r, m.base - m.h - r, Math.max(1, Math.round(topw) * 2 + 3 - r * 2), 1, '#c94f4f');
      rect(g, m.x - 1, m.base - Math.max(2, Math.round(m.h * 0.18)), 2, Math.max(2, Math.round(m.h * 0.18)), '#7a4a2a');
      var cols = [['#ff4d6d', '#d9304f'], ['#ffd43b', '#f0a800'], ['#ff8fc7', '#e46aa8'], ['#ff922b', '#e8700a'], ['#b197fc', '#8f6fe8']];
      var y = fy, k = 0;
      while (y < H) {
        var f = (y - fy) / Math.max(1, H - fy), bh = Math.max(1, Math.round(1 + f * H * 0.07)), gap = Math.max(1, Math.round(bh * 0.4));
        var c = cols[k % cols.length];
        for (var yy = y; yy < Math.min(H, y + bh); yy++) for (var x = 0; x < W; x++) px(g, x, yy, h2(x, yy) < 0.3 ? c[1] : c[0]);
        rect(g, 0, y + bh, W, gap, '#3f9d48');
        y += bh + gap; k++;
      }
    },
    frame: function (ctx, W, H, t, s) {
      drawClouds(ctx, W, t, s.clouds, '#ffffff', '#d6ecff');
      var m = s.mill, hx = m.x, hy = m.base - m.h + 1, L = m.h * 0.75;
      for (var b = 0; b < 4; b++) {
        var a = t * 0.9 + (b * Math.PI) / 2, ca = Math.cos(a), sa = Math.sin(a);
        for (var j = 1; j < L; j++) {
          px(ctx, hx + ca * j, hy + sa * j, '#6b4a2b');
          if (j > L * 0.25) for (var w = 1; w <= Math.max(1, Math.round(L * 0.12)); w++) px(ctx, hx + ca * j - sa * w, hy + sa * j + ca * w, (j + w) % 2 ? '#fffaf0' : '#e8dcc4');
        }
      }
      disc(ctx, hx, hy, 1, '#4a3020');
      s.bees.forEach(function (be) {
        var x = Math.round((be.x + Math.sin(t * be.sp + be.ph) * W * 0.08 + W) % W), y = Math.round(be.y + Math.sin(t * 3 * be.sp + be.ph) * 3);
        rect(ctx, x, y, 2, 1, '#ffd43b'); px(ctx, x + 1, y, '#2a2a2a');
        if (Math.floor(t * 8 + be.ph) % 2) px(ctx, x, y - 1, '#ffffff');
      });
    }
  });

  // 14. Koi Pond
  def({
    id: 'koi-pond', name: 'Koi Pond', desc: 'Hồ cá Koi nhìn từ trên, lá sen, hoa sen, gợn nước',
    palette: ['#5fd3c6', '#ff7a3d', '#ff9fc4'], dark: false,
    setup: function (W, H, rnd) {
      var s = { pads: [], koi: [], sparks: [], ripples: [] }, i, m = Math.min(W, H);
      for (i = 0; i < clamp(Math.round((W * H) / 2500), 4, 14); i++) s.pads.push([rnd() * W, rnd() * H, Math.max(2, Math.round(m * (0.04 + rnd() * 0.04))), rnd() < 0.35, rnd() * 6.28]);
      var kc = [['#ff7a3d', '#ffffff'], ['#ffffff', '#ff3d3d'], ['#ffd43b', '#ffffff'], ['#ff7a3d', '#1f1f1f'], ['#ffffff', '#ff7a3d']];
      for (i = 0; i < clamp(Math.round((W * H) / 5000), 3, 8); i++) s.koi.push({ cx: W * (0.2 + rnd() * 0.6), cy: H * (0.2 + rnd() * 0.6), rx: W * (0.15 + rnd() * 0.25), ry: H * (0.1 + rnd() * 0.25), sp: (0.15 + rnd() * 0.2) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 6.28, c: kc[i % kc.length] });
      for (i = 0; i < W * H * 0.003; i++) s.sparks.push([Math.floor(rnd() * W), Math.floor(rnd() * H), rnd() * 6.28]);
      for (i = 0; i < 4; i++) s.ripples.push({ x: rnd() * W, y: rnd() * H, per: 3 + rnd() * 3, off: rnd() * 6, r: Math.max(3, m * (0.06 + rnd() * 0.06)) });
      return s;
    },
    paint: function (g, W, H, s) {
      gradient(g, W, 0, H, ['#6fdccf', '#5fd3c6', '#4cc4bf', '#3ab0b3']);
      g.fillStyle = '#92efe2';
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (Math.sin(x * 0.35 + Math.sin(y * 0.22) * 2.2) * Math.sin(y * 0.3 + Math.sin(x * 0.17) * 2) > 0.86) g.fillRect(x, y, 1, 1);
      var st = Math.max(2, Math.round(Math.min(W, H) * 0.05));
      for (var i = 0; i < W + st; i += st * 1.6) { disc(g, i, H + st * 0.3, st, '#9aa3a8'); disc(g, i - st * 0.3, H - st * 0.1, st * 0.45, '#c3cacd'); }
      s.pads.forEach(function (p) {
        disc(g, p[0] + 1, p[1] + 1, p[2], '#2f8f8f');
        disc(g, p[0], p[1], p[2], '#3fae4a');
        disc(g, p[0] - p[2] * 0.25, p[1] - p[2] * 0.25, p[2] * 0.55, '#5fcf5f');
        for (var j = 0; j <= p[2]; j++) px(g, p[0] + Math.cos(p[4]) * j, p[1] + Math.sin(p[4]) * j, '#4cc4bf');
        if (p[3]) { disc(g, p[0] + p[2] * 0.3, p[1] - p[2] * 0.2, Math.max(1, p[2] * 0.4), '#ff9fc4'); disc(g, p[0] + p[2] * 0.3, p[1] - p[2] * 0.2, Math.max(0, p[2] * 0.2), '#ffd6e6'); px(g, p[0] + p[2] * 0.3, p[1] - p[2] * 0.2, '#ffe066'); }
      });
    },
    frame: function (ctx, W, H, t, s) {
      s.ripples.forEach(function (r) {
        var p = ((t + r.off) % r.per) / r.per, rad = p * r.r, steps = Math.ceil(rad * 6) + 4;
        ctx.globalAlpha = (1 - p) * 0.7; ctx.fillStyle = '#e6fffb';
        for (var k = 0; k < steps; k++) { var a = (k / steps) * Math.PI * 2; ctx.fillRect(Math.round(r.x + Math.cos(a) * rad), Math.round(r.y + Math.sin(a) * rad * 0.8), 1, 1); }
      });
      ctx.globalAlpha = 1;
      s.koi.forEach(function (k) {
        var seg = [];
        var step = 1.3 / Math.max(4, k.rx, k.ry);
        for (var i = 0; i < 7; i++) { var a = t * k.sp - i * step * Math.sign(k.sp) + k.ph; seg.push([k.cx + Math.cos(a) * k.rx, k.cy + Math.sin(a * 1.3) * k.ry]); }
        ctx.globalAlpha = 0.25;
        seg.forEach(function (p, i) { disc(ctx, p[0] + 2, p[1] + 2, Math.max(0, 2.2 - i * 0.35), '#1f6f7a'); });
        ctx.globalAlpha = 1;
        seg.forEach(function (p, i) { disc(ctx, p[0], p[1], Math.max(0, 2.2 - i * 0.35), (i === 1 || i === 4) ? k.c[1] : k.c[0]); });
        var tl = seg[6], pv = seg[5], dx = tl[0] - pv[0], dy = tl[1] - pv[1], dl = Math.sqrt(dx * dx + dy * dy) || 1;
        px(ctx, tl[0] + dx / dl - dy / dl, tl[1] + dy / dl + dx / dl, k.c[0]); px(ctx, tl[0] + dx / dl + dy / dl, tl[1] + dy / dl - dx / dl, k.c[0]);
      });
      ctx.fillStyle = '#ffffff';
      s.sparks.forEach(function (sp) { if (Math.sin(t * 2.2 + sp[2]) > 0.9) ctx.fillRect(sp[0], sp[1], 1, 1); });
    }
  });

  // 15. Autumn Park
  def({
    id: 'autumn-park', name: 'Autumn Park', desc: 'Công viên mùa thu, cây lá đỏ vàng, lá rơi bay',
    palette: ['#6fb8ff', '#ff8c3a', '#ffd23f'], dark: false,
    setup: function (W, H, rnd) {
      var s = { hill: terrain(rnd, W, 0.5), trees: [], leaves: [] }, i;
      s.clouds = makeClouds(rnd, W, H, Math.max(3, Math.round(W / 80)), 0.06, 0.35);
      s.base = Math.round(H * 0.8);
      var x = Math.floor(rnd() * W * 0.1), sets = [['#c8401f', '#e85d2a', '#ff9a5a'], ['#d9861a', '#f2a72e', '#ffd56a'], ['#b8322a', '#de4b3a', '#ff8a6a'], ['#c99a12', '#ecc430', '#fff07a']];
      while (x < W) { s.trees.push([x, Math.round(H * (0.18 + rnd() * 0.16)), sets[Math.floor(rnd() * sets.length)]]); x += Math.round(W * (0.1 + rnd() * 0.18)); }
      var lc = ['#e85d2a', '#f2a72e', '#ffd56a', '#de4b3a'];
      for (i = 0; i < clamp(Math.round((W * H) / 1500), 20, 140); i++) s.leaves.push({ x: rnd() * W, y: rnd() * H, vx: 3 + rnd() * 6, vy: 5 + rnd() * 8, ph: rnd() * 6.28, c: lc[Math.floor(rnd() * lc.length)] });
      return s;
    },
    paint: function (g, W, H, s) {
      gradient(g, W, 0, H, ['#5aa8ff', '#86c2ff', '#b8dcff', '#ffe8c2']);
      sun(g, W * 0.85, H * 0.15, Math.max(3, Math.min(W, H) * 0.06), '#fffbe0', '#ffe9a0');
      ridge(g, W, H, Math.round(H * 0.72), H * 0.12, s.hill, '#e6b45a');
      var amp = H * 0.04;
      ridge(g, W, H, s.base, amp, s.hill, '#c9a24a');
      for (var x = 0; x < W; x++) {
        var top = Math.round(s.base - amp * s.hill[x]);
        for (var y = top; y < H; y++) { var v = h2(x, y); if (v < 0.07) px(g, x, y, '#e85d2a'); else if (v < 0.11) px(g, x, y, '#ffd56a'); else if (v < 0.14) px(g, x, y, '#a8842e'); }
      }
      var py = Math.round(H * 0.9);
      for (var x2 = 0; x2 < W; x2++) rect(g, x2, py + Math.round(Math.sin(x2 * 0.04) * 2), 1, Math.max(2, Math.round(H * 0.04)), '#e9d6b0');
      s.trees.forEach(function (tr) {
        var top = Math.round(s.base - amp * s.hill[clamp(tr[0], 0, W - 1)]);
        roundTree(g, tr[0], top + 1, tr[1], '#6b4428', tr[2]);
      });
      var bx = Math.round(W * 0.45), bw = Math.max(4, Math.round(W * 0.06));
      rect(g, bx, py - 3, bw, 1, '#8a5a2b'); rect(g, bx, py - 1, bw, 1, '#8a5a2b'); rect(g, bx + 1, py, 1, 2, '#4a3020'); rect(g, bx + bw - 2, py, 1, 2, '#4a3020');
    },
    frame: function (ctx, W, H, t, s) {
      drawClouds(ctx, W, t, s.clouds, '#ffffff', '#ffe6cc');
      var dt = s.dt;
      s.leaves.forEach(function (p) {
        p.y += p.vy * dt; p.x += (p.vx * 0.5 + Math.sin(t * 1.6 + p.ph) * 10) * dt;
        if (p.y > H + 2) { p.y = -2; p.x = s.rand() * W; }
        if (p.x > W + 2) p.x = -2;
        ctx.fillStyle = p.c;
        var f = Math.floor(t * 3 + p.ph) % 3;
        if (f === 0) ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 1);
        else if (f === 1) ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 2);
        else ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      });
    }
  });

  // ───────────────────────── smooth (non-pixel) scenes ─────────────────────────
  // Themes with `smooth: true` render at a higher resolution with anti-aliasing and
  // are scaled with normal (bilinear) smoothing instead of `image-rendering: pixelated`.
  var TAU = Math.PI * 2;
  var RGB_CACHE = {};
  function rgba(c, a) {
    var v = RGB_CACHE[c] || (RGB_CACHE[c] = hex(c));
    return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + (+a).toFixed(3) + ')';
  }
  function mixHex(c1, c2, f) {
    var a = hex(c1), b = hex(c2);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }
  function wrap(v, m) { return ((v % m) + m) % m; }
  /** Smooth vertical gradient (no dithering). */
  function vgrad(g, W, y0, y1, colors) {
    if (y1 - y0 <= 0) return;
    var gr = g.createLinearGradient(0, y0, 0, y1);
    colors.forEach(function (c, i) { gr.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c); });
    g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0);
  }
  function circle(g, x, y, r, c) { if (c) g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); g.fill(); }
  /** Soft radial glow: `a` alpha at the centre, solid until `core` (0..1), fading to 0 at r. */
  function glow(g, x, y, r, c, a, core) {
    r = Math.max(0.5, r);
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(c, a));
    if (core) gr.addColorStop(core, rgba(c, a));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  /** Filled silhouette whose top edge is y = fn(x). */
  function silhouette(g, W, H, fn, c, step) {
    step = step || Math.max(1, W / 120);
    g.fillStyle = c; g.beginPath(); g.moveTo(0, H);
    for (var x = 0; x <= W + step; x += step) g.lineTo(x, fn(Math.min(x, W)));
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  function sines(rnd, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push([2 + rnd() * 6 * (i + 1), rnd() * TAU, 1 / (i + 1.3)]);
    return out;
  }
  function sineAt(list, f) {
    var v = 0, tot = 0;
    for (var i = 0; i < list.length; i++) { v += Math.sin(f * list[i][0] + list[i][1]) * list[i][2]; tot += list[i][2]; }
    return 0.5 + 0.5 * v / tot;
  }
  function stars(g, list, c) {
    list.forEach(function (s) { g.globalAlpha = s[3]; circle(g, s[0], s[1], s[2], c); });
    g.globalAlpha = 1;
  }
  function makeStars(rnd, W, H, n, yMax, u) {
    var out = [];
    for (var i = 0; i < n; i++) out.push([rnd() * W, rnd() * H * yMax, u * (0.12 + rnd() * rnd() * 0.35), 0.3 + rnd() * 0.7]);
    return out;
  }
  function bird(ctx, x, y, sz, flap, c) {
    var w = sz * (0.6 + 0.4 * Math.abs(flap));
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(0.6, sz * 0.18); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - sz, y - flap * sz * 0.5);
    ctx.quadraticCurveTo(x - sz * 0.4, y - w * 0.4, x, y);
    ctx.quadraticCurveTo(x + sz * 0.4, y - w * 0.4, x + sz, y - flap * sz * 0.5);
    ctx.stroke();
  }

  // 16. Aurora Mesh
  def({
    id: 'aurora-mesh', name: 'Aurora Mesh', desc: 'Gradient mềm nhiều màu loang và trôi chậm', smooth: true,
    palette: ['#0b0a1f', '#7b2ff7', '#00d4ff'], dark: true,
    setup: function (W, H, rnd) {
      var cols = ['#7b2ff7', '#f107a3', '#00d4ff', '#ff6a3d', '#3a1cff', '#00ffb3'], s = { b: [] };
      for (var i = 0; i < cols.length; i++) s.b.push({ x: 0.15 + rnd() * 0.7, y: 0.15 + rnd() * 0.7, ax: 0.15 + rnd() * 0.25, ay: 0.12 + rnd() * 0.22, w: 0.1 + rnd() * 0.15, ph: rnd() * TAU, r: 0.35 + rnd() * 0.3, c: cols[i] });
      return s;
    },
    paint: function (g, W, H) { vgrad(g, W, 0, H, ['#0b0a1f', '#140d30', '#0b0a1f']); },
    frame: function (ctx, W, H, t, s) {
      var M = Math.max(W, H);
      ctx.globalCompositeOperation = 'lighter';
      s.b.forEach(function (b) {
        var x = W * (b.x + b.ax * Math.sin(t * b.w + b.ph)), y = H * (b.y + b.ay * Math.cos(t * b.w * 0.8 + b.ph * 1.3));
        glow(ctx, x, y, M * b.r * (1 + 0.1 * Math.sin(t * 0.3 + b.ph)), b.c, 0.42);
      });
      ctx.globalCompositeOperation = 'source-over';
      if (!s.vig) {
        s.vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, M * 0.75);
        s.vig.addColorStop(0, 'rgba(5,4,15,0)'); s.vig.addColorStop(1, 'rgba(5,4,15,0.55)');
      }
      ctx.fillStyle = s.vig; ctx.fillRect(0, 0, W, H);
    }
  });

  // 17. Lava Lamp
  def({
    id: 'lava-lamp', name: 'Lava Lamp', desc: 'Những khối sáp nóng chảy nổi lên rồi chìm xuống', smooth: true,
    palette: ['#1a0526', '#ff2a68', '#ffb03a'], dark: true,
    setup: function (W, H, rnd) {
      var s = { b: [] }, cols = ['#ff5e3a', '#ff2a68', '#ffb03a', '#ff7a2f'];
      var n = 9;
      for (var i = 0; i < n; i++) s.b.push({ x: (i + 0.5) / n + (rnd() - 0.5) * 0.08, w: 0.05 + rnd() * 0.07, ph: rnd() * TAU, r: 0.07 + rnd() * 0.08, c: cols[i % cols.length], dx: 0.02 + rnd() * 0.04 });
      return s;
    },
    paint: function (g, W, H) {
      vgrad(g, W, 0, H, ['#12031c', '#2a0730', '#3d0a2e', '#1a0420']);
      glow(g, W / 2, H * 1.05, Math.max(W, H) * 0.6, '#ff4a2a', 0.25);
    },
    frame: function (ctx, W, H, t, s) {
      var m = Math.min(W, H);
      s.b.forEach(function (b) {
        var y = H * (0.52 - 0.48 * Math.sin(t * b.w + b.ph)), x = W * (b.x + b.dx * Math.sin(t * b.w * 1.7 + b.ph));
        var r = m * b.r * (1 + 0.12 * Math.sin(t * 0.7 + b.ph * 2));
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, r * 2.2, b.c, 0.12);
        ctx.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(x, y); ctx.scale(1, 1.15 + 0.15 * Math.cos(t * b.w + b.ph));
        glow(ctx, 0, 0, r, b.c, 0.95, 0.62);
        glow(ctx, -r * 0.3, -r * 0.35, r * 0.45, '#fff0c8', 0.35);
        ctx.restore();
      });
    }
  });

  // 18. Warp Speed
  def({
    id: 'warp-speed', name: 'Warp Speed', desc: 'Bay xuyên không gian, sao kéo vệt ánh sáng', smooth: true,
    palette: ['#05060f', '#1b2a6b', '#bfe3ff'], dark: true,
    setup: function (W, H, rnd) {
      var s = { st: [] }, n = clamp(Math.round((W * H) / 1500), 90, 600), cols = ['#ffffff', '#bfe3ff', '#9fb6ff', '#ffd9f2'];
      for (var i = 0; i < n; i++) s.st.push({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: 0.05 + rnd() * 0.95, c: cols[Math.floor(rnd() * cols.length)] });
      return s;
    },
    paint: function (g, W, H) {
      g.fillStyle = '#05060f'; g.fillRect(0, 0, W, H);
      glow(g, W / 2, H / 2, Math.max(W, H) * 0.55, '#1b2a6b', 0.9);
      glow(g, W * 0.3, H * 0.7, Math.max(W, H) * 0.35, '#4a1f7a', 0.35);
    },
    frame: function (ctx, W, H, t, s) {
      var cx = W / 2, cy = H / 2, k = Math.max(W, H) * 0.22, sp = 0.28 + 0.12 * Math.sin(t * 0.25), u = Math.min(W, H) / 100;
      var trail = 0.03 + sp * 0.12;
      ctx.lineCap = 'round';
      s.st.forEach(function (p) {
        p.z -= sp * s.dt;
        if (p.z <= 0.03) { p.x = s.rand() * 2 - 1; p.y = s.rand() * 2 - 1; p.z = 1; }
        var z2 = Math.min(1.2, p.z + trail);
        var x1 = cx + (p.x / p.z) * k, y1 = cy + (p.y / p.z) * k;
        if (x1 < -20 || x1 > W + 20 || y1 < -20 || y1 > H + 20) return;
        var x0 = cx + (p.x / z2) * k, y0 = cy + (p.y / z2) * k;
        ctx.strokeStyle = rgba(p.c, clamp(1.25 - p.z, 0.25, 1));
        ctx.lineWidth = Math.max(0.8, (1 - p.z) * u * 0.8);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      });
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, cx, cy, Math.min(W, H) * (0.12 + 0.03 * Math.sin(t * 1.3)), '#9fc8ff', 0.25);
      ctx.globalCompositeOperation = 'source-over';
    }
  });

  // 19. Spiral Galaxy
  def({
    id: 'galaxy', name: 'Spiral Galaxy', desc: 'Thiên hà xoắn ốc hàng nghìn ngôi sao xoay chậm', smooth: true,
    palette: ['#04030c', '#c49bff', '#fff4d6'], dark: true,
    setup: function (W, H, rnd) {
      var u = Math.min(W, H) / 100, s = { p: [], bg: makeStars(rnd, W, H, Math.round(W * H / 900), 1, u) };
      var R = Math.max(W, H) * 0.42, arms = 3, n = clamp(Math.round((W * H) / 220), 300, 2600);
      var cols = ['#fff4d6', '#ffd1a1', '#9ecbff', '#c49bff', '#ff9ed2'];
      for (var i = 0; i < n; i++) {
        var f = Math.pow(rnd(), 0.8), r = f * R, arm = Math.floor(rnd() * arms);
        var spread = (rnd() - 0.5) * (0.35 + f * 0.6) + (rnd() - 0.5) * 0.25;
        var ci = f < 0.15 ? (rnd() < 0.7 ? 0 : 1) : f < 0.35 ? Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
        s.p.push({ r: r, a: (arm / arms) * TAU + f * 5.2 + spread, ci: ci, sz: Math.max(0.8, u * (0.18 + rnd() * rnd() * 0.5)), al: 0.35 + rnd() * 0.65 });
      }
      s.p.sort(function (a, b) { return a.ci - b.ci; });
      s.cols = cols; s.R = R;
      return s;
    },
    paint: function (g, W, H, s) {
      vgrad(g, W, 0, H, ['#04030c', '#0a0720', '#04030c']);
      stars(g, s.bg, '#c8c4ff');
      glow(g, W * 0.5, H * 0.5, Math.max(W, H) * 0.45, '#3a1f6a', 0.45);
      glow(g, W * 0.35, H * 0.4, Math.max(W, H) * 0.25, '#1f3a7a', 0.3);
    },
    frame: function (ctx, W, H, t, s) {
      var cx = W / 2, cy = H / 2, tilt = -0.35, ct = Math.cos(tilt), st = Math.sin(tilt), R = s.R, cur = -1;
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < s.p.length; i++) {
        var p = s.p[i];
        if (p.ci !== cur) { cur = p.ci; ctx.fillStyle = s.cols[cur]; }
        var a = p.a + t * 0.05 / (0.25 + p.r / R);
        var x = Math.cos(a) * p.r, y = Math.sin(a) * p.r * 0.42;
        ctx.globalAlpha = p.al;
        ctx.fillRect(cx + x * ct - y * st - p.sz / 2, cy + x * st + y * ct - p.sz / 2, p.sz, p.sz);
      }
      ctx.globalAlpha = 1;
      glow(ctx, cx, cy, R * 0.2, '#ffe6b8', 0.35, 0.05);
      glow(ctx, cx, cy, R * 0.05, '#ffffff', 0.7);
      ctx.globalCompositeOperation = 'source-over';
    }
  });

  // 20. Borealis
  def({
    id: 'borealis', name: 'Borealis', desc: 'Cực quang mềm mại uốn lượn trên rặng núi tối', smooth: true,
    palette: ['#020814', '#3dffa8', '#a46bff'], dark: true,
    setup: function (W, H, rnd) {
      var u = Math.min(W, H) / 100, s = { st: makeStars(rnd, W, H, Math.round(W * H / 700), 0.6, u), m1: sines(rnd, 3), m2: sines(rnd, 4), c: [] };
      [['#3dffa8', '#2fb8ff', 0.14], ['#7dff6b', '#a46bff', 0.22], ['#2fffd0', '#ff5fd2', 0.3]].forEach(function (cc) {
        s.c.push({ c1: cc[0], c2: cc[1], base: cc[2], k1: 2 + rnd() * 3, k2: 5 + rnd() * 4, k3: 3 + rnd() * 5, sp: 0.15 + rnd() * 0.2, ph: rnd() * TAU });
      });
      s.trees = []; for (var x = 0; x < W; x += u * (1.2 + rnd() * 2.2)) s.trees.push([x, u * (3 + rnd() * 5)]);
      return s;
    },
    paint: function (g, W, H, s) {
      vgrad(g, W, 0, H, ['#020814', '#06162e', '#0d2a45', '#16384f']);
      stars(g, s.st, '#d8ecff');
      silhouette(g, W, H, function (x) { return H * (0.58 + 0.2 * (1 - sineAt(s.m1, x / W))); }, '#0a1a2a');
      silhouette(g, W, H, function (x) { return H * (0.72 + 0.14 * (1 - sineAt(s.m2, x / W))); }, '#06111d');
      var gy = H * 0.9;
      g.fillStyle = '#03080f'; g.fillRect(0, gy, W, H - gy);
      s.trees.forEach(function (tr) {
        g.beginPath(); g.moveTo(tr[0] - tr[1] * 0.28, gy + 1); g.lineTo(tr[0], gy - tr[1]); g.lineTo(tr[0] + tr[1] * 0.28, gy + 1); g.fill();
      });
    },
    frame: function (ctx, W, H, t, s) {
      var step = Math.max(2, W / 90);
      ctx.globalCompositeOperation = 'lighter';
      s.c.forEach(function (c) {
        function top(x) { var f = x / W; return H * (c.base + 0.06 * Math.sin(f * c.k1 + t * c.sp + c.ph) + 0.04 * Math.sin(f * c.k2 - t * c.sp * 0.7)); }
        function hgt(x) { var f = x / W; return H * (0.1 + 0.07 * Math.sin(f * c.k3 + t * 0.45 + c.ph)); }
        var y0 = H * (c.base - 0.1), y1 = H * (c.base + 0.28);
        var gr = ctx.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, rgba(c.c2, 0)); gr.addColorStop(0.45, rgba(c.c2, 0.18)); gr.addColorStop(0.8, rgba(c.c1, 0.5)); gr.addColorStop(1, rgba(c.c1, 0.05));
        ctx.fillStyle = gr; ctx.beginPath();
        var x;
        for (x = 0; x <= W + step; x += step) ctx.lineTo(x, top(x));
        for (x = W + step; x >= -step; x -= step) ctx.lineTo(x, top(x) + hgt(x));
        ctx.closePath(); ctx.fill();
        ctx.lineWidth = Math.max(1, step * 0.6);
        for (var i = 0; i < 26; i++) {
          var rx = wrap(h2(i, c.ph) * W + t * W * 0.01 * (i % 3 - 1), W), fl = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7 + c.ph);
          var ty = top(rx);
          ctx.strokeStyle = rgba(c.c1, 0.12 * fl);
          ctx.beginPath(); ctx.moveTo(rx, ty - H * 0.05); ctx.lineTo(rx, ty + hgt(rx)); ctx.stroke();
        }
      });
      ctx.globalCompositeOperation = 'source-over';
    }
  });

  // 21. Rainy Night
  def({
    id: 'rainy-night', name: 'Rainy Night', desc: 'Mưa đêm qua ô kính, đèn thành phố nhòe bokeh', smooth: true,
    palette: ['#0a0f1f', '#ffb35c', '#6bc5ff'], dark: true,
    setup: function (W, H, rnd) {
      var u = Math.min(W, H) / 100, s = { bk: [], rain: [], drops: [] }, i;
      var cols = ['#ffb35c', '#ff6b6b', '#ffd58a', '#6bc5ff', '#c38bff', '#ff8fc8'];
      for (i = 0; i < 46; i++) s.bk.push({ x: rnd() * W, y: H * (0.25 + rnd() * 0.75), r: u * (2.5 + rnd() * 7), c: cols[Math.floor(rnd() * cols.length)], a: 0.12 + rnd() * 0.25, ph: rnd() * TAU });
      var nr = clamp(Math.round((W * H) / 1600), 50, 320);
      for (i = 0; i < nr; i++) s.rain.push({ x: rnd() * W, y: rnd() * H, l: u * (2 + rnd() * 4), v: H * (1.1 + rnd() * 0.9) });
      var nd = clamp(Math.round((W * H) / 9000), 10, 60);
      for (i = 0; i < nd; i++) s.drops.push({ x: rnd() * W, y: rnd() * H, r: u * (0.35 + rnd() * 0.8), v: 0, ph: rnd() * 20 });
      return s;
    },
    paint: function (g, W, H, s) {
      vgrad(g, W, 0, H, ['#070b18', '#0e1428', '#191a33', '#22182e']);
      s.bk.forEach(function (b) { glow(g, b.x, b.y, b.r, b.c, b.a, 0.55); });
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100, dt = s.dt;
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < s.bk.length; i += 3) { var b = s.bk[i]; glow(ctx, b.x, b.y, b.r * 1.1, b.c, 0.1 * (0.5 + 0.5 * Math.sin(t * 0.8 + b.ph)), 0.5); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(190,210,255,0.22)'; ctx.lineWidth = Math.max(0.5, u * 0.12); ctx.beginPath();
      s.rain.forEach(function (r) {
        r.y += r.v * dt; r.x += r.v * 0.12 * dt;
        if (r.y > H + r.l) { r.y = -r.l; r.x = s.rand() * W; }
        if (r.x > W) r.x -= W;
        ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.l * 0.12, r.y - r.l);
      });
      ctx.stroke();
      s.drops.forEach(function (d) {
        var moving = Math.sin(t * 0.6 + d.ph) > 0.55;
        if (moving) d.y += H * 0.18 * dt;
        if (d.y > H + d.r * 4) { d.y = -d.r * 4; d.x = s.rand() * W; }
        ctx.strokeStyle = 'rgba(200,220,255,0.08)'; ctx.lineWidth = d.r * 0.8;
        ctx.beginPath(); ctx.moveTo(d.x, d.y - d.r * 6); ctx.lineTo(d.x, d.y); ctx.stroke();
        circle(ctx, d.x, d.y, d.r, 'rgba(170,190,240,0.22)');
        circle(ctx, d.x - d.r * 0.35, d.y - d.r * 0.35, d.r * 0.3, 'rgba(255,255,255,0.55)');
      });
    }
  });

  // 22. Fireworks
  function fwBurst(s, x, y, rnd, u) {
    var pal = [['#ff5f8f', '#ffd0e0'], ['#5fd4ff', '#e0f6ff'], ['#ffd25f', '#fff5d0'], ['#9dff6b', '#eaffd8'], ['#c08bff', '#efe0ff'], ['#ff8a3d', '#ffe2c8']];
    var c = pal[Math.floor(rnd() * pal.length)], n = 46 + Math.floor(rnd() * 40), sp = u * (16 + rnd() * 14), ring = rnd() < 0.3;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU + rnd() * 0.2, v = sp * (ring ? 0.95 + rnd() * 0.1 : 0.25 + rnd() * 0.75);
      s.sp.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 1.4 + rnd() * 0.9, c: rnd() < 0.25 ? c[1] : c[0] });
    }
    s.fl.push({ x: x, y: y, age: 0, c: c[0] });
  }
  function fwStep(s, dt, u) {
    for (var i = s.sp.length - 1; i >= 0; i--) {
      var p = s.sp[i];
      p.age += dt; p.vx *= 1 - 1.1 * dt; p.vy = p.vy * (1 - 1.1 * dt) + u * 9 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age > p.life) s.sp.splice(i, 1);
    }
    for (var j = s.fl.length - 1; j >= 0; j--) { s.fl[j].age += dt; if (s.fl[j].age > 0.5) s.fl.splice(j, 1); }
  }
  def({
    id: 'fireworks', name: 'Fireworks', desc: 'Pháo hoa rực rỡ nổ trên thành phố về đêm', smooth: true,
    palette: ['#05030f', '#ff5f8f', '#ffd25f'], dark: true,
    setup: function (W, H, rnd) {
      var u = Math.min(W, H) / 100, s = { sp: [], fl: [], rk: [], next: 0.5, st: makeStars(rnd, W, H, Math.round(W * H / 1500), 0.7, u), bld: [], win: [] };
      [[0.25, 0.4], [0.6, 0.25], [0.8, 0.45]].forEach(function (p, k) {
        fwBurst(s, W * p[0], H * p[1], rnd, u);
        for (var i = 0; i < 6 - k; i++) fwStep(s, 0.08, u);
      });
      var x = 0;
      while (x < W) {
        var w = u * (4 + rnd() * 9), h = H * (0.08 + rnd() * 0.2);
        s.bld.push([x, w, h]);
        for (var wy = H - h + u * 1.5; wy < H - u; wy += u * 2) for (var wx = x + u; wx < x + w - u; wx += u * 1.6) if (rnd() < 0.25) s.win.push([wx, wy]);
        x += w + u * rnd() * 0.6;
      }
      return s;
    },
    paint: function (g, W, H, s) {
      var u = Math.min(W, H) / 100;
      vgrad(g, W, 0, H, ['#05030f', '#0d0a26', '#1d1440', '#2b1a4a']);
      stars(g, s.st, '#e2dcff');
      g.fillStyle = '#07050f';
      s.bld.forEach(function (b) { g.fillRect(b[0], H - b[2], b[1], b[2]); });
      g.fillStyle = '#ffcf7a';
      s.win.forEach(function (w) { g.globalAlpha = 0.6; g.fillRect(w[0], w[1], u * 0.7, u * 0.9); });
      g.globalAlpha = 1;
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100, dt = s.dt, rnd = s.rand;
      s.next -= dt;
      if (s.next <= 0 && s.sp.length < 700) {
        s.next = 0.5 + rnd() * 1.1;
        s.rk.push({ x: W * (0.12 + rnd() * 0.76), y: H, vy: -H * (0.75 + rnd() * 0.3), ty: H * (0.12 + rnd() * 0.33), vx: (rnd() - 0.5) * u * 4 });
      }
      for (var i = s.rk.length - 1; i >= 0; i--) {
        var r = s.rk[i];
        r.x += r.vx * dt; r.y += r.vy * dt; r.vy += H * 0.25 * dt;
        if (r.y <= r.ty || r.vy > -H * 0.08) { fwBurst(s, r.x, r.y, rnd, u); s.rk.splice(i, 1); }
      }
      fwStep(s, dt, u);
      ctx.globalCompositeOperation = 'lighter';
      s.fl.forEach(function (f) { glow(ctx, f.x, f.y, u * 22, f.c, 0.35 * (1 - f.age / 0.5)); });
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, u * 0.5);
      s.sp.forEach(function (p) {
        var a = 1 - p.age / p.life;
        if (a < 0.35 && Math.sin(p.age * 40 + p.x) > 0.2) return;
        ctx.strokeStyle = rgba(p.c, Math.min(1, a * 1.2));
        ctx.beginPath(); ctx.moveTo(p.x - p.vx * 0.12 - 0.01, p.y - p.vy * 0.12 - u * 0.3); ctx.lineTo(p.x, p.y); ctx.stroke();
      });
      s.rk.forEach(function (r) {
        ctx.strokeStyle = 'rgba(255,220,170,0.7)';
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.vx * 0.06, r.y - r.vy * 0.06); ctx.stroke();
        circle(ctx, r.x, r.y, u * 0.45, '#fff2d8');
      });
      ctx.globalCompositeOperation = 'source-over';
    }
  });

  // 23. Jellyfish
  def({
    id: 'jellyfish', name: 'Jellyfish', desc: 'Sứa phát sáng bồng bềnh dưới đáy biển sâu', smooth: true,
    palette: ['#041d36', '#ff7ad9', '#5ff0ff'], dark: true,
    setup: function (W, H, rnd) {
      var u = Math.min(W, H) / 100, s = { j: [], snow: [], rays: [] }, i, cols = ['#ff7ad9', '#5ff0ff', '#b48cff', '#7dffc4', '#ffb36b'];
      var n = clamp(Math.round((W * H) / 45000), 4, 9);
      for (i = 0; i < n; i++) s.j.push({ x: rnd() * W, y: rnd() * H, sz: u * (4 + rnd() * 7), c: cols[i % cols.length], ph: rnd() * TAU, v: u * (2 + rnd() * 3) });
      var ns = clamp(Math.round((W * H) / 1500), 40, 300);
      for (i = 0; i < ns; i++) s.snow.push({ x: rnd() * W, y: rnd() * H, r: u * (0.1 + rnd() * 0.25), v: u * (0.5 + rnd() * 1.5), ph: rnd() * TAU });
      for (i = 0; i < 6; i++) s.rays.push([rnd() * W * 1.2 - W * 0.1, u * (3 + rnd() * 8)]);
      return s;
    },
    paint: function (g, W, H, s) {
      vgrad(g, W, 0, H, ['#0a3a62', '#062a4a', '#031a33', '#010a18']);
      s.rays.forEach(function (r) {
        var gr = g.createLinearGradient(0, 0, 0, H * 0.85);
        gr.addColorStop(0, 'rgba(160,220,255,0.12)'); gr.addColorStop(1, 'rgba(160,220,255,0)');
        g.fillStyle = gr; g.beginPath();
        g.moveTo(r[0], 0); g.lineTo(r[0] + r[1], 0); g.lineTo(r[0] + r[1] * 2.5 + H * 0.3, H * 0.85); g.lineTo(r[0] + H * 0.3, H * 0.85); g.closePath(); g.fill();
      });
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100, dt = s.dt;
      ctx.fillStyle = 'rgba(200,235,255,0.35)';
      s.snow.forEach(function (p) {
        p.y += p.v * dt; if (p.y > H) { p.y = -2; p.x = s.rand() * W; }
        ctx.fillRect(p.x + Math.sin(t * 0.5 + p.ph) * u, p.y, p.r * 2, p.r * 2);
      });
      ctx.globalCompositeOperation = 'lighter';
      s.j.forEach(function (j) {
        var p = Math.sin(t * 1.6 + j.ph), sz = j.sz;
        j.y -= j.v * (0.4 + 0.9 * Math.max(0, -p)) * dt;
        if (j.y < -sz * 5) { j.y = H + sz * 1.5; j.x = s.rand() * W; }
        var x = j.x + Math.sin(t * 0.3 + j.ph) * u * 3, y = j.y, bw = sz * (1 + 0.12 * p), bh = sz * (0.85 - 0.12 * p);
        glow(ctx, x, y, sz * 3.2, j.c, 0.14);
        ctx.lineCap = 'round';
        for (var i = 0; i < 6; i++) {
          var tx = x + ((i - 2.5) / 2.5) * bw * 0.8, L = sz * (2.2 + 0.4 * (i % 3)), sw = Math.sin(t * 2 + i * 0.9 + j.ph) * sz * 0.45;
          ctx.strokeStyle = rgba(j.c, 0.32); ctx.lineWidth = Math.max(0.4, u * 0.18);
          ctx.beginPath(); ctx.moveTo(tx, y); ctx.quadraticCurveTo(tx + sw, y + L * 0.5, tx - sw * 0.6, y + L); ctx.stroke();
        }
        ctx.strokeStyle = rgba(j.c, 0.45); ctx.lineWidth = Math.max(0.6, u * 0.5);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - Math.sin(t * 1.4 + j.ph) * sz * 0.3, y + sz, x, y + sz * 1.6); ctx.stroke();
        var gr = ctx.createRadialGradient(x, y - bh * 0.4, 0, x, y - bh * 0.2, bw * 1.1);
        gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.35, rgba(j.c, 0.55)); gr.addColorStop(1, rgba(j.c, 0.18));
        ctx.fillStyle = gr; ctx.beginPath();
        ctx.ellipse(x, y, Math.max(0.5, bw), Math.max(0.5, bh), 0, Math.PI, TAU);
        for (var k = 0; k <= 8; k++) ctx.lineTo(x + bw - (k / 8) * bw * 2, y + (k % 2 ? sz * 0.12 : 0));
        ctx.closePath(); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    }
  });

  // 24. Constellation (plexus)
  def({
    id: 'constellation', name: 'Constellation', desc: 'Mạng lưới điểm sáng nối với nhau, trôi nhẹ', smooth: true,
    palette: ['#04131f', '#5ad1ff', '#d6f6ff'], dark: true,
    setup: function (W, H, rnd) {
      var u = Math.min(W, H) / 100, s = { p: [] }, n = clamp(Math.round((W * H) / 4500), 30, 140);
      for (var i = 0; i < n; i++) { var a = rnd() * TAU, v = u * (0.8 + rnd() * 2.2); s.p.push({ x: rnd() * W, y: rnd() * H, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: u * (0.25 + rnd() * 0.35), ph: rnd() * TAU }); }
      return s;
    },
    paint: function (g, W, H) {
      vgrad(g, W, 0, H, ['#020a14', '#06182a', '#0b2238', '#081626']);
      glow(g, W * 0.25, H * 0.3, Math.max(W, H) * 0.4, '#1a4a7a', 0.35);
      glow(g, W * 0.8, H * 0.75, Math.max(W, H) * 0.35, '#3a1f6a', 0.3);
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100, D = u * 22, D2 = D * D, dt = s.dt, P = s.p, i, j;
      P.forEach(function (p) {
        p.x = wrap(p.x + p.vx * dt + D, W + 2 * D) - D; p.y = wrap(p.y + p.vy * dt + D, H + 2 * D) - D;
      });
      ctx.lineWidth = Math.max(0.5, u * 0.12);
      var buckets = [[], [], [], []];
      for (i = 0; i < P.length; i++) for (j = i + 1; j < P.length; j++) {
        var dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d2 = dx * dx + dy * dy;
        if (d2 < D2) buckets[Math.min(3, Math.floor((1 - Math.sqrt(d2) / D) * 4))].push(i, j);
      }
      buckets.forEach(function (b, k) {
        if (!b.length) return;
        ctx.strokeStyle = 'rgba(90,209,255,' + (0.08 + k * 0.13).toFixed(2) + ')';
        ctx.beginPath();
        for (var m = 0; m < b.length; m += 2) { ctx.moveTo(P[b[m]].x, P[b[m]].y); ctx.lineTo(P[b[m + 1]].x, P[b[m + 1]].y); }
        ctx.stroke();
      });
      ctx.globalCompositeOperation = 'lighter';
      P.forEach(function (p) {
        var tw = 0.6 + 0.4 * Math.sin(t * 1.5 + p.ph);
        glow(ctx, p.x, p.y, p.r * 5, '#5ad1ff', 0.18 * tw);
        circle(ctx, p.x, p.y, p.r, rgba('#d6f6ff', 0.6 + 0.4 * tw));
      });
      ctx.globalCompositeOperation = 'source-over';
    }
  });

  // 25. Silk Waves
  def({
    id: 'silk-waves', name: 'Silk Waves', desc: 'Những dải lụa neon uốn lượn mềm mại', smooth: true,
    palette: ['#0a0614', '#ff4fd8', '#2de2ff'], dark: true,
    paint: function (g, W, H) {
      vgrad(g, W, 0, H, ['#07040f', '#140a26', '#0a0614']);
      glow(g, W * 0.5, H * 0.5, Math.max(W, H) * 0.5, '#3a1460', 0.35);
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100, N = 30, step = Math.max(2, W / 70);
      if (!s.gr) {
        s.gr = ctx.createLinearGradient(0, 0, W, 0);
        s.gr.addColorStop(0, '#ff4fd8'); s.gr.addColorStop(0.5, '#7a5cff'); s.gr.addColorStop(1, '#2de2ff');
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = s.gr; ctx.lineWidth = Math.max(0.7, u * 0.2);
      for (var i = 0; i < N; i++) {
        var f = i / (N - 1), amp = H * 0.17 * (0.65 + 0.35 * Math.sin(t * 0.3 + f * 2));
        ctx.globalAlpha = 0.18 + 0.5 * Math.sin(Math.PI * f);
        ctx.beginPath();
        for (var x = -step; x <= W + step; x += step) {
          var q = x / W;
          var y = H * 0.5 + Math.sin(q * 3.2 + t * 0.45 + f * 1.6) * amp + Math.sin(q * 7.1 - t * 0.7 + f * 0.8) * H * 0.05 + (f - 0.5) * H * 0.22;
          if (x < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  });

  // 26. Snowy Night
  def({
    id: 'snowy-night', name: 'Snowy Night', desc: 'Đêm tuyết rơi, đồi trắng, căn nhà gỗ ấm áp', smooth: true,
    palette: ['#0b1630', '#dfe8f7', '#ffcf7a'], dark: true,
    setup: function (W, H, rnd) {
      var u = Math.min(W, H) / 100, s = { st: makeStars(rnd, W, H, Math.round(W * H / 1200), 0.5, u), h1: sines(rnd, 3), h2: sines(rnd, 3), h3: sines(rnd, 2), fl: [[], [], []], pines: [], smoke: [] }, i;
      [[1 / 700, 0.15, 6], [1 / 1800, 0.3, 12], [1 / 9000, 0.6, 22]].forEach(function (L, k) {
        var n = clamp(Math.round(W * H * L[0]), 10, 500);
        for (i = 0; i < n; i++) s.fl[k].push({ x: rnd() * W, y: rnd() * H, r: u * L[1] * (0.7 + rnd() * 0.6), v: u * L[2] * (0.7 + rnd() * 0.6), ph: rnd() * TAU });
      });
      for (i = 0; i < 14; i++) s.pines.push([rnd() * W, u * (4 + rnd() * 6)]);
      s.cab = [W * 0.68, u];
      for (i = 0; i < 7; i++) s.smoke.push({ o: i / 7, ph: rnd() * TAU });
      return s;
    },
    paint: function (g, W, H, s) {
      var u = Math.min(W, H) / 100;
      vgrad(g, W, 0, H, ['#070f24', '#14244a', '#2e4370', '#5a6e98']);
      stars(g, s.st, '#e8f0ff');
      glow(g, W * 0.2, H * 0.2, u * 26, '#cfe0ff', 0.25);
      circle(g, W * 0.2, H * 0.2, u * 5.5, '#f4f7ff');
      circle(g, W * 0.2 + u * 1.6, H * 0.2 + u * 1.2, u * 1.1, 'rgba(180,195,230,0.5)');
      function hill(list, base, amp) { return function (x) { return H * (base - amp * sineAt(list, x / W)); }; }
      var far = hill(s.h1, 0.72, 0.14), mid = hill(s.h2, 0.82, 0.1), near = hill(s.h3, 0.93, 0.06);
      silhouette(g, W, H, far, '#a9bad8');
      silhouette(g, W, H, mid, '#cbd8ee');
      g.fillStyle = '#1d2b45';
      s.pines.forEach(function (p) {
        var by = mid(p[0]) + u * 0.5, h = p[1];
        for (var k = 0; k < 3; k++) { var w = h * (0.42 - k * 0.1), y = by - h * k * 0.28; g.beginPath(); g.moveTo(p[0] - w, y); g.lineTo(p[0], y - h * 0.5); g.lineTo(p[0] + w, y); g.fill(); }
      });
      var cx = s.cab[0], cy = mid(cx) + u, cw = u * 9, ch = u * 5.5;
      g.fillStyle = '#4a2f2a'; g.fillRect(cx - cw / 2, cy - ch, cw, ch);
      g.fillStyle = '#3a2420'; g.fillRect(cx + cw * 0.2, cy - ch - u * 4.5, u * 1.4, u * 3);
      g.fillStyle = '#f4f8ff'; g.beginPath(); g.moveTo(cx - cw * 0.62, cy - ch + u * 0.4); g.lineTo(cx, cy - ch - u * 4); g.lineTo(cx + cw * 0.62, cy - ch + u * 0.4); g.fill();
      glow(g, cx - cw * 0.2, cy - ch * 0.5, u * 9, '#ffb84d', 0.35);
      g.fillStyle = '#ffcf7a'; g.fillRect(cx - cw * 0.3, cy - ch * 0.68, u * 2, u * 1.8);
      g.fillStyle = '#2a1a16'; g.fillRect(cx + cw * 0.12, cy - ch * 0.6, u * 1.8, ch * 0.6);
      silhouette(g, W, H, near, '#eef3fb');
      s.chim = [cx + cw * 0.2 + u * 0.7, cy - ch - u * 4.5];
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100, dt = s.dt;
      s.smoke.forEach(function (p) {
        var f = wrap(p.o + t * 0.08, 1);
        circle(ctx, s.chim[0] + Math.sin(t * 0.6 + p.ph) * u * 1.5 + f * u * 4, s.chim[1] - f * u * 14, u * (0.8 + f * 2.2), 'rgba(210,220,240,' + (0.28 * (1 - f)).toFixed(3) + ')');
      });
      s.fl.forEach(function (layer, k) {
        ctx.fillStyle = k === 0 ? 'rgba(220,232,255,0.55)' : 'rgba(255,255,255,0.85)';
        if (k < 2) ctx.beginPath();
        layer.forEach(function (f) {
          f.y += f.v * dt; f.x += Math.sin(t * 0.7 + f.ph) * f.v * 0.3 * dt;
          if (f.y > H + f.r) { f.y = -f.r; f.x = s.rand() * W; }
          if (k < 2) { ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, Math.max(0.3, f.r), 0, TAU); }
          else glow(ctx, f.x, f.y, f.r * 2.2, '#ffffff', 0.7, 0.3);
        });
        if (k < 2) ctx.fill();
      });
    }
  });

  // ── bright smooth scenes ──

  // 27. Misty Dawn
  def({
    id: 'misty-dawn', name: 'Misty Dawn', desc: 'Bình minh, núi xếp lớp trong sương, chim bay', smooth: true,
    palette: ['#b9c6f0', '#f7c9d6', '#5a4f86'], dark: false,
    setup: function (W, H, rnd) {
      var s = { L: [], fog: [], birds: [] }, i;
      for (i = 0; i < 5; i++) s.L.push(sines(rnd, 4));
      for (i = 0; i < 5; i++) s.fog.push({ x: rnd(), y: 0.55 + i * 0.08, w: 0.35 + rnd() * 0.35, sp: 0.006 + rnd() * 0.01 });
      for (i = 0; i < 5; i++) s.birds.push({ x: rnd(), y: 0.15 + rnd() * 0.25, sp: 0.02 + rnd() * 0.015, ph: rnd() * TAU, sz: 0.8 + rnd() * 0.6 });
      return s;
    },
    paint: function (g, W, H, s) {
      var u = Math.min(W, H) / 100;
      vgrad(g, W, 0, H, ['#a9b8ee', '#cfc3ea', '#f7c9d6', '#ffdcc4', '#ffe9cf']);
      glow(g, W * 0.68, H * 0.44, u * 45, '#fff1d6', 0.75);
      circle(g, W * 0.68, H * 0.44, u * 7, '#fff9ef');
      var cols = ['#d9c4e0', '#c3a9d4', '#a18bc2', '#7b6aa6', '#4f4680'];
      s.L.forEach(function (list, i) {
        var base = H * (0.55 + i * 0.1), amp = H * (0.2 - i * 0.025);
        silhouette(g, W, H, function (x) { return base - amp * sineAt(list, x / W); }, cols[i]);
        var gr = g.createLinearGradient(0, base - amp * 0.4, 0, base + H * 0.06);
        gr.addColorStop(0, 'rgba(255,236,240,0)'); gr.addColorStop(1, 'rgba(255,236,240,0.45)');
        g.fillStyle = gr; g.fillRect(0, base - amp * 0.4, W, amp * 0.4 + H * 0.06);
      });
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100;
      s.fog.forEach(function (f) {
        var w = W * f.w, x = wrap(f.x * (W + w * 2) + t * W * f.sp, W + w * 2) - w;
        ctx.save(); ctx.translate(x, H * f.y); ctx.scale(1, 0.18);
        glow(ctx, 0, 0, w, '#fff4f6', 0.4);
        ctx.restore();
      });
      s.birds.forEach(function (b) {
        var x = wrap(b.x * (W + 40) + t * W * b.sp, W + 40) - 20, y = H * b.y + Math.sin(t * 0.8 + b.ph) * u * 1.5;
        bird(ctx, x, y, u * b.sz * 1.4, Math.sin(t * 6 + b.ph), '#4f4680');
      });
    }
  });

  // 28. Cotton Candy Sky
  def({
    id: 'cotton-candy', name: 'Cotton Candy', desc: 'Trời pastel hồng tím, mây bông xốp trôi nhiều lớp', smooth: true,
    palette: ['#a8c8ff', '#ffc4e1', '#ffffff'], dark: false,
    setup: function (W, H, rnd) {
      var s = { layers: [], sp: [] }, i;
      [[0.15, 0.35, 0.6, 0.005, '#ffe3f1'], [0.3, 0.55, 0.8, 0.01, '#fff0f7'], [0.5, 0.85, 0.92, 0.018, '#ffffff']].forEach(function (L, k) {
        var cl = [], n = 3 + k;
        for (var j = 0; j < n; j++) {
          var puffs = [], m = 5 + Math.floor(rnd() * 4);
          for (var q = 0; q < m; q++) puffs.push([(q / (m - 1)) - 0.5 + (rnd() - 0.5) * 0.1, -rnd() * 0.25 * Math.sin(Math.PI * q / (m - 1)), 0.08 + rnd() * 0.08 + 0.1 * Math.sin(Math.PI * q / (m - 1))]);
          cl.push({ x: rnd(), y: L[0] + rnd() * (L[1] - L[0]), w: 0.12 + rnd() * 0.1 + k * 0.04, puffs: puffs });
        }
        s.layers.push({ cl: cl, a: L[2], sp: L[3], c: L[4] });
      });
      for (i = 0; i < 26; i++) s.sp.push([rnd(), rnd() * 0.6, rnd() * TAU]);
      return s;
    },
    paint: function (g, W, H) {
      var u = Math.min(W, H) / 100;
      vgrad(g, W, 0, H, ['#9fc0ff', '#c4c4ff', '#f0c4f0', '#ffc4e1', '#ffe0ec']);
      glow(g, W * 0.8, H * 0.2, u * 40, '#fff6e0', 0.6);
      circle(g, W * 0.8, H * 0.2, u * 6, '#fffaf0');
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100;
      s.sp.forEach(function (p) {
        var a = Math.sin(t * 1.8 + p[2]);
        if (a < 0.3) return;
        var x = p[0] * W, y = p[1] * H, r = u * 0.9 * a;
        ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.9).toFixed(2) + ')';
        ctx.fillRect(x - r, y - u * 0.1, r * 2, u * 0.2); ctx.fillRect(x - u * 0.1, y - r, u * 0.2, r * 2);
      });
      s.layers.forEach(function (L) {
        L.cl.forEach(function (c) {
          var w = W * c.w, span = W + w * 1.6, cx = wrap(c.x * span + t * W * L.sp, span) - w * 0.8, cy = H * c.y;
          ctx.globalAlpha = L.a;
          ctx.fillStyle = '#f2c3de';
          ctx.beginPath();
          c.puffs.forEach(function (p) { var x = cx + p[0] * w, y = cy + p[1] * w + w * 0.05, r = p[2] * w; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); });
          ctx.fill();
          ctx.fillStyle = L.c;
          ctx.beginPath();
          c.puffs.forEach(function (p) { var x = cx + p[0] * w, y = cy + p[1] * w, r = p[2] * w; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); });
          ctx.fill();
        });
      });
      ctx.globalAlpha = 1;
    }
  });

  // 29. Soap Bubbles
  def({
    id: 'soap-bubbles', name: 'Soap Bubbles', desc: 'Bong bóng xà phòng óng ánh cầu vồng bay lên', smooth: true,
    palette: ['#dff7f5', '#ff9ad5', '#9ad9ff'], dark: false,
    setup: function (W, H, rnd) {
      var u = Math.min(W, H) / 100, s = { b: [], bk: [] }, i, n = clamp(Math.round((W * H) / 11000), 8, 40);
      for (i = 0; i < n; i++) s.b.push({ x: rnd() * W, y: rnd() * H, r: u * (2.5 + rnd() * rnd() * 9), v: u * (3 + rnd() * 5), ph: rnd() * TAU });
      for (i = 0; i < 18; i++) s.bk.push([rnd() * W, rnd() * H, u * (4 + rnd() * 10), ['#ffd1ec', '#c9f0ff', '#fff1c4', '#d9ffd6'][i % 4]]);
      return s;
    },
    paint: function (g, W, H, s) {
      vgrad(g, W, 0, H, ['#d8f3ff', '#e6ebff', '#f6e6ff', '#ffeef4']);
      s.bk.forEach(function (b) { glow(g, b[0], b[1], b[2], b[3], 0.5, 0.5); });
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100, dt = s.dt;
      s.b.forEach(function (b) {
        b.y -= b.v * dt; b.x += Math.sin(t * 0.8 + b.ph) * u * 1.5 * dt;
        if (b.y < -b.r * 2) { b.y = H + b.r * 2; b.x = s.rand() * W; }
        var r = b.r * (1 + 0.03 * Math.sin(t * 3 + b.ph)), x = b.x + Math.sin(t * 0.6 + b.ph) * u, y = b.y;
        var fill = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        fill.addColorStop(0, 'rgba(255,255,255,0.05)'); fill.addColorStop(0.8, 'rgba(210,225,255,0.12)'); fill.addColorStop(1, 'rgba(190,170,255,0.3)');
        circle(ctx, x, y, r, fill);
        var a = t * 0.7 + b.ph, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
        var rim = ctx.createLinearGradient(x - ca, y - sa, x + ca, y + sa);
        rim.addColorStop(0, 'rgba(255,140,210,0.75)'); rim.addColorStop(0.33, 'rgba(140,210,255,0.7)'); rim.addColorStop(0.66, 'rgba(170,255,160,0.65)'); rim.addColorStop(1, 'rgba(255,220,120,0.75)');
        ctx.strokeStyle = rim; ctx.lineWidth = Math.max(0.6, r * 0.07);
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.3, r), 0, TAU); ctx.stroke();
        ctx.save(); ctx.translate(x - r * 0.42, y - r * 0.45); ctx.rotate(-0.7); ctx.scale(1, 0.55);
        circle(ctx, 0, 0, r * 0.22, 'rgba(255,255,255,0.75)');
        ctx.restore();
      });
    }
  });

  // 30. Calm Sea
  def({
    id: 'calm-sea', name: 'Calm Sea', desc: 'Biển xanh trong ngày nắng, sóng lăn tăn, hải âu', smooth: true,
    palette: ['#7ec8ff', '#2a9fd0', '#ffffff'], dark: false,
    setup: function (W, H, rnd) {
      var s = { hz: H * 0.55, w: [], gl: [], birds: [], isl: sines(rnd, 3) }, i;
      for (i = 0; i < 8; i++) s.w.push({ k: 6 + rnd() * 4 + i * 1.5, sp: 0.4 + rnd() * 0.5 + i * 0.08, ph: rnd() * TAU, k2: 13 + rnd() * 8 });
      for (i = 0; i < 40; i++) s.gl.push([rnd(), rnd(), rnd() * TAU]);
      for (i = 0; i < 3; i++) s.birds.push({ x: rnd(), y: 0.12 + rnd() * 0.22, sp: 0.015 + rnd() * 0.015, ph: rnd() * TAU });
      return s;
    },
    paint: function (g, W, H, s) {
      var u = Math.min(W, H) / 100, hz = s.hz;
      vgrad(g, W, 0, hz, ['#5fb4f5', '#8ccdff', '#c4e6ff', '#f4f6f0']);
      glow(g, W * 0.3, H * 0.22, u * 35, '#fffbe6', 0.7);
      circle(g, W * 0.3, H * 0.22, u * 6, '#fffef5');
      [[W * 0.18, 0.3], [W * 0.62, 0.45], [W * 0.86, 0.25]].forEach(function (c) { glow(g, c[0], H * c[1], u * 12, '#ffffff', 0.5, 0.4); });
      var i0 = W * 0.6, i1 = W * 0.85;
      g.fillStyle = '#7ea9c8'; g.beginPath(); g.moveTo(i0, hz);
      for (var x = i0; x <= i1; x += 2) g.lineTo(x, hz - H * 0.07 * Math.sin(Math.PI * (x - i0) / (i1 - i0)) * (0.6 + 0.4 * sineAt(s.isl, x / W)));
      g.lineTo(i1, hz); g.fill();
      vgrad(g, W, hz, H, ['#8fd8ea', '#0f5a8f']);
    },
    frame: function (ctx, W, H, t, s) {
      var u = Math.min(W, H) / 100, hz = s.hz, step = Math.max(2, W / 100), n = s.w.length;
      for (var i = 0; i < n; i++) {
        var w = s.w[i], f = i / n, y0 = hz + (H - hz) * Math.pow(f, 1.35) + u * 0.4, amp = u * (0.15 + f * 1.1);
        ctx.fillStyle = mixHex('#8fd8ea', '#11609a', Math.min(1, f + 0.1));
        ctx.beginPath(); ctx.moveTo(-step, H);
        var pts = [];
        for (var x = -step; x <= W + step; x += step) {
          var q = x / W, y = y0 + Math.sin(q * w.k - t * w.sp + w.ph) * amp + Math.sin(q * w.k2 + t * w.sp * 1.3) * amp * 0.35;
          ctx.lineTo(x, y); pts.push(x, y);
        }
        ctx.lineTo(W + step, H); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.18 + f * 0.25).toFixed(2) + ')'; ctx.lineWidth = Math.max(0.5, u * (0.1 + f * 0.25));
        ctx.beginPath();
        for (var p = 0; p < pts.length; p += 2) if (p === 0) ctx.moveTo(pts[p], pts[p + 1]); else ctx.lineTo(pts[p], pts[p + 1]);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      s.gl.forEach(function (g) {
        var a = Math.sin(t * 2.5 + g[2]);
        if (a < 0.5) return;
        var f = g[1], y = hz + (H - hz) * f * 0.7 + u, x = W * 0.3 + (g[0] - 0.5) * W * (0.08 + f * 0.35);
        ctx.globalAlpha = (a - 0.5) * 1.6; ctx.fillRect(x, y, u * (1 + f * 3), Math.max(0.5, u * 0.25));
      });
      ctx.globalAlpha = 1;
      s.birds.forEach(function (b) {
        var x = wrap(b.x * (W + 40) + t * W * b.sp, W + 40) - 20, y = H * b.y + Math.sin(t * 0.7 + b.ph) * u * 2;
        bird(ctx, x, y, u * 1.6, Math.sin(t * 4 + b.ph), '#3a5470');
      });
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
    // Smooth themes need more resolution than the pixel grid: use o.smoothSize, or 2× the grid.
    var smoothFn = o.smoothSize || function () { var z = sizeFn(); return [z[0] * 2, z[1] * 2]; };
    var W = 0, H = 0, stat = null, state = null, raf = 0, last = 0, running = false, frames = 0;
    var t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }
    function targetSize() { return theme.smooth ? smoothFn() : sizeFn(); }
    function build() {
      var sz = targetSize();
      W = Math.max(8, sz[0] | 0); H = Math.max(8, sz[1] | 0);
      canvas.width = W; canvas.height = H; ctx.imageSmoothingEnabled = !!theme.smooth;
      if (canvas.style) canvas.style.imageRendering = theme.smooth ? 'auto' : 'pixelated';
      stat = document.createElement('canvas'); stat.width = W; stat.height = H;
      var g = stat.getContext('2d');
      var base = (seed ^ hashStr(theme.id)) >>> 0;
      state = theme.setup ? theme.setup(W, H, rng(base)) : {};
      state.rand = rng(base + 99); state.lastT = null; state.dt = 0;
      theme.paint(g, W, H, state, rng(base + 7));
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    function draw(ms) {
      if (!stat) build();
      var t = animate ? (ms - t0) / 1000 : 4;
      if (state.lastT == null) state.lastT = t;
      state.dt = Math.min(0.25, Math.max(0, t - state.lastT)); state.lastT = t;
      ctx.globalAlpha = 1;
      ctx.drawImage(stat, 0, 0);
      if (theme.frame) { try { theme.frame(ctx, W, H, t, state); } finally { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } }
    }
    function loop(ms) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (typeof document !== 'undefined' && document.hidden) return;
      if (ms - last < 1000 / fps - 2) return;
      last = ms;
      if (++frames % 30 === 0) { var sz = targetSize(); if ((sz[0] | 0) !== W || (sz[1] | 0) !== H) stat = null; }
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
      size: function () { return [Math.ceil(innerWidth / ps()), Math.ceil(innerHeight / ps())]; },
      // Smooth themes: pixel size 2 → full resolution, 4 → half, 8 → quarter (quality vs CPU).
      smoothSize: function () { var k = Math.max(1, ps() / 2); return [Math.ceil(innerWidth / k), Math.ceil(innerHeight / k)]; }
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
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;' +
        'image-rendering:' + (getTheme(opts.theme).smooth ? 'auto' : 'pixelated') + ';' +
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
    version: '1.2.0',
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
