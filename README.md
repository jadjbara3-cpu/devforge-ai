# DevForge AI

An all-in-one AI developer workspace built with Next.js 16, TypeScript, and the Z.ai SDK. It unifies 8 AI-powered modules into a single, fast, beautifully crafted dashboard.

## Features

| Module | Description |
|--------|-------------|
| **Overview** | Dashboard home with activity feed and module cards |
| **AI Chat** | Multi-turn LLM conversations with persistent history, sessions, rename, export, regenerate |
| **Image Studio** | AI image generation (7 aspect ratios), gallery, lightbox, copy-prompt |
| **Vision Lab** | Image understanding via VLM — describe, analyze, OCR |
| **Voice Lab** | Text-to-speech (7 voices) + speech-to-text (mic recording) |
| **Web Intel** | Live web search + page reader with search history |
| **Snippet Vault** | Code snippet manager with CRUD, search, tags, favorites, import/export, language stats |
| **Task Board** | Real-time collaborative Kanban via Socket.io with drag-and-drop |

### Enhancement features
- Command Palette (Cmd+K) with number-key module navigation
- Image lightbox with keyboard navigation
- Live activity feed (recent chats, snippets, images)
- Snippet import/export (JSON)
- Keyboard shortcuts help dialog (press ?)
- Chat session switching + rename + Markdown export
- Task Board drag-and-drop + inline editing
- Copy buttons on chat code blocks and messages
- Global loading bar for async operations
- Settings panel with localStorage persistence
- Footer real-time clock
- Light/dark theme

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York)
- **Database**: Prisma ORM + SQLite
- **AI**: z-ai-web-dev-sdk (LLM, VLM, Image Gen, TTS, ASR, Web Search, Web Reader)
- **Real-time**: Socket.io mini-service (port 3003)
- **State**: React Context + localStorage
- **Animations**: Framer Motion

## Getting Started

### Prerequisites
- Node.js 18+ / Bun
- The z-ai-web-dev-sdk credentials (configured via environment)

### Installation

```bash
# Install dependencies
bun install

# Copy environment file and adjust if needed
cp .env.example .env

# Push the database schema
bun run db:push

# Start the dev server (port 3000)
bun run dev
```

### Task Board (real-time)

The Task Board uses a separate Socket.io mini-service:

```bash
cd mini-services/task-service
bun install
bun run dev   # starts on port 3003
```

The Next.js app connects to it via `io('/?XTransformPort=3003')` (routed through the Caddy gateway).

## Project Structure

```
src/
├── app/
│   ├── api/           # 17 API routes (chat, images, snippets, tts, asr, vision, web, activity)
│   ├── layout.tsx     # Root layout with providers
│   └── page.tsx       # Main dashboard (single route)
├── components/
│   ├── features/      # 8 module components
│   ├── layout/        # Sidebar, footer, command palette, settings, loading bar
│   └── ui/            # shadcn/ui components
├── hooks/             # use-hotkey, use-toast, use-mobile
└── lib/               # db (Prisma), zai (SDK singleton), utils, features

mini-services/
└── task-service/      # Socket.io Kanban backend (port 3003)

prisma/
└── schema.prisma      # Snippet, ChatMessage, GeneratedImage, BoardTask models
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K / Ctrl+K | Open command palette |
| ? | Show shortcuts dialog |
| Ctrl+, | Open settings |
| 1-8 | Jump to module |
| Arrow Left/Right | Navigate lightbox |
| Esc | Close dialogs |

## License

Private project.
