/* Runs on "vscode:uninstall": remove the injected background from every Claude Code install. */
'use strict';
const path = require('path');
const patcher = require('./patcher');

for (const dir of patcher.findClaudeDirs(patcher.defaultRoots([path.dirname(__dirname)]))) {
  try { patcher.remove(dir); } catch (e) { /* best effort */ }
}
