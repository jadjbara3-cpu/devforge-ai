DevForge AI - Installed Successfully!
======================================

WHAT WAS INSTALLED:
  - DevForge AI application (Next.js 16 standalone build)
  - Portable Bun runtime (no system-wide install needed)
  - SQLite database (local file, no external DB needed)
  - Task Board service (Socket.io on port 3003, in-memory, auto-started)
    * Real-time Kanban board with multi-user presence
    * Runs automatically when you launch DevForge AI - no manual setup needed

LOCATIONS:
  App folder:           %LOCALAPPDATA%\DevForge_AI\app
  Runtime:              %LOCALAPPDATA%\DevForge_AI\runtime\bun.exe
  Database:             %LOCALAPPDATA%\DevForge_AI\app\prisma\db\custom.db
  Task Service folder:  %LOCALAPPDATA%\DevForge_AI\app\mini-services\task-service\
  Main server log:      %LOCALAPPDATA%\DevForge_AI\devforge-server.log
  Task service log:     %LOCALAPPDATA%\DevForge_AI\devforge-task-service.log
  Launcher (primary):   %LOCALAPPDATA%\DevForge_AI\start-devforge.vbs
  Launcher (debug):     %LOCALAPPDATA%\DevForge_AI\start-devforge.bat
  Stop helper:          %LOCALAPPDATA%\DevForge_AI\stop-devforge.vbs
  App icon:             %LOCALAPPDATA%\DevForge_AI\devforge-icon.ico
  Branded shortcut:     %LOCALAPPDATA%\DevForge_AI\DevForge AI.lnk
  AUMID registry key:   HKCU\Software\Classes\AppUserModelId\DevForge.AI.JadJbara

START MENU SHORTCUTS:
  - DevForge AI                - Launch the app (hidden servers + frameless window)
  - DevForge AI (Debug Mode)   - Launch with visible console windows (for errors)
  - Stop DevForge AI           - Force-stop both hidden servers
  - Uninstall DevForge AI      - Remove the app

HOW TO USE:
  1. Double-click "DevForge AI" on your Desktop (or Start Menu)
  2. A frameless app-like window opens automatically (no console shown)
  3. The app loads at http://localhost:3000
  4. Configure your AI provider in Settings (Ctrl+,)
  5. Open the Task Board module - it now works out of the box!

WHAT RUNS IN THE BACKGROUND:
  When you launch DevForge AI, two hidden bun.exe processes start:
    1. Main Next.js server  (port 3000) - the app itself
    2. Task Board service   (port 3003) - real-time Task Board collaboration
  Both are automatically terminated when you close the app window.

TO STOP THE APP:
  - Just close the app window - both servers stop automatically, OR
  - Run "Stop DevForge AI" from the Start Menu (if the app window is gone
    but the hidden servers are still running), OR
  - Run stop-devforge.vbs in the install folder

TO UNINSTALL:
  - Use "Add or Remove Programs" in Windows Settings
  - Or run the uninstaller from Start Menu

CONFIGURING AI PROVIDER:
  1. Open the app in your browser
  2. Press Ctrl+, (or click the gear icon)
  3. Enter your API key and Base URL
  4. Click "Save & Configure"
  5. Restart the app (close and relaunch)

SUPPORTED AI PROVIDERS:
  - Z.ai:       https://api.z.ai/api/paas/v4
  - OpenAI:     https://api.openai.com/v1
  - Anthropic:  https://api.anthropic.com/v1
  - Google AI:  https://generativelanguage.googleapis.com/v1
  - Groq:       https://api.groq.com/openai/v1
  - Ollama:     http://localhost:11434/v1

TROUBLESHOOTING:
  - Port 3000 in use? Close the other app or edit start-devforge.bat (change PORT)
  - Port 3003 in use? The Task Board will show "offline" - close the other app
  - App won't start? Use "DevForge AI (Debug Mode)" from Start Menu to see errors
  - Task Board shows "offline"? Check devforge-task-service.log in the install folder
  - Database issues? Delete app\prisma\db\custom.db and relaunch (it will be recreated)
  - Windows Firewall prompt? Click "Allow" so the Task Board service can run
    (Loopback connections to localhost always work - the firewall rule is only
    needed if you want other machines on the network to access the Task Board)
  - Taskbar shows Edge's icon instead of DevForge's?
    The AppUserModelID (AUMID) is registered during install at
    HKCU\Software\Classes\AppUserModelId\DevForge.AI.JadJbara, and start-devforge.vbs
    passes --app-user-model-id=DevForge.AI.JadJbara to Edge. If the taskbar still
    shows Edge's icon:
      1. Close all DevForge windows
      2. Run install-logic-aumid.ps1 again (in the install folder) to re-register
      3. Relaunch DevForge AI
    If you pinned the app to the taskbar BEFORE the AUMID was registered, unpin
    it and re-pin from the Start Menu shortcut (which has the AUMID stamped on it).

LOCAL LLM SUPPORT (OLLAMA):
  DevForge AI works with local models via Ollama (https://ollama.com):
    1. Install Ollama from https://ollama.com
    2. Open a terminal and pull a model:  ollama pull llama3.2
    3. Launch DevForge AI, open Settings (Ctrl+,)
    4. In either the "Complex tasks model" or "Agents model" section, choose the
       "Ollama (local)" preset from the Provider preset dropdown
    5. The app auto-detects Ollama and shows a green "Ollama running" badge with
       a dropdown of installed models. Pick one to fill the model field.
    6. Click Save. No API key is required - Ollama ignores the key field.
  Ollama runs entirely on your machine - no data leaves the computer. The OpenAI-
  compatible endpoint is http://localhost:11434/v1 (auto-filled by the preset).

DEBUG MODE:
  Use "DevForge AI (Debug Mode)" in the Start Menu to launch the app with two
  visible console windows:
    - "DevForge AI Server"    shows the main Next.js server logs (port 3000)
    - "DevForge Task Service" shows the Task Board Socket.io logs (port 3003)
  This is useful for diagnosing startup errors. Both servers still start
  automatically - the only difference is that you can see their output.

AUTHOR: Jad Jbara (jadjbara@live.com)
License: MIT
