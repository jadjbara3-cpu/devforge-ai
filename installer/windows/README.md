# DevForge AI - Windows Installer

## Quick Start (Easiest)

1. Download this entire `installer/windows/` folder to your Windows machine
2. Double-click **`quick-start.bat`**
3. Follow the prompts — the script does everything automatically

That's it! The app will be running at `http://localhost:3000`.

---

## Manual Setup Options

### Option A: Interactive Menu (Batch)

Run `install.bat` for an interactive menu:

```
install.bat
```

Choose from:
1. Check prerequisites (Git, Node.js, Bun)
2. Install Bun runtime
3. Clone DevForge AI from GitHub
4. Install dependencies
5. Configure database
6. Configure AI provider
7. Start DevForge AI
8. Run full setup (all steps automatically)

### Option B: PowerShell (Advanced)

```powershell
# Full automated setup to D:\DevForge_AI
powershell -ExecutionPolicy Bypass -File setup.ps1

# Custom directory
powershell -ExecutionPolicy Bypass -File setup.ps1 -InstallDir "C:\Projects\DevForge"

# Skip clone (use existing project)
powershell -ExecutionPolicy Bypass -File setup.ps1 -SkipClone -InstallDir "D:\DevForge_AI"
```

---

## Prerequisites

The installer will attempt to install these automatically, but you can install them manually:

| Tool | Required | Install Command | Download |
|------|----------|-----------------|----------|
| **Git** | Yes | `winget install Git.Git` | https://git-scm.com/download/win |
| **Node.js 18+** | Yes | `winget install OpenJS.NodeJS.LTS` | https://nodejs.org/ |
| **Bun** | Recommended | `npm install -g bun` | https://bun.sh/ |

---

## After Installation

### 1. Start the app
```bash
cd D:\DevForge_AI
bun run dev
```
Open `http://localhost:3000` in your browser.

### 2. Configure your AI provider
- Open the app → click the **gear icon** in the sidebar (or press `Ctrl+,`)
- Enter your **API Key** and **Base URL**
- Click **Save & Configure**
- Restart the dev server (`Ctrl+C` then `bun run dev`)

Supported providers:
| Provider | Base URL |
|----------|----------|
| Z.ai (default) | `https://api.z.ai/api/paas/v4` |
| OpenAI | `https://api.openai.com/v1` |
| Anthropic | `https://api.anthropic.com/v1` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Together AI | `https://api.together.xyz/v1` |
| Ollama (local) | `http://localhost:11434/v1` |

### 3. (Optional) Start the Task Board service
Open another terminal:
```bash
cd D:\DevForge_AI\mini-services\task-service
bun run dev
```

---

## Troubleshooting

### "bun: command not found"
Install Bun: `npm install -g bun` or `powershell -c "irm bun.sh/install.ps1 | iex"`

### Port 3000 already in use
Change the port in `package.json`:
```json
"dev": "next dev -p 3001"
```

### Database errors
Reset the database:
```bash
bun run db:reset
```

### Git clone fails (private repo)
The repo is private. Clone with your GitHub credentials:
```bash
git clone https://github.com/jadjbara3-cpu/devforge-ai.git
```
Enter your GitHub username and personal access token when prompted.

---

## File Overview

```
installer/windows/
├── quick-start.bat    # One-click setup (runs setup.ps1)
├── install.bat        # Interactive menu installer
├── setup.ps1          # PowerShell automated setup
└── README.md          # This file
```
