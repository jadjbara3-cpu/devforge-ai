import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ service: "devforge-task-service", ok: true }));
});

const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

export interface BoardTask {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in-progress" | "done";
  priority: "low" | "medium" | "high";
  assignee?: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionUser {
  id: string;
  name: string;
  color: string;
  cursor?: { column: string; taskId?: string };
}

const tasks = new Map<string, BoardTask>();
const users = new Map<string, SessionUser>();

const COLORS = [
  "emerald",
  "sky",
  "amber",
  "fuchsia",
  "violet",
  "rose",
  "teal",
  "cyan",
];
const NAMES = [
  "Falcon",
  "Comet",
  "Nova",
  "Phoenix",
  "Orion",
  "Atlas",
  "Vega",
  "Lyra",
  "Rigel",
  "Sirius",
];

const randId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function seedTasks() {
  const seed: Array<Omit<BoardTask, "id" | "createdAt" | "updatedAt">> = [
    {
      title: "Design system tokens",
      description: "Finalize color, spacing, and type tokens for v1.",
      status: "done",
      priority: "high",
      assignee: "Nova",
      color: "emerald",
    },
    {
      title: "Build AI Chat panel",
      description: "LLM integration with persistent history.",
      status: "done",
      priority: "high",
      assignee: "Orion",
      color: "sky",
    },
    {
      title: "Image Studio gallery",
      description: "7 aspect ratios + gallery + delete.",
      status: "in-progress",
      priority: "medium",
      assignee: "Vega",
      color: "fuchsia",
    },
    {
      title: "Vision Lab OCR presets",
      description: "Add 3 one-click analysis prompts.",
      status: "in-progress",
      priority: "medium",
      assignee: "Phoenix",
      color: "amber",
    },
    {
      title: "Voice Lab recording",
      description: "MediaRecorder capture + ASR transcription.",
      status: "todo",
      priority: "medium",
      assignee: "Atlas",
      color: "violet",
    },
    {
      title: "Web Intel deep-read",
      description: "Page reader with markdown rendering.",
      status: "todo",
      priority: "low",
      color: "teal",
    },
  ];
  for (const t of seed) {
    const id = randId();
    const now = Date.now();
    tasks.set(id, { ...t, id, createdAt: now, updatedAt: now });
  }
}
seedTasks();

function broadcastTasks() {
  io.emit("tasks:update", Array.from(tasks.values()));
}

io.on("connection", (socket) => {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const name = NAMES[Math.floor(Math.random() * NAMES.length)] + "-" + socket.id.slice(0, 3);
  const user: SessionUser = { id: socket.id, name, color };
  users.set(socket.id, user);

  socket.emit("hello", { user });
  socket.emit("tasks:update", Array.from(tasks.values()));
  io.emit("users:update", Array.from(users.values()));
  io.emit("presence", { user, action: "join" });

  socket.on("task:create", (data: Partial<BoardTask>) => {
    const id = randId();
    const now = Date.now();
    const task: BoardTask = {
      id,
      title: data.title?.trim() || "Untitled task",
      description: data.description?.trim() || undefined,
      status: (data.status as BoardTask["status"]) || "todo",
      priority: (data.priority as BoardTask["priority"]) || "medium",
      assignee: data.assignee?.trim() || undefined,
      color: data.color || color,
      createdAt: now,
      updatedAt: now,
    };
    tasks.set(id, task);
    io.emit("task:created", task);
    broadcastTasks();
  });

  socket.on("task:update", (data: Partial<BoardTask> & { id: string }) => {
    const existing = tasks.get(data.id);
    if (!existing) return;
    const updated: BoardTask = {
      ...existing,
      ...data,
      id: existing.id,
      updatedAt: Date.now(),
    };
    tasks.set(data.id, updated);
    io.emit("task:updated", updated);
    broadcastTasks();
  });

  socket.on("task:move", (data: { id: string; status: BoardTask["status"] }) => {
    const existing = tasks.get(data.id);
    if (!existing) return;
    const updated: BoardTask = {
      ...existing,
      status: data.status,
      updatedAt: Date.now(),
    };
    tasks.set(data.id, updated);
    io.emit("task:moved", { id: data.id, status: data.status, by: user });
    broadcastTasks();
  });

  socket.on("task:delete", (data: { id: string }) => {
    if (!tasks.has(data.id)) return;
    tasks.delete(data.id);
    io.emit("task:deleted", { id: data.id, by: user });
    broadcastTasks();
  });

  socket.on("cursor", (data: { column: string; taskId?: string }) => {
    const u = users.get(socket.id);
    if (!u) return;
    u.cursor = data;
    socket.broadcast.emit("cursor:update", { user: u, ...data });
  });

  socket.on("task:claim", (data: { id: string }) => {
    const existing = tasks.get(data.id);
    if (!existing) return;
    const updated: BoardTask = {
      ...existing,
      assignee: user.name,
      color: user.color,
      updatedAt: Date.now(),
    };
    tasks.set(data.id, updated);
    io.emit("task:updated", updated);
    broadcastTasks();
  });

  socket.on("disconnect", () => {
    users.delete(socket.id);
    io.emit("presence", { user, action: "leave" });
    io.emit("users:update", Array.from(users.values()));
  });

  socket.on("error", (err) => console.error("socket error", err));
});

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`✓ DevForge task-service (socket.io) running on port ${PORT}`);
});

process.on("SIGTERM", () => httpServer.close(() => process.exit(0)));
process.on("SIGINT", () => httpServer.close(() => process.exit(0)));
