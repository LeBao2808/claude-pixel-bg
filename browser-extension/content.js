/* Claude Pixel BG — content script for claude.ai */
(function () {
  'use strict';
  var KEY = 'pixelbg';
  var P = globalThis.PixelBG;
  if (!P || window.__pixelbgMounted) return;
  window.__pixelbgMounted = true;

  var cur = Object.assign({}, P.DEFAULTS);
  var ctl = null;

  function save() { try { chrome.storage.sync.set({ [KEY]: cur }); } catch (e) { /* extension reloaded */ } }

  chrome.storage.sync.get(KEY, function (r) {
    cur = Object.assign({}, P.DEFAULTS, (r && r[KEY]) || {});
    ctl = P.mount(Object.assign({}, cur, {
      css: P.adapters.claudeWeb,
      onThemeChange: function (id) { cur.theme = id; save(); }
    }));
  });

  chrome.storage.onChanged.addListener(function (ch, area) {
    if (area !== 'sync' || !ch[KEY]) return;
    cur = Object.assign({}, P.DEFAULTS, ch[KEY].newValue || {});
    if (ctl) ctl.update(cur);
  });

  // claude.ai light/dark switch changes the --bg-* variables: rebuild the "behind" CSS.
  new MutationObserver(function () { if (ctl) ctl.update({}); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-mode'] });
})();
