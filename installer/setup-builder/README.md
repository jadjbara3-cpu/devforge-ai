# DevForge AI - Setup.exe Builder

Create a single **`setup.exe`** file that installs DevForge AI on any Windows computer.

## Quick Start

### On any Windows machine:

1. Download this `setup-builder/` folder from GitHub
2. Double-click **`build-all.bat`**
3. Get `setup.exe` in the `output/` folder
4. Distribute `setup.exe` to anyone — they just double-click to install

That's it! The script automatically picks the best available method.

---

## Two Build Methods

### Method 1: Inno Setup (Professional — Recommended)

Creates a professional installer with:
- GUI wizard interface (Next → Next → Finish)
- Desktop shortcut option (checkbox)
- Start Menu entries
- Full uninstaller (Add/Remove Programs)
- Custom install directory selection

**Build:**
```
Double-click: build-inno-setup.bat
```
This automatically installs Inno Setup (free, one-time) and compiles `setup.exe`.

**Output:** `Output/setup.exe`

### Method 2: iexpress (Built into Windows — No install needed)

Creates a basic self-extracting installer using `iexpress` (included with Windows).

**Build:**
```
Double-click: build-setup.bat
```

**Output:** `output/setup.exe`

### Method 3: Auto (Best available)

Tries Inno Setup first, falls back to iexpress:

```
Double-click: build-all.bat
```

---

## What setup.exe Does

When a user runs `setup.exe` on their Windows computer:

1. **Checks prerequisites** — Git, Node.js, Bun
2. **Installs missing prerequisites** — automatically via `winget`
3. **Downloads DevForge AI** — from GitHub to `C:\Users\<user>\AppData\Local\DevForge_AI`
4. **Installs dependencies** — `bun install` (or `npm install`)
5. **Sets up database** — `bun run db:push`
6. **Installs Task Board service** — `mini-services/task-service/`
7. **Creates shortcuts** — Desktop + Start Menu
8. **Shows completion** — with instructions to configure AI provider

### After installation:
- Double-click **"DevForge AI"** on the Desktop → app opens at `http://localhost:3000`
- Press **`Ctrl+,`** → enter API key → Save → restart

---

## File Overview

```
setup-builder/
├── build-all.bat          # Auto: picks best method (RECOMMENDED)
├── build-inno-setup.bat   # Professional installer (Inno Setup)
├── build-setup.bat        # Basic installer (iexpress)
├── install-logic.bat      # The actual installer logic (runs inside setup.exe)
├── devforge-setup.iss     # Inno Setup script (compiled to setup.exe)
├── devforge-setup.sed     # iexpress config (alternative to build-setup.bat)
└── README.md              # This file
```

---

## Distribution

Once you have `setup.exe`:

1. **USB drive**: Copy `setup.exe` → run on any Windows PC
2. **Email/Cloud**: Send `setup.exe` → recipient double-clicks
3. **Network share**: Place on shared drive → anyone can install

**Requirements on target machine:**
- Windows 10/11 (64-bit)
- Internet connection (for downloading the project + dependencies)
- No admin rights needed (installs to user's AppData)

---

## Troubleshooting

### "winget not found"
The target machine needs Windows 10 1709+ (winget is built in). For older Windows, install prerequisites manually:
- Git: https://git-scm.com/download/win
- Node.js: https://nodejs.org/
- Then run `npm install -g bun`

### "setup.exe blocked by SmartScreen"
Click **"More info"** → **"Run anyway"**. This is normal for unsigned executables.

### Port 3000 already in use
The app uses port 3000. If it's in use, edit `package.json` in the install folder and change the port.

### DeepSeek / AI provider not configured
After installation, open the app → press `Ctrl+,` → enter your API key → Save → restart.
