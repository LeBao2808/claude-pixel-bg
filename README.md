# ▣ Claude Pixel BG

Animated pixel-art backgrounds for Claude, in two places:

| Where | Package | Folder |
|---|---|---|
| **claude.ai** (Chrome, Edge, Cốc Cốc, Brave…) | Browser extension (Manifest V3) | [browser-extension/](browser-extension/) |
| **Claude Code in VS Code** (also Cursor and Windsurf) | VS Code extension | [vscode-extension/](vscode-extension/) |

There are 15 scenes, all drawn in code with no image files:
- Dark: **Night City, Deep Space, Sunset Ocean, Firefly Forest, Synthwave, Aurora Peaks, Ember Rain, Deep Sea**
- Bright: **Sakura Hill, Sunny Meadow, Tropical Beach, Rainbow Sky, Tulip Field, Koi Pond, Autumn Park**
To view them all, open [preview.html](preview.html) in a browser.

## Build

You need Node.js 18 or later. The project has no npm dependencies.

```bash
node scripts/build.js     # copy shared code, create icons, package into dist/
node scripts/test.js      # run the tests
```

The build creates:
- `dist/claude-pixel-bg-1.1.0.vsix`: the VS Code extension
- `dist/claude-pixel-bg-browser-1.1.0.zip`: the browser extension

## Install on claude.ai (browser)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `browser-extension/` folder.
4. Open claude.ai, click the ▣ icon on the toolbar, and pick a scene. The change applies right away.

## Install in VS Code (Claude Code)

```bash
code --install-extension dist/claude-pixel-bg-1.1.0.vsix
```

Or: Extensions → `…` → **Install from VSIX…** → choose the file in `dist/`.

After you install it:
- A notification appears. Click **Mở gallery** ("Open gallery") to see live previews and pick a scene, then press **Reload Window**.
- The **🎨 \<scene name\>** item on the status bar opens the gallery again.
- Command Palette (`Ctrl+Shift+P`) → `Claude Pixel BG: …`: Chọn background (choose a background), Nền tiếp theo (next scene), Bật (turn on), Tắt (turn off), Áp dụng lại (apply again).
- Settings: `claudePixelBg.theme`, `mode`, `intensity`, `pixelSize`, `animate`, `fps`.

### Without installing the extension (CLI)

```bash
node vscode-extension/cli.js list
node vscode-extension/cli.js apply --theme synthwave --intensity 0.7
node vscode-extension/cli.js status
node vscode-extension/cli.js remove
```

## Options

| Option | Meaning |
|---|---|
| **Chế độ: Phía sau** (Mode: Behind) | The background sits behind the interface, and the panels become partly transparent. This looks best. |
| **Chế độ: Phủ lên** (Mode: Overlay) | A faint layer over the whole interface. Use it if claude.ai changes its CSS and Behind no longer shows the background. |
| **Cường độ** (Intensity) | How strongly the background shows (10–100%). |
| **Cỡ pixel** (Pixel size) | Size of one pixel, 2–8 px. Bigger looks blockier and uses less CPU. |
| **Hoạt ảnh** (Animation) | Turns animation on or off, at 8, 12 or 24 fps. Animation pauses automatically when the tab is hidden. |
| **Alt+Shift+B** | Switches to the next scene directly on the page or in the Claude panel. |

## How it works

- `shared/pixel-engine.js`: the shared engine. Each scene has a **static** layer, drawn once (dithered sky, mountains, buildings), and a **dynamic** layer drawn every frame (stars, snow, fish, the grid…). Both are drawn on a low-resolution canvas and scaled up with `image-rendering: pixelated`.
- **claude.ai**: the canvas sits at `z-index:-1`. The background colors from the `bg-bg-*` classes are made translucent, and the CSS variable format is checked at runtime.
- **VS Code**: Claude Code draws its UI in a webview whose colors come from the `--app-*-background` variables. The extension appends a script block between the `/*<PIXELBG-START>*/ … /*<PIXELBG-END>*/` markers at the end of `webview/index.js`:
  - It backs up the original file first, to `index.js.pixelbg.bak`.
  - It applies the block again on its own when Claude Code updates.
  - Running **Tắt** (Turn off) or uninstalling removes the block, and the file goes back to its original contents byte for byte.

## Project structure

```
claude-pixel-bg/
├── shared/              # shared engine + settings UI (source of truth)
├── browser-extension/   # MV3: manifest, content script, popup
├── vscode-extension/    # extension.js, patcher.js, cli.js, uninstall.js
├── scripts/build.js     # build + package (.vsix, .zip)
├── scripts/test.js      # patcher tests + rendering of every scene
└── preview.html         # view all the scenes
```

Edit the code in `shared/`, then run `node scripts/build.js` to copy it into both extensions.
