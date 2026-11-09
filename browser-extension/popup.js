/* Claude Pixel BG — popup */
(function () {
  'use strict';
  var KEY = 'pixelbg';
  var footer = '<div class="pbg-status" id="st">Áp dụng ngay cho mọi tab claude.ai đang mở.</div>';
  chrome.storage.sync.get(KEY, function (r) {
    var ui = PixelBGUI.render(document.getElementById('app'), (r && r[KEY]) || {}, function (s) {
      chrome.storage.sync.set({ [KEY]: s });
    }, { footer: footer });
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area === 'sync' && ch[KEY]) ui.set(ch[KEY].newValue);
    });
  });
})();
