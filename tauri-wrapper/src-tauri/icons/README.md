# Icons

This directory holds the icon files referenced by `tauri.conf.json`. They
are NOT included in this repo because:

1. The canonical icon already lives at
   `bridge-work/installer-v2/devforge-icon.ico` (jad's original).
2. Tauri needs three specific formats at build time. We don't want to
   commit binary blobs if we can generate them on demand.

## Required files

Tauri's `build.rs` validates that every icon path in `tauri.conf.json`
exists at build time. If any are missing, `cargo tauri build` fails with
a confusing error. The three required files are:

| File              | Used for                                              |
|-------------------|-------------------------------------------------------|
| `icon.ico`        | Windows app icon (embedded in the .exe + shown by Explorer) |
| `icon.png`        | Linux/app store icon (unused on Windows but Tauri still requires it) |
| `tray-icon.png`   | System-tray icon (loaded at runtime by `tray.rs`)    |

## How to generate them

### Option A — Use the existing devforge-icon.ico (fastest)

```powershell
# 1. Copy the canonical .ico into place.
Copy-Item ..\..\installer-v2\devforge-icon.ico .\icon.ico

# 2. Use ImageMagick to extract a 512×512 PNG for icon.png + a 32×32 PNG
#    for tray-icon.png. (Adjust the path to your ImageMagick install.)
& "C:\Program Files\ImageMagick-7\magick.exe" convert .\icon.ico[0] -resize 512x512 .\icon.png
& "C:\Program Files\ImageMagick-7\magick.exe" convert .\icon.ico[0] -resize 32x32  .\tray-icon.png
```

If you don't have ImageMagick, `installer-v2/make-icon.py` already
generates PNGs from a base SVG — you can adapt that script.

### Option B — Use the Next.js PWA icons

`bridge-work/devforge-src/public/icon-192.png` and `icon-512.png` are
already on disk (created by Task 1-D). Copy them in:

```powershell
Copy-Item ..\..\devforge-src\public\icon-512.png .\icon.png
Copy-Item ..\..\devforge-src\public\icon-192.png .\tray-icon.png
```

Then generate the .ico from the PNG:

```powershell
& "C:\Program Files\ImageMagick-7\magick.exe" convert .\icon.png -define icon:auto-resize=256,128,64,48,32,16 .\icon.ico
```

### Option C — Fresh generate from the source SVG

If jad updates the logo, regenerate via `installer-v2/make-icon.py`
(which builds the existing `devforge-icon.ico`). Then re-run Option A.

## Tray-icon specifics

The tray icon is rendered at 16×16 or 32×32 by Windows depending on
DPI. Key requirements:

- **Transparency**: must have an alpha channel (RGBA PNG). JPEG won't work.
- **Single visual weight**: thin strokes disappear at 16×16. Use a
  solid silhouette if possible.
- **Brand colour**: the existing icon uses DevForge orange (#e8770e) on
  transparent — works well on both light and dark taskbars.

If you generate from the .ico, the conversion to PNG preserves alpha
correctly. If you see a black box around the icon in the tray, the
conversion lost the alpha channel — re-run with `-define png:format=png32`.

## Verifying

After generating all three files, verify with:

```powershell
Get-ChildItem .\*.ico, .\*.png | Format-Table Name, Length, LastWriteTime
```

All three should be non-zero. Then run `build\build-tauri.bat` — if the
icons are valid, the build proceeds past step [3/5].
