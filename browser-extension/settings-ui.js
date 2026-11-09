/*!
 * Claude Pixel BG — settings-ui.js (shared)
 * Renders the theme picker + options. Host decides where settings are stored.
 *   PixelBGUI.render(el, settings, onChange, { footer: 'html' }) -> { set(settings) }
 */
(function (root) {
  'use strict';
  var P = root.PixelBG;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render(el, settings, onChange, extra) {
    extra = extra || {};
    var s = Object.assign({}, P.DEFAULTS, settings || {});
    var renderers = [];

    el.innerHTML =
      '<div class="pbg">' +
      '  <header class="pbg-head">' +
      '    <span class="pbg-logo" aria-hidden="true">▣</span>' +
      '    <div class="pbg-title"><b>Claude Pixel BG</b><small>Nền pixel cho Claude</small></div>' +
      '    <label class="pbg-switch" title="Bật / tắt"><input type="checkbox" data-k="enabled"><span></span></label>' +
      '  </header>' +
      '  <div class="pbg-grid" role="listbox" aria-label="Chọn background"></div>' +
      '  <div class="pbg-opts">' +
      '    <div class="pbg-row"><span>Chế độ</span><div class="pbg-seg">' +
      '      <button type="button" data-mode="behind" title="Nền nằm phía sau giao diện (đẹp nhất)">Phía sau</button>' +
      '      <button type="button" data-mode="overlay" title="Phủ mờ lên trên (dùng khi chế độ Phía sau không hiện)">Phủ lên</button>' +
      '    </div></div>' +
      '    <div class="pbg-row"><span>Cường độ</span><input type="range" min="10" max="100" step="5" data-k="intensity"><output data-o="intensity"></output></div>' +
      '    <div class="pbg-row"><span>Cỡ pixel</span><input type="range" min="2" max="8" step="1" data-k="pixelSize"><output data-o="pixelSize"></output></div>' +
      '    <div class="pbg-row"><span>Hoạt ảnh</span><label class="pbg-check"><input type="checkbox" data-k="animate"> chuyển động</label>' +
      '      <select data-k="fps" title="Khung hình / giây"><option value="8">8 fps</option><option value="12">12 fps</option><option value="24">24 fps</option></select></div>' +
      '  </div>' +
      '  <footer class="pbg-foot">' + (extra.footer || '') + '<div class="pbg-hint">Phím tắt trên trang: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> đổi nền nhanh</div></footer>' +
      '</div>';

    var grid = el.querySelector('.pbg-grid');
    P.themes.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pbg-card'; b.dataset.theme = t.id; b.setAttribute('role', 'option');
      b.title = t.desc;
      var c = document.createElement('canvas');
      b.appendChild(c);
      var name = document.createElement('span'); name.textContent = t.name;
      b.appendChild(name);
      grid.appendChild(b);
      var r = P.createRenderer(c, { theme: t.id, size: function () { return [96, 54]; }, fps: 10, animate: true });
      r.start(); renderers.push(r);
      b.addEventListener('click', function () { s.theme = t.id; sync(); emit(); });
    });

    function q(sel) { return el.querySelector(sel); }
    function emit() { onChange(Object.assign({}, s)); }
    function sync() {
      q('[data-k=enabled]').checked = !!s.enabled;
      el.querySelector('.pbg').classList.toggle('is-off', !s.enabled);
      Array.prototype.forEach.call(el.querySelectorAll('.pbg-card'), function (b) {
        var on = b.dataset.theme === s.theme;
        b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-mode]'), function (b) { b.classList.toggle('is-on', b.dataset.mode === s.mode); });
      q('[data-k=intensity]').value = Math.round(s.intensity * 100);
      q('[data-o=intensity]').textContent = Math.round(s.intensity * 100) + '%';
      q('[data-k=pixelSize]').value = s.pixelSize;
      q('[data-o=pixelSize]').textContent = s.pixelSize + 'px';
      q('[data-k=animate]').checked = !!s.animate;
      q('[data-k=fps]').value = String(s.fps);
      q('[data-k=fps]').disabled = !s.animate;
    }

    q('[data-k=enabled]').addEventListener('change', function (e) { s.enabled = e.target.checked; sync(); emit(); });
    Array.prototype.forEach.call(el.querySelectorAll('[data-mode]'), function (b) {
      b.addEventListener('click', function () { s.mode = b.dataset.mode; sync(); emit(); });
    });
    var inten = q('[data-k=intensity]');
    inten.addEventListener('input', function () { q('[data-o=intensity]').textContent = inten.value + '%'; });
    inten.addEventListener('change', function () { s.intensity = +inten.value / 100; sync(); emit(); });
    var pxs = q('[data-k=pixelSize]');
    pxs.addEventListener('input', function () { q('[data-o=pixelSize]').textContent = pxs.value + 'px'; });
    pxs.addEventListener('change', function () { s.pixelSize = +pxs.value; sync(); emit(); });
    q('[data-k=animate]').addEventListener('change', function (e) { s.animate = e.target.checked; sync(); emit(); });
    q('[data-k=fps]').addEventListener('change', function (e) { s.fps = +e.target.value; emit(); });

    sync();
    return {
      set: function (n) { s = Object.assign({}, P.DEFAULTS, n || {}); sync(); },
      destroy: function () { renderers.forEach(function (r) { r.destroy(); }); el.innerHTML = ''; }
    };
  }

  root.PixelBGUI = { render: render, esc: esc };
})(typeof globalThis !== 'undefined' ? globalThis : this);
