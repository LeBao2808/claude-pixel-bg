# Claude Pixel BG (VS Code)

Animated pixel-art backgrounds for the **Claude Code** panel in VS Code.

## How to use

- Click **🎨 \<theme name\>** in the status bar, or run `Claude Pixel BG: Mở gallery` from the Command Palette.
- Pick a scene, then press **Reload Window**.
- Inside the Claude panel, **Alt+Shift+B** switches to the next scene.

## Scenes

Night City · Deep Space · Sunset Ocean · Firefly Forest · Sakura Hill · Synthwave · Aurora Peaks · Ember Rain · Deep Sea · Sunny Meadow · Tropical Beach · Rainbow Sky · Tulip Field · Koi Pond · Autumn Park

## How it works

The extension appends a small script block to `webview/index.js` of the Claude Code extension, between the
`/*<PIXELBG-START>*/ … /*<PIXELBG-END>*/` markers. The first time it patches, it saves a backup to
`index.js.pixelbg.bak`. When Claude Code updates, the extension re-applies the patch automatically. Running
**Claude Pixel BG: Tắt** or uninstalling this extension removes the patch completely.
